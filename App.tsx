import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { FileDropzone } from './components/PdfDropzone';
import { Loader } from './components/Loader';
import { ExplanationCard } from './components/ExplanationCard';
import { PdfIcon } from './components/icons/PdfIcon';
import { HwpIcon } from './components/icons/HwpIcon';
import { exportMultipleExplanationsToHwp } from './services/exportService';
import { Explanation, ExplanationMode, QnaData, ExplanationSet, UsageData, UserTier, MonthlyUsageData, UserSelection, AnalyzedProblem, CumulativeUsageData } from './types';
import * as processingService from './services/processingService';
import { useTheme } from './hooks/useTheme';
import { ThemeEditor } from './components/ThemeEditor';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, getDocs, writeBatch, addDoc, deleteDoc, where, documentId, increment, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { User, signOut } from 'firebase/auth';
import { QnaPanel } from './components/QnaPanel';
import { uploadProblemImage, uploadUiAsset } from './services/storageService';
import { HistoryPanel } from './components/HistoryPanel';
import { Footer } from './components/Footer';
import { TermsModal } from './components/TermsModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { ApiKeyErrorDisplay } from './components/ApiKeyErrorDisplay';
import { TrashIcon } from './components/icons/TrashIcon';
import { SaveIcon } from './components/icons/SaveIcon';
import { AdminHwpRequestsModal } from './components/AdminHwpRequestsModal';
import { QuestionMarkCircleIcon } from './components/icons/QuestionMarkCircleIcon';
import { fileToBase64 } from './services/fileService';
import { generateExplanationsBatch as geminiGenerateExplanations, postProcessMarkdown, detectMathProblemsFromImage } from './services/geminiService';
import { ProblemSelector } from './components/ProblemSelector';
import { TypingAnimator } from './components/TypingAnimator';
import { ToggleSwitch } from './components/ToggleSwitch';
import { useAppContext } from './contexts/AppContext';
import { AuthComponent } from './components/AuthComponent';
import { Alert } from './components/Alert';
import { DockPanel } from './components/DockPanel';

const TIER_LIMITS: { [key in UserTier]: { daily: UsageData, monthly: MonthlyUsageData } } = {
    basic: { daily: { fast: 5, dajeong: 3, quality: 1 }, monthly: { hwpExports: 3 } },
    standard: { daily: { fast: Infinity, dajeong: 3, quality: 1 }, monthly: { hwpExports: 3 } },
    premium: { daily: { fast: Infinity, dajeong: Infinity, quality: 3 }, monthly: { hwpExports: 10 } },
    pro: { daily: { fast: Infinity, dajeong: Infinity, quality: Infinity }, monthly: { hwpExports: Infinity } },
};

const getTodayDateString = () => new Date().toISOString().slice(0, 10);
const getCurrentMonthString = () => new Date().toISOString().slice(0, 7);
const newId = () => Date.now() + Math.random();

const functions = getFunctions(undefined, 'asia-northeast3');
const updateUserUsage = httpsCallable(functions, 'updateUserUsage');

export function App() {
    const { state, dispatch } = useAppContext();
    const { 
        user, isAuthenticating, isAdmin, currentSessionId, explanations, isProcessing, 
        statusMessage, error, apiKeyError, currentExplanationSetId, explanationMode 
    } = state;

    const [isHwpRequestsOpen, setIsHwpRequestsOpen] = useState(false);
    const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
    const [isSaving, setIsSaving] = useState<Set<number>>(new Set());
    const [isRetrying, setIsRetrying] = useState<Set<number>>(new Set());
    const [isRetryingRecognition, setIsRetryingRecognition] = useState<Set<number>>(new Set());
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isDockOpen, setIsDockOpen] = useState(false);
    const [explanationSets, setExplanationSets] = useState<ExplanationSet[]>([]);
    const [userTier, setUserTier] = useState<UserTier>('basic');
    const [tierLimits, setTierLimits] = useState(TIER_LIMITS.basic);
    const [usageData, setUsageData] = useState<UsageData>({ fast: 0, dajeong: 0, quality: 0 });
    const [monthlyHwpUsage, setMonthlyHwpUsage] = useState<MonthlyUsageData>({ hwpExports: 0 });
    const [cumulativeUsage, setCumulativeUsage] = useState<CumulativeUsageData>({ fast: 0, dajeong: 0, quality: 0, hwpExports: 0 });
    const [promptForMode, setPromptForMode] = useState(false);
    const [activeQna, setActiveQna] = useState<QnaData | null>(null);
    const [isTermsOpen, setIsTermsOpen] = useState(false);
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [uiAssets, setUiAssets] = useState({ dropzoneImageUrl: '' });

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [pagesForSelector, setPagesForSelector] = useState<{ image: string; pageNumber: number }[]>([]);
    const [initialProblemsForSelector, setInitialProblemsForSelector] = useState<Map<number, AnalyzedProblem[]>>(new Map());
    const [isManualSelectionMode, setIsManualSelectionMode] = useState(false);
    const [useDajeongGuidelines, setUseDajeongGuidelines] = useState(true);
    
    const renderedContentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const cancellationController = useRef<AbortController | null>(null);
    
    const { setTheme, themes } = useTheme();
    
    // Random initial theme & auto-cycle for login screen
    useEffect(() => {
        if (!user) {
            const randomIndex = Math.floor(Math.random() * themes.length);
            setTheme(themes[randomIndex]);

            const themeInterval = setInterval(() => {
                setTheme(currentTheme => {
                    const currentIndex = themes.findIndex(t => t.name === currentTheme.name);
                    const nextIndex = (currentIndex + 1) % themes.length;
                    return themes[nextIndex];
                });
            }, 10000);

            return () => clearInterval(themeInterval);
        }
    }, [user, themes, setTheme]);


    const sortedExplanations = useMemo(() => 
        [...explanations].sort((a, b) => a.problemNumber - b.problemNumber),
        [explanations]
    );

    const handleGoHome = useCallback(() => {
        if (cancellationController.current && !cancellationController.current.signal.aborted) {
            cancellationController.current.abort();
        }
        dispatch({ type: 'RESET_PROCESSING' });
        setActiveQna(null);
        setIsSelectorOpen(false);
    }, [dispatch]);

    const handleOpenQna = useCallback((data: QnaData) => setActiveQna(data), []);
    const handleCloseQna = useCallback(() => setActiveQna(null), []);

    useEffect(() => {
        renderedContentRefs.current = renderedContentRefs.current.slice(0, explanations.length);
    }, [explanations.length]);
    
    // Auth state change is now handled in AppContext, this effect can be simplified or removed
    // For now, it handles session invalidation
    useEffect(() => {
        if (user && currentSessionId) {
            const userDocRef = doc(db, "users", user.uid);
            return onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().currentSessionId !== currentSessionId) {
                    dispatch({ type: 'SET_ERROR', payload: "다른 기기에서 로그인하여 자동으로 로그아웃되었습니다." });
                    signOut(auth);
                }
            });
        }
    }, [user, currentSessionId, dispatch]);

     useEffect(() => {
        const fetchAllData = async (uid: string) => {
            const setsRef = collection(db, "explanationSets");
            const adminDocRef = doc(db, "admins", uid);
            const userDocRef = doc(db, "users", uid);
            const dailyUsageDocRef = doc(db, "users", uid, "usage", getTodayDateString());
            const monthlyUsageDocRef = doc(db, "users", uid, "monthlyUsage", getCurrentMonthString());
            const assetsDocRef = doc(db, 'settings', 'uiAssets');
            
            try {
                const results = await Promise.allSettled([
                    getDocs(query(setsRef, where("userId", "==", uid), orderBy("createdAt", "desc"))),
                    getDoc(adminDocRef),
                    getDoc(userDocRef),
                    getDoc(dailyUsageDocRef),
                    getDoc(monthlyUsageDocRef),
                    getDoc(assetsDocRef)
                ]);

                const [setsRes, adminRes, userRes, dailyUsageRes, monthlyUsageRes, assetsRes] = results;

                if (setsRes.status === 'fulfilled') setExplanationSets(setsRes.value.docs.map(d => ({ id: d.id, ...d.data() } as ExplanationSet)));
                if (adminRes.status === 'fulfilled') dispatch({ type: 'SET_IS_ADMIN', payload: adminRes.value.exists() });
                if (dailyUsageRes.status === 'fulfilled') setUsageData(dailyUsageRes.value.exists() ? dailyUsageRes.value.data() as UsageData : { fast: 0, dajeong: 0, quality: 0 });
                if (monthlyUsageRes.status === 'fulfilled') setMonthlyHwpUsage(monthlyUsageRes.value.exists() ? monthlyUsageRes.value.data() as MonthlyUsageData : { hwpExports: 0 });
                if (assetsRes.status === 'fulfilled') setUiAssets(prev => ({...prev, dropzoneImageUrl: assetsRes.value.exists() ? assetsRes.value.data().dropzoneImageUrl : ''}));

                if (userRes.status === 'rejected') throw userRes.reason;
                
                const userSnap = userRes.value;
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const tier = (userData.tier || 'basic') as UserTier;
                    setUserTier(tier);
                    setTierLimits(TIER_LIMITS[tier] || TIER_LIMITS.basic);
                    setCumulativeUsage(userData.cumulativeUsage || { fast: 0, dajeong: 0, quality: 0, hwpExports: 0 });
                } else {
                    throw new Error("User document not found.");
                }

            } catch (e) {
                console.error("Error fetching essential user data:", e);
                dispatch({ type: 'SET_ERROR', payload: "사용자 데이터를 불러오는 데 실패했습니다." });
            }
        };

        if (user) {
            dispatch({ type: 'SET_ERROR', payload: null });
            fetchAllData(user.uid);
        } else {
            dispatch({ type: 'SET_IS_ADMIN', payload: false });
        }
    }, [user, dispatch]);
    
    const loadExplanationSet = useCallback(async (setId: string) => {
        handleGoHome();
        dispatch({ type: 'START_PROCESSING', payload: "해설 세트를 불러오는 중..." });
        try {
            const q = query(collection(db, "explanationSets", setId, "explanations"), orderBy("problemNumber", "asc"));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) throw new Error("불러올 해설이 없습니다.");
            
            const loaded = querySnapshot.docs.map(d => ({ ...d.data(), id: newId(), docId: d.id } as Explanation));
            dispatch({ type: 'SET_EXPLANATIONS', payload: loaded });
            dispatch({ type: 'SET_CURRENT_EXPLANATION_SET_ID', payload: setId });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '해설 세트를 불러오는 데 실패했습니다.' });
        } finally {
            dispatch({ type: 'STOP_PROCESSING' });
        }
    }, [handleGoHome, dispatch]);

    const handleLoadSet = useCallback(async (setId: string) => {
        if (explanations.some(exp => !exp.docId) && !window.confirm("저장되지 않은 해설이 있습니다. 저장하지 않은 내용은 사라집니다. 정말로 다른 해설을 불러오시겠습니까?")) return;
        setIsHistoryOpen(false); 
        await loadExplanationSet(setId);
    }, [explanations, loadExplanationSet]);
    
    const handleCancelProcessing = useCallback(() => {
        if (cancellationController.current) {
            cancellationController.current.abort();
            dispatch({ type: 'SET_STATUS_MESSAGE', payload: '해설 생성을 취소하는 중...' });
            setTimeout(() => dispatch({ type: 'STOP_PROCESSING' }), 2000);
        }
    }, [dispatch]);

    const startGeneration = async (initialExplanations: Explanation[], useGuidelines: boolean) => {
        if (!user || !explanationMode) return;
        
        const remainingUsage = tierLimits.daily[explanationMode] - (usageData[explanationMode] || 0);
        if (initialExplanations.length > remainingUsage) {
            const modeLabel = { fast: '빠른해설', dajeong: '표준해설', 'quality': '전문해설' }[explanationMode];
            dispatch({ type: 'SET_ERROR', payload: `'${modeLabel}' 모드의 오늘 사용량을 초과했습니다. (${initialExplanations.length}개 필요, ${remainingUsage}개 남음)` });
            dispatch({ type: 'STOP_PROCESSING' });
            return;
        }

        const userDocRef = doc(db, "users", user.uid);
        const usageDocRef = doc(db, "users", user.uid, "usage", getTodayDateString());
        
        const batch = writeBatch(db);
        batch.set(usageDocRef, { [explanationMode]: increment(initialExplanations.length) }, { merge: true });
        batch.set(userDocRef, { cumulativeUsage: { [explanationMode]: increment(initialExplanations.length) } }, { merge: true });
        await batch.commit();

        setUsageData(prev => ({ ...prev, [explanationMode]: (prev[explanationMode] || 0) + initialExplanations.length }));
        setCumulativeUsage(prev => ({...prev, [explanationMode]: (prev[explanationMode] || 0) + initialExplanations.length }));

        await processingService.generateExplanations(initialExplanations, explanationMode, useGuidelines, {
            setStatusMessage: (msg) => dispatch({ type: 'SET_STATUS_MESSAGE', payload: msg }),
            onUpdateExplanation: (updated) => dispatch({ type: 'UPDATE_EXPLANATION', payload: updated }),
        }, cancellationController.current!.signal);

        if (cancellationController.current!.signal.aborted) return;
        
        dispatch({ type: 'SET_STATUS_MESSAGE', payload: '모든 해설 생성이 완료되었습니다.' });
        setTimeout(() => dispatch({ type: 'SET_STATUS_MESSAGE', payload: null }), 3000);
    };

    const processFilesAndMaybeSelect = async (files: File[], startSelection: boolean) => {
        if (!files.length || !user) return;
    
        if (!explanationMode) {
            setPromptForMode(true);
            setTimeout(() => setPromptForMode(false), 2500);
            return;
        }
    
        handleGoHome();
        dispatch({ type: 'START_PROCESSING', payload: '파일 처리 시작...' });
        cancellationController.current = new AbortController();
        const signal = cancellationController.current.signal;
    
        try {
            const newSetTitle = files.length > 1
                ? `${files[0].name} 외 ${files.length - 1}개`
                : files[0]?.name || `${new Date().toLocaleDateString('ko-KR')} 해설`;
    
            const newSetRef = await addDoc(collection(db, "explanationSets"), {
                userId: user.uid,
                title: newSetTitle,
                createdAt: serverTimestamp(),
                explanationCount: 0,
            });
            const newSetId = newSetRef.id;
            dispatch({ type: 'SET_CURRENT_EXPLANATION_SET_ID', payload: newSetId });
    
            setExplanationSets(prev => [{
                id: newSetId,
                userId: user.uid,
                title: newSetTitle,
                createdAt: { toDate: () => new Date() },
                explanationCount: 0
            }, ...prev]);
    
            const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS_MESSAGE', payload: msg });
            const allPageImages = await processingService.getAllPageImages(files, setStatus);
            if (signal.aborted) { dispatch({ type: 'STOP_PROCESSING' }); return; }
    
            if (startSelection) {
                setPagesForSelector(allPageImages);
                setInitialProblemsForSelector(new Map());
                setIsSelectorOpen(true);
                dispatch({ type: 'STOP_PROCESSING' });
            } else {
                let allInitialProblems = new Map<number, AnalyzedProblem[]>();
                for (const [i, pageData] of allPageImages.entries()) {
                    if (signal.aborted) { dispatch({ type: 'STOP_PROCESSING' }); return; }
                    setStatus(`페이지 ${i + 1}/${allPageImages.length} AI 분석 중...`);
                    const analyzedProblemsOnPage = await processingService.analyzePage(pageData);
                    allInitialProblems.set(pageData.pageNumber, analyzedProblemsOnPage);
                }
    
                if (signal.aborted) { dispatch({ type: 'STOP_PROCESSING' }); return; }
    
                const analyzedProblems = Array.from(allInitialProblems.values()).flat();
                if (analyzedProblems.length === 0) {
                    dispatch({ type: 'SET_ERROR', payload: "해적 AI가 이미지에서 문제를 찾지 못했습니다." });
                    dispatch({ type: 'STOP_PROCESSING' });
                    return;
                }
                const initialExplanations = await processingService.createInitialExplanations(analyzedProblems, analyzedProblems.length, 0);
                dispatch({ type: 'SET_EXPLANATIONS', payload: initialExplanations });
                await startGeneration(initialExplanations, useDajeongGuidelines);
                dispatch({ type: 'STOP_PROCESSING' });
            }
        } catch (err) {
            if (cancellationController.current?.signal.aborted) return;
            const errorMessage = err instanceof Error ? err.message : '파일 처리 중 알 수 없는 오류가 발생했습니다.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            dispatch({ type: 'STOP_PROCESSING' });
        }
    };
    
    const handleConfirmSelections = async (selections: UserSelection[]) => {
        setIsSelectorOpen(false);
        if (selections.length === 0) { handleGoHome(); return; }
        
        dispatch({ type: 'START_PROCESSING', payload: "선택한 문제로 해설 준비 중..." });
        cancellationController.current = new AbortController();

        try {
            const initialExplanations = await processingService.createExplanationsFromUserSelections(selections, pagesForSelector);
            dispatch({ type: 'SET_EXPLANATIONS', payload: initialExplanations });
            await startGeneration(initialExplanations, useDajeongGuidelines);
        } catch (err) {
            dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : '선택한 문제 처리 중 오류 발생' });
        } finally {
             if (!cancellationController.current?.signal.aborted) {
                dispatch({ type: 'STOP_PROCESSING' });
             }
        }
    };

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (isProcessing || isSelectorOpen) return;
            const files = Array.from(event.clipboardData?.items || []).map(item => item.getAsFile()).filter(Boolean) as File[];
            if (files.length > 0) processFilesAndMaybeSelect(files, isManualSelectionMode);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isProcessing, isSelectorOpen, explanationMode, isManualSelectionMode, useDajeongGuidelines]);

    const handleBackOrEscape = useCallback(() => {
        if (isDockOpen) { setIsDockOpen(false); return; }
        if (isSelectorOpen) { setIsSelectorOpen(false); handleGoHome(); return; }
        if (isHwpRequestsOpen) { setIsHwpRequestsOpen(false); return; }
        if (isThemeEditorOpen) { setIsThemeEditorOpen(false); return; }
        if (isHistoryOpen) { setIsHistoryOpen(false); return; }
        if (isTermsOpen) { setIsTermsOpen(false); return; }
        if (isPrivacyOpen) { setIsPrivacyOpen(false); return; }
        if (activeQna) { handleCloseQna(); return; }
        if (isProcessing) { handleCancelProcessing(); return; }
        if (explanations.length > 0 && !isProcessing) { handleGoHome(); return; }
    }, [
        isDockOpen, isSelectorOpen, isHwpRequestsOpen, isThemeEditorOpen,
        isHistoryOpen, isTermsOpen, isPrivacyOpen, activeQna, isProcessing,
        explanations.length, handleGoHome, handleCloseQna, handleCancelProcessing
    ]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleBackOrEscape();
            }
        };

        const handlePopState = () => {
            if (user) {
                handleBackOrEscape();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [handleBackOrEscape, user]);

    useEffect(() => {
        const isCancellableStateActive = 
            isDockOpen || isSelectorOpen || isHwpRequestsOpen || isThemeEditorOpen || 
            isHistoryOpen || isTermsOpen || isPrivacyOpen || !!activeQna || 
            isProcessing || (explanations.length > 0 && !isProcessing);

        if (isCancellableStateActive) {
            if (window.history.state?.source !== 'haejeok-app-state') {
                window.history.pushState({ source: 'haejeok-app-state' }, '');
            }
        }
    }, [
        isDockOpen, isSelectorOpen, isHwpRequestsOpen, isThemeEditorOpen, 
        isHistoryOpen, isTermsOpen, isPrivacyOpen, activeQna, 
        isProcessing, explanations
    ]);


    const handleSaveExplanation = useCallback(async (id: number) => {
        if (isSaving.has(id) || !user) return;
        setIsSaving(prev => new Set(prev).add(id));
        const explanationToSave = explanations.find(e => e.id === id);
        if (!explanationToSave || explanationToSave.docId) {
            setIsSaving(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
            return;
        }

        try {
            let setId = currentExplanationSetId;
            if (!setId) {
                const newSetRef = await addDoc(collection(db, "explanationSets"), { userId: user.uid, title: `${new Date().toLocaleDateString('ko-KR')} 해설`, createdAt: serverTimestamp(), explanationCount: 0 });
                setId = newSetRef.id;
                dispatch({ type: 'SET_CURRENT_EXPLANATION_SET_ID', payload: setId });
                setExplanationSets(prev => [{ id: setId, userId: user.uid, title: `${new Date().toLocaleDateString('ko-KR')} 해설`, createdAt: { toDate: () => new Date() }, explanationCount: 0 }, ...prev]);
            }

            const finalImage = explanationToSave.problemImage.startsWith('data:image') ? await uploadProblemImage(user.uid, explanationToSave.problemImage) : explanationToSave.problemImage;
            const dataForFirestore = { markdown: explanationToSave.markdown, pageNumber: explanationToSave.pageNumber, problemNumber: explanationToSave.problemNumber, problemImage: finalImage, originalProblemText: explanationToSave.originalProblemText, problemBody: explanationToSave.problemBody, problemType: explanationToSave.problemType, choices: explanationToSave.choices, coreConcepts: explanationToSave.coreConcepts || [], difficulty: explanationToSave.difficulty ?? null, variationProblem: explanationToSave.variationProblem === undefined ? null : explanationToSave.variationProblem, isGolden: explanationToSave.isGolden || false, bbox: explanationToSave.bbox };

            const docRef = doc(collection(db, "explanationSets", setId, "explanations"));
            await setDoc(docRef, dataForFirestore);
            await setDoc(doc(db, "explanationSets", setId), { explanationCount: increment(1) }, { merge: true });

            dispatch({ type: 'UPDATE_EXPLANATION', payload: { ...explanationToSave, docId: docRef.id, problemImage: finalImage } });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `해설 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}` });
        } finally {
            setIsSaving(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
        }
    }, [explanations, currentExplanationSetId, user, isSaving, dispatch]);

    const handleDeleteExplanation = useCallback(async (id: number) => {
        const expToDelete = explanations.find(e => e.id === id);
        if (!expToDelete) return;
        dispatch({ type: 'DELETE_EXPLANATION', payload: id });
        if (expToDelete.docId && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, "explanationSets", currentExplanationSetId, "explanations", expToDelete.docId));
                batch.update(doc(db, "explanationSets", currentExplanationSetId), { explanationCount: increment(-1) });
                await batch.commit();
            } catch (error) {
                dispatch({ type: 'SET_ERROR', payload: "해설 삭제에 실패했습니다." });
                dispatch({ type: 'ADD_EXPLANATIONS', payload: [expToDelete] }); // Re-add on failure
            }
        }
    }, [explanations, currentExplanationSetId, dispatch]);
    
    const handleDeleteSet = async (setId: string) => {
        try {
            await deleteDoc(doc(db, "explanationSets", setId));
            setExplanationSets(prev => prev.filter(s => s.id !== setId));
            if (currentExplanationSetId === setId) handleGoHome();
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: "해설 세트 삭제에 실패했습니다." });
        }
    };
    
    const handleRetryExplanation = useCallback(async (id: number) => {
        if (!user || isRetrying.has(id)) return;
        const currentMode = explanationMode;
        if (!currentMode) { setPromptForMode(true); setTimeout(() => setPromptForMode(false), 2500); return; }

        const expToRetry = explanations.find(e => e.id === id);
        if (!expToRetry) return;

        setIsRetrying(prev => new Set(prev).add(id));
        dispatch({ type: 'UPDATE_EXPLANATION', payload: { ...expToRetry, isLoading: true, isError: false, markdown: '해설을 다시 생성하는 중...' }});

        try {
            const results = await geminiGenerateExplanations([expToRetry.originalProblemText], currentMode, useDajeongGuidelines);
            const result = results[0];
            
            if (result) {
                const processedMarkdown = postProcessMarkdown(result.explanation);
                const failureKeywords = ["풀이를 제공할 수 없", "해설을 생성할 수 없", "풀 수 없", "답변할 수 없"];
                if (!processedMarkdown || failureKeywords.some(keyword => processedMarkdown.includes(keyword))) throw new Error("AI가 이 문제에 대한 해설 생성을 거부했습니다.");
                
                dispatch({ type: 'UPDATE_EXPLANATION', payload: { ...expToRetry, markdown: processedMarkdown, coreConcepts: result.coreConcepts, difficulty: result.difficulty, isLoading: false, isError: false }});
            } else {
                throw new Error("AI가 유효하지 않은 응답을 반환했습니다.");
            }
        } catch (err) {
            const errorMessage = "파도가 거셉니다! 해설 다시쓰기 버튼을 눌러주세요";
            dispatch({ type: 'UPDATE_EXPLANATION', payload: { ...expToRetry, isLoading: false, isError: true, markdown: errorMessage }});
        } finally {
            setIsRetrying(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
        }
    }, [user, isRetrying, explanationMode, explanations, useDajeongGuidelines, dispatch]);

    const handleRetryRecognition = useCallback(async (id: number) => {
        if (isRetryingRecognition.has(id)) return;
    
        const expToRetry = explanations.find(e => e.id === id);
        if (!expToRetry) return;
    
        setIsRetryingRecognition(prev => new Set(prev).add(id));
        
        try {
            const croppedImageBase64 = await processingService.cropImage(expToRetry.problemImage, expToRetry.bbox);
            const results = await detectMathProblemsFromImage(croppedImageBase64);
    
            if (!results || results.length === 0) throw new Error("파도가 거셉니다! 문제 다시쓰기 버튼을 눌러주세요");
    
            const firstResult = results[0];
            const newOriginalText = firstResult.problemBody + (firstResult.choices ? `\n${firstResult.choices}` : '');
    
            dispatch({ type: 'UPDATE_EXPLANATION', payload: { ...expToRetry, problemBody: firstResult.problemBody, problemType: firstResult.problemType, choices: firstResult.choices, originalProblemText: newOriginalText, problemNumber: firstResult.problemNumber ? parseInt(firstResult.problemNumber.replace(/[^0-9]/g, ''), 10) : expToRetry.problemNumber }});
        } catch (err) {
            dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : '문제 재인식 중 오류가 발생했습니다.' });
        } finally {
            setIsRetryingRecognition(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
        }
    }, [explanations, isRetryingRecognition, dispatch]);


    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    
    const toggleSelection = (id: number) => {
        setSelectedIds(prev => { const newSet = new Set(prev); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; });
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        const expsToDelete = explanations.filter(e => selectedIds.has(e.id));
        const savedExpsToDelete = expsToDelete.filter(e => e.docId && currentExplanationSetId);
        
        dispatch({ type: 'DELETE_MANY_EXPLANATIONS', payload: selectedIds });
        setSelectedIds(new Set());
        
        if (savedExpsToDelete.length > 0 && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                savedExpsToDelete.forEach(exp => exp.docId && batch.delete(doc(db, "explanationSets", currentExplanationSetId, "explanations", exp.docId)));
                batch.update(doc(db, "explanationSets", currentExplanationSetId), { explanationCount: increment(-savedExpsToDelete.length) });
                await batch.commit();
            } catch (error) {
                dispatch({ type: 'SET_ERROR', payload: "선택한 해설 삭제에 실패했습니다." });
                dispatch({ type: 'ADD_EXPLANATIONS', payload: expsToDelete });
            }
        }
    };
    
    const handleSaveSelected = useCallback(async () => {
        const unsavedSelected = explanations.filter(exp => selectedIds.has(exp.id) && !exp.docId);
        if (unsavedSelected.length === 0) return alert("선택된 해설 중 새로 저장할 항목이 없습니다.");
        dispatch({ type: 'START_PROCESSING', payload: `${unsavedSelected.length}개 해설 저장 중...` });
        try {
            await Promise.all(unsavedSelected.map(exp => handleSaveExplanation(exp.id)));
            dispatch({ type: 'SET_STATUS_MESSAGE', payload: `${unsavedSelected.length}개 해설 저장 완료!` });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: "선택한 해설을 저장하는 중 오류가 발생했습니다." });
        } finally {
            setTimeout(() => dispatch({ type: 'STOP_PROCESSING' }), 3000);
        }
    }, [selectedIds, explanations, handleSaveExplanation, dispatch]);

    const handleHwpRequest = async () => {
        if (!user || selectedIds.size === 0) return;
    
        const remainingExports = tierLimits.monthly.hwpExports - monthlyHwpUsage.hwpExports;
        if (remainingExports < selectedIds.size) {
            alert(`이번 달 HWP 내보내기 횟수가 부족합니다. (남은 횟수: ${remainingExports}회, 선택된 개수: ${selectedIds.size}개)`);
            return;
        }

        const selectedExplanations = explanations.filter(exp => selectedIds.has(exp.id)).sort((a, b) => a.problemNumber - b.problemNumber);
    
        dispatch({ type: 'START_PROCESSING', payload: `${selectedExplanations.length}개 해설 HWP 변환 중...` });
    
        try {
            await exportMultipleExplanationsToHwp(selectedExplanations);
            await updateUserUsage({ type: 'hwpExport', count: selectedExplanations.length });
            setMonthlyHwpUsage(prev => ({ ...prev, hwpExports: prev.hwpExports + selectedExplanations.length }));
            setCumulativeUsage(prev => ({ ...prev, hwpExports: (prev.hwpExports || 0) + selectedExplanations.length }));
            dispatch({ type: 'SET_STATUS_MESSAGE', payload: "HWP 파일 다운로드가 시작되었습니다." });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : "HWP 파일 생성 또는 사용량 기록에 실패했습니다." });
        } finally {
            setTimeout(() => dispatch({ type: 'STOP_PROCESSING' }), 3000);
        }
    };
    
    const handleUiAssetUpload = async (assetName: 'dropzoneImage', file: File) => {
        dispatch({ type: 'START_PROCESSING', payload: "UI 이미지 업로드 중..." });
        try {
            const base64String = await fileToBase64(file, { convertToJpeg: true, maxWidth: 512 });
            const downloadURL = await uploadUiAsset(assetName, base64String);
            await setDoc(doc(db, 'settings', 'uiAssets'), { dropzoneImageUrl: downloadURL }, { merge: true });
            setUiAssets(prev => ({...prev, dropzoneImageUrl: downloadURL}));
            dispatch({ type: 'SET_STATUS_MESSAGE', payload: "이미지 업로드 및 적용 완료!" });
        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : 'UI 이미지 업로드에 실패했습니다.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            throw new Error(errorMessage);
        } finally {
            setTimeout(() => dispatch({ type: 'STOP_PROCESSING' }), 3000);
        }
    };

    const handleLogout = () => signOut(auth).catch(err => console.error("Logout failed:", err));

    if (isAuthenticating) return <div className="w-full h-screen flex items-center justify-center"><Loader status="사용자 정보 확인 중..." /></div>;

    const modes: { id: ExplanationMode, label: string, title: string }[] = [
        { id: 'fast', label: '빠른해설', title: '빠른 해설을 위한 해석의 ai 를 활용합니다.' },
        { id: 'dajeong', label: '표준해설', title: '속도와 품질을 챙기기 위한 균형잡힌 해적의 ai를 활용합니다.' },
        { id: 'quality', label: '전문해설', title: '복잡한 문제와 엄격한 강령준수를 위한 해적의 고급형 ai 를 활용합니다.' },
    ];
    
    const activeColorClass: Record<ExplanationMode, string> = { fast: 'bg-blue-600 text-white', dajeong: 'bg-red-600 text-white', quality: 'bg-gold text-black' };
    const getRemaining = (mode: ExplanationMode) => { const limit = tierLimits.daily[mode]; const used = usageData[mode] || 0; return limit === Infinity ? '∞' : Math.max(0, limit - used); };
    const remainingHwpExports = tierLimits.monthly.hwpExports === Infinity ? '∞' : Math.max(0, tierLimits.monthly.hwpExports - monthlyHwpUsage.hwpExports);

    if (isSelectorOpen) {
        return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                <ProblemSelector pages={pagesForSelector} initialProblems={initialProblemsForSelector} onConfirm={handleConfirmSelections} onCancel={handleGoHome} />
            </div>
        );
    }
    
    return (
        <div className="min-h-screen flex flex-col bg-background text-text-primary">
            {!user ? (
                 <div className="flex-grow flex flex-col">
                    <div className="flex-grow w-full flex flex-col lg:flex-row items-center justify-center p-4 gap-8 lg:gap-16">
                        <div className="w-full max-w-sm">
                            <AuthComponent appError={error} />
                        </div>
                        <div className="w-full max-w-xs lg:max-w-md min-w-0">
                            <TypingAnimator />
                        </div>
                    </div>
                    <Footer onOpenTerms={() => setIsTermsOpen(true)} onOpenPrivacy={() => setIsPrivacyOpen(true)} />
                </div>
            ) : (
                <>
                    <Header user={user} isAdmin={isAdmin} onGoHome={handleGoHome} onOpenThemeEditor={() => setIsThemeEditorOpen(true)} onOpenHistory={() => setIsHistoryOpen(true)} onLogout={handleLogout} onOpenHwpRequests={() => setIsHwpRequestsOpen(true)} onOpenDock={() => setIsDockOpen(true)} />
                    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 flex-grow">
                        {apiKeyError && <ApiKeyErrorDisplay message={apiKeyError} />}
                        {error && !apiKeyError && <Alert type="danger" message={error} onClose={() => dispatch({ type: 'SET_ERROR', payload: null })} />}
                        
                        <div className="w-full flex flex-col lg:flex-row gap-8">
                            <div className="flex-1 min-w-0">
                                {isProcessing && explanations.length === 0 && <div className="flex justify-center my-12"><Loader status={statusMessage || '처리 중...'} onCancel={handleCancelProcessing} /></div>}
                                
                                {explanations.length === 0 && !isProcessing && !apiKeyError && (
                                    <div className="max-w-5xl mx-auto">
                                        <div className="flex flex-col md:flex-row items-start gap-4">
                                            <div className="flex-grow w-full">
                                                <FileDropzone onFileProcess={(files) => processFilesAndMaybeSelect(files, isManualSelectionMode)} dropzoneImageUrl={uiAssets.dropzoneImageUrl} disabled={!explanationMode} onDisabledClick={() => { setPromptForMode(true); setTimeout(() => setPromptForMode(false), 2500); }} />
                                            </div>
                                            <div className="flex-shrink-0 w-full md:w-64 flex flex-col gap-2">
                                                <div className="relative w-full">
                                                    <div className={`flex flex-col md:flex-nowrap items-stretch bg-surface p-1 rounded-lg border border-primary transition-all duration-300 ${promptForMode ? 'animate-pulse-red-border' : ''}`}>
                                                        {modes.map(mode => {
                                                            const remaining = getRemaining(mode.id);
                                                            const isExhausted = remaining === 0;
                                                            const isActive = explanationMode === mode.id;
                                                            return (
                                                                <button key={mode.id} onClick={() => dispatch({ type: 'SET_EXPLANATION_MODE', payload: mode.id })} disabled={isProcessing} className={`w-full text-left px-3 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap relative flex justify-between items-center gap-2 ${ isActive ? activeColorClass[mode.id] : 'bg-transparent text-text-secondary hover:bg-primary/50' } disabled:opacity-50 disabled:cursor-not-allowed`} title={`${mode.title}\n오늘 남은 횟수: ${remaining}`}>
                                                                    <span>{mode.label}</span>
                                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ isExhausted ? 'bg-danger text-white' : isActive ? `bg-white ${mode.id === 'quality' ? 'text-black' : 'text-accent'}` : 'bg-primary text-text-secondary' }`}>
                                                                        {remaining}
                                                                    </span>
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                    {promptForMode && (
                                                        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-danger text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-lg whitespace-nowrap z-20">
                                                            해설 AI를 골라주세요!
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-danger"></div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="bg-surface p-3 rounded-lg border border-primary">
                                                    <div className="flex items-center justify-between w-full">
                                                      <label htmlFor="manual-selection-toggle" className="text-sm font-semibold text-text-primary cursor-pointer">
                                                          문제 직접 고르기
                                                      </label>
                                                      <ToggleSwitch isOn={isManualSelectionMode} handleToggle={() => setIsManualSelectionMode(!isManualSelectionMode)} id="manual-selection-toggle" />
                                                    </div>
                                                </div>
                                                 <div className="bg-surface p-3 rounded-lg border border-primary">
                                                    <div className="flex items-center justify-between w-full">
                                                        <label htmlFor="dajeong-guidelines-toggle" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary cursor-pointer">
                                                            다정해설강령
                                                            <div className="relative group/tooltip"><QuestionMarkCircleIcon />
                                                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap z-10">다정북스의 친절한 해설을 만나볼 수 있습니다<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div></div>
                                                            </div>
                                                        </label>
                                                        <ToggleSwitch isOn={useDajeongGuidelines} handleToggle={() => setUseDajeongGuidelines(!useDajeongGuidelines)} id="dajeong-guidelines-toggle" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {explanations.length > 0 && (
                                    <div className="w-full px-4 md:px-0" style={{ maxWidth: '800px', margin: '0 auto' }}>
                                        <div className="bg-surface p-4 rounded-lg mb-6 border border-primary flex flex-col sm:flex-row justify-between items-center gap-4">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={isSelectionMode} onChange={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedIds(new Set()); }} className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent" />
                                                    <span className="font-semibold">선택</span>
                                                </label>
                                                <div className={`flex items-center gap-4 flex-wrap transition-opacity duration-300 ${isSelectionMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                                    <button onClick={() => setSelectedIds(new Set(explanations.map(e => e.id)))} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-accent hover:text-white transition-colors">전체 선택</button>
                                                    <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-primary transition-colors">선택 해제</button>
                                                    <span className="text-sm text-text-secondary">{selectedIds.size}/{explanations.length}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center flex-wrap justify-center sm:justify-end gap-3">
                                                <div className={`flex items-center gap-3 transition-all duration-300 ${isSelectionMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                                    <button onClick={handleSaveSelected} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"><SaveIcon /> 선택 저장</button>
                                                    <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-danger/20 text-danger rounded-md hover:bg-danger/30 disabled:opacity-50"><TrashIcon/> 선택 삭제</button>
                                                </div>
                                                <button onClick={handleHwpRequest} disabled={!isSelectionMode || selectedIds.size === 0} className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary hover:border-accent disabled:opacity-50 group">
                                                    <span className="relative flex items-center gap-2"><HwpIcon /> 한글로 내보내기 ({remainingHwpExports})</span>
                                                    <div className="relative group/tooltip ml-1.5"><QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap z-10">이번 달 남은 횟수: {remainingHwpExports}회. 등급별 월간 사용량이 제한됩니다.<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div></div>
                                                    </div>
                                                </button>
                                                <button disabled className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary opacity-50 cursor-not-allowed group">
                                                    <span className="relative flex items-center gap-2"><PdfIcon /> PDF로 내보내기</span>
                                                     <div className="relative group/tooltip ml-1.5"><QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap z-10">준비중입니다<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div></div>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid gap-6">
                                            {sortedExplanations.map((exp, index) => (
                                                <ExplanationCard
                                                    key={exp.id}
                                                    id={`exp-card-${exp.id}`}
                                                    explanation={exp}
                                                    index={index}
                                                    totalCards={sortedExplanations.length}
                                                    onDelete={handleDeleteExplanation}
                                                    onSave={handleSaveExplanation}
                                                    onRetry={handleRetryExplanation}
                                                    isSaving={isSaving.has(exp.id)}
                                                    isRetrying={isRetrying.has(exp.id)}
                                                    setRenderedContentRef={(el) => { renderedContentRefs.current[index] = el; }}
                                                    isSelectionMode={isSelectionMode}
                                                    isSelected={selectedIds.has(exp.id)}
                                                    onSelect={toggleSelection}
                                                    onOpenQna={handleOpenQna}
                                                    isAdmin={isAdmin}
                                                    onSaveToCache={() => {}}
                                                    onRetryRecognition={handleRetryRecognition}
                                                    isRetryingRecognition={isRetryingRecognition.has(exp.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {explanations.length > 0 && (
                                <div className="w-full lg:w-80 lg:flex-shrink-0">
                                    <div className="lg:sticky top-1/2 lg:-translate-y-1/2">
                                        <QnaPanel data={activeQna} onClose={handleCloseQna} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                    <Footer onOpenTerms={() => setIsTermsOpen(true)} onOpenPrivacy={() => setIsPrivacyOpen(true)} />
                </>
            )}
            
            {isAdmin && <AdminHwpRequestsModal isOpen={isHwpRequestsOpen} onClose={() => setIsHwpRequestsOpen(false)} />}
            <ThemeEditor isOpen={isThemeEditorOpen} onClose={() => setIsThemeEditorOpen(false)} />
            <DockPanel isOpen={isDockOpen} onClose={() => setIsDockOpen(false)} user={user} />
            <HistoryPanel isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} sets={explanationSets} onLoadSet={handleLoadSet} onDeleteSet={handleDeleteSet} user={user} userTier={userTier} usageData={usageData} tierLimits={tierLimits.daily} monthlyHwpUsage={monthlyHwpUsage} monthlyHwpLimit={tierLimits.monthly.hwpExports} cumulativeUsage={cumulativeUsage} isAdmin={isAdmin} onUiAssetUpload={handleUiAssetUpload} />
            <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
        </div>
    );
}