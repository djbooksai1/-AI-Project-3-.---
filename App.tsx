

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { GuidelinesModal } from './components/GuidelinesModal';
import { FileDropzone } from './components/PdfDropzone';
import { Loader } from './components/Loader';
import { ExplanationCard } from './components/ExplanationCard';
import { PdfIcon } from './components/icons/PdfIcon';
import { HwpIcon } from './components/icons/HwpIcon';
import { exportToPdf, exportToHtml } from './services/exportService';
import { Explanation, ExplanationMode, QnaData, ExplanationSet, UsageData, UserTier, HwpExplanationData } from './types';
import { getProcessingService } from './services/processingService';
import { useTheme } from './hooks/useTheme';
import { ThemeEditor } from './components/ThemeEditor';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, getDocs, writeBatch, addDoc, deleteDoc, where, documentId, increment, onSnapshot } from 'firebase/firestore';
import { 
    User,
    onAuthStateChanged,
    signOut,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    ConfirmationResult
} from 'firebase/auth';
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
import { formatMathEquations, generateExplanationsBatch, postProcessMarkdown } from './services/geminiService';

const AuthComponent = ({ appError }: { appError: string | null }) => {
    const [error, setError] = useState('');
    const [phoneNumber, setPhoneNumber] = useState(localStorage.getItem('lastPhoneNumber') || '');
    const [verificationCode, setVerificationCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    
    const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
    const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

    const displayError = appError || error;

    useEffect(() => {
        if (recaptchaContainerRef.current && !recaptchaVerifierRef.current) {
            const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
                'size': 'invisible',
                'callback': () => {},
                'expired-callback': () => {
                    setError('reCAPTCHA 인증이 만료되었습니다. 다시 시도해주세요.');
                }
            });
            verifier.render();
            recaptchaVerifierRef.current = verifier;
        }
    }, []);

    const handleSendCode = async () => {
        setError('');
        if (!phoneNumber.match(/^01[0-9]{8,9}$/)) {
            setError('올바른 휴대폰 번호 10자리 또는 11자리를 입력해주세요 (예: 01012345678).');
            return;
        }
        
        localStorage.setItem('lastPhoneNumber', phoneNumber);
        setIsSendingCode(true);

        try {
            const appVerifier = recaptchaVerifierRef.current;
             if (!appVerifier) {
                setError('reCAPTCHA를 초기화하지 못했습니다. 페이지를 새로고침하고 다시 시도해주세요.');
                setIsSendingCode(false);
                return;
            }
            const formattedPhoneNumber = `+82${phoneNumber.substring(1)}`;
            const result = await signInWithPhoneNumber(auth, formattedPhoneNumber, appVerifier);
            setConfirmationResult(result);
            setIsCodeSent(true);
        } catch (err) {
            console.error(err);
            const firebaseError = err as { code?: string; message: string };
            if (firebaseError.code === 'auth/invalid-phone-number') {
                setError('잘못된 형식의 휴대폰 번호입니다.');
            } else {
                 setError(firebaseError.message || '인증번호 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
            }
        } finally {
            setIsSendingCode(false);
        }
    };

    const handleConfirmCode = async () => {
        setError('');
        if (!confirmationResult) {
            setError('인증 절차에 문제가 발생했습니다. 처음부터 다시 시도해주세요.');
            return;
        }
        if (verificationCode.length !== 6) {
             setError('6자리 인증번호를 정확히 입력해주세요.');
            return;
        }
        
        try {
            await confirmationResult.confirm(verificationCode);
        } catch (err) {
             const firebaseError = err as { code?: string; message: string };
             if (firebaseError.code === 'auth/invalid-verification-code') {
                setError('인증번호가 올바르지 않습니다.');
             } else {
                setError(firebaseError.message || '로그인에 실패했습니다. 다시 시도해주세요.');
             }
        }
    };

    return (
        <div className="flex-grow flex items-center justify-center w-full p-4">
            <div className="w-full max-w-sm">
                <div className="bg-surface p-8 rounded-2xl shadow-lg border border-primary text-center">
                    <div className="mb-6">
                        <h2 className="text-6xl font-black text-accent">해.적</h2>
                    </div>
                    <div className="mb-4">
                        <p className="text-2xl font-bold text-accent">: 해설을, 적다.</p>
                    </div>
                    <p className="text-sm text-text-secondary mb-6">
                        대한민국 최고의 문제풀이 및 해설작성 서비스
                    </p>
                    
                    <div className="space-y-4">
                        {!isCodeSent ? (
                            <>
                                <input 
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="휴대폰 번호 ('-' 제외)"
                                    className="w-full p-3 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent outline-none text-center"
                                    maxLength={11}
                                />
                                <button
                                    onClick={handleSendCode}
                                    disabled={isSendingCode}
                                    className="w-full py-3 px-4 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
                                >
                                    {isSendingCode ? '전송 중...' : '인증번호 받기'}
                                </button>
                            </>
                        ) : (
                            <>
                                <input 
                                    type="number"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value)}
                                    placeholder="인증번호 6자리"
                                    className="w-full p-3 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent outline-none text-center"
                                    maxLength={6}
                                />
                                <button
                                    onClick={handleConfirmCode}
                                    className="w-full py-3 px-4 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover transition-colors"
                                >
                                    로그인
                                </button>
                                <button onClick={() => { setIsCodeSent(false); setError(''); }} className="text-sm text-text-secondary hover:underline">
                                    번호 다시 입력하기
                                </button>
                            </>
                        )}
                    </div>
                    {displayError && <p className="text-sm text-center text-danger mt-4">{displayError}</p>}
                    <div id="recaptcha-container" ref={recaptchaContainerRef} className="flex justify-center mt-4"></div>
                </div>
            </div>
        </div>
    );
};

const TIER_LIMITS: { [key in UserTier]: UsageData } = {
    basic: { fast: 5, dajeong: 3, quality: 1 },
    standard: { fast: Infinity, dajeong: 3, quality: 1 },
    premium: { fast: Infinity, dajeong: Infinity, quality: 3 },
    pro: { fast: Infinity, dajeong: Infinity, quality: Infinity },
};

const getTodayDateString = () => new Date().toISOString().slice(0, 10);
const newId = () => Date.now() + Math.random();

const isApiConfigError = (message: string): boolean => {
    const lowerCaseMessage = message.toLowerCase();
    const keywords = [
        'permission', 
        'api key',
        'billing',
        'api has not been used',
        'enable the api',
        'not enabled',
        '핵심 ai 지침', // Custom error from getPrompt
    ];
    return keywords.some(keyword => lowerCaseMessage.includes(keyword));
};

export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [guidelines, setGuidelines] = useState('');
    const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
    const [isHwpRequestsOpen, setIsHwpRequestsOpen] = useState(false);
    const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [explanations, setExplanations] = useState<Explanation[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentExplanationSetId, setCurrentExplanationSetId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<Set<number>>(new Set());
    const [isRetrying, setIsRetrying] = useState<Set<number>>(new Set());
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [explanationSets, setExplanationSets] = useState<ExplanationSet[]>([]);
    const [userTier, setUserTier] = useState<UserTier>('basic');
    const [tierLimits, setTierLimits] = useState<UsageData>(TIER_LIMITS.basic);
    const [usageData, setUsageData] = useState<UsageData>({ fast: 0, dajeong: 0, quality: 0 });
    const [explanationMode, setExplanationMode] = useState<ExplanationMode | null>(null);
    const [promptForMode, setPromptForMode] = useState(false);
    const [activeQna, setActiveQna] = useState<QnaData | null>(null);
    const [isTermsOpen, setIsTermsOpen] = useState(false);
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [uiAssets, setUiAssets] = useState({ dropzoneImageUrl: '' });
    
    const renderedContentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const cancellationController = useRef<AbortController | null>(null);
    
    const sortedExplanations = useMemo(() => 
        [...explanations].sort((a, b) => a.problemNumber - b.problemNumber),
        [explanations]
    );

    const handleGoHome = useCallback(() => {
        if (cancellationController.current && !cancellationController.current.signal.aborted) {
            cancellationController.current.abort();
        }
        setExplanations([]);
        setError(null);
        setApiKeyError(null);
        setStatusMessage(null);
        setIsProcessing(false);
        setActiveQna(null);
        setCurrentExplanationSetId(null);
    }, []);

    const handleOpenQna = useCallback((data: QnaData) => setActiveQna(data), []);
    const handleCloseQna = useCallback(() => setActiveQna(null), []);

    useEffect(() => {
        renderedContentRefs.current = renderedContentRefs.current.slice(0, explanations.length);
    }, [explanations.length]);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                const newSessionId = `${Date.now()}-${Math.random()}`;
                setCurrentSessionId(newSessionId);
                const userDoc = await getDoc(userDocRef);
                const updateData: { [key: string]: any } = { currentSessionId: newSessionId };

                if (!userDoc.exists()) {
                    let formattedPhoneNumber = currentUser.phoneNumber;
                    if (formattedPhoneNumber?.startsWith('+82')) {
                        formattedPhoneNumber = '0' + formattedPhoneNumber.substring(3);
                    }
                    updateData.phoneNumber = formattedPhoneNumber;
                    updateData.createdAt = serverTimestamp();
                    updateData.tier = 'basic';
                }
                
                await setDoc(userDocRef, updateData, { merge: true });
                setUser(currentUser);
            } else {
                setUser(null);
                setCurrentSessionId(null);
                handleGoHome();
            }
            setIsAuthenticating(false);
        });
        return () => unsubscribe();
    }, [handleGoHome]);

    useEffect(() => {
        if (user && currentSessionId) {
            const userDocRef = doc(db, "users", user.uid);
            return onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().currentSessionId !== currentSessionId) {
                    setError("다른 기기에서 로그인하여 자동으로 로그아웃되었습니다.");
                    signOut(auth);
                }
            });
        }
    }, [user, currentSessionId]);

     useEffect(() => {
        const fetchAllData = async (uid: string) => {
            const guidelinesDocRef = doc(db, 'settings', 'guidelines');
            const setsRef = collection(db, "explanationSets");
            const adminDocRef = doc(db, "admins", uid);
            const userDocRef = doc(db, "users", uid);
            const usageDocRef = doc(db, "users", uid, "usage", getTodayDateString());
            const assetsDocRef = doc(db, 'settings', 'uiAssets');
            
            try {
                const [guidelinesSnap, setsQuery, adminSnap, userSnap, usageSnap, assetsSnap] = await Promise.all([
                    getDoc(guidelinesDocRef),
                    getDocs(query(setsRef, where("userId", "==", uid), orderBy("createdAt", "desc"))),
                    getDoc(adminDocRef),
                    getDoc(userDocRef),
                    getDoc(usageDocRef),
                    getDoc(assetsDocRef)
                ]);

                setGuidelines(guidelinesSnap.exists() ? guidelinesSnap.data().content : '');
                setExplanationSets(setsQuery.docs.map(d => ({ id: d.id, ...d.data() } as ExplanationSet)));
                setIsAdmin(adminSnap.exists());
                if (userSnap.exists()) {
                    const tier = (userSnap.data().tier || 'basic') as UserTier;
                    setUserTier(tier);
                    setTierLimits(TIER_LIMITS[tier] || TIER_LIMITS.basic);
                }
                setUsageData(usageSnap.exists() ? usageSnap.data() as UsageData : { fast: 0, dajeong: 0, quality: 0 });
                setUiAssets(prev => ({...prev, dropzoneImageUrl: assetsSnap.exists() ? assetsSnap.data().dropzoneImageUrl : ''}));

            } catch (e) {
                console.error("Error fetching user data:", e);
                setError("사용자 데이터를 불러오는 데 실패했습니다.");
            }
        };

        if (user) fetchAllData(user.uid);
        else setIsAdmin(false);
    }, [user]);
    
    const loadExplanationSet = useCallback(async (setId: string) => {
        handleGoHome();
        setIsProcessing(true);
        setStatusMessage("해설 세트를 불러오는 중...");
        try {
            const q = query(collection(db, "explanationSets", setId, "explanations"), orderBy("problemNumber", "asc"));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) throw new Error("불러올 해설이 없습니다.");
            
            const loaded = querySnapshot.docs.map(d => ({ ...d.data(), id: newId(), docId: d.id } as Explanation));
            setExplanations(loaded);
            setCurrentExplanationSetId(setId);
        } catch (error) {
            setError(error instanceof Error ? error.message : '해설 세트를 불러오는 데 실패했습니다.');
        } finally {
            setIsProcessing(false);
            setStatusMessage(null);
        }
    }, [handleGoHome]);

    const handleLoadSet = useCallback(async (setId: string) => {
        if (explanations.some(exp => !exp.docId) && !window.confirm("저장되지 않은 해설이 있습니다. 저장하지 않은 내용은 사라집니다. 정말로 다른 해설을 불러오시겠습니까?")) return;
        setIsHistoryOpen(false); 
        await loadExplanationSet(setId);
    }, [explanations, loadExplanationSet]);
    
    const handleCancelProcessing = useCallback(() => {
        if (cancellationController.current) {
            cancellationController.current.abort();
            setStatusMessage('해설 생성을 취소하는 중...');
            setIsProcessing(false);
            setExplanations(prev => prev.filter(exp => !exp.isLoading));
            setTimeout(() => setStatusMessage(null), 2000);
        }
    }, []);

    const handleFileProcess = async (files: File[]) => {
        if (!files.length || !user) return;
        const currentMode = explanationMode;
        if (!currentMode) {
            setPromptForMode(true);
            setTimeout(() => setPromptForMode(false), 2500);
            return;
        }

        handleGoHome();
        setIsProcessing(true);
        cancellationController.current = new AbortController();
        const signal = cancellationController.current.signal;

        try {
            const service = getProcessingService();
            const allPageImages = await service.getAllPageImages(files, setStatusMessage);

            if (signal.aborted) return;
            
            let allInitialExplanations: Explanation[] = [];
            let totalProblemsFound = 0;

            for (const [i, pageData] of allPageImages.entries()) {
                if (signal.aborted) return;
                setStatusMessage(`페이지 ${i + 1}/${allPageImages.length} AI 분석 중...`);
                const analyzedProblemsOnPage = await service.analyzePage(pageData);
                
                if (analyzedProblemsOnPage.length > 0) {
                    const initialExplanations = await service.createInitialExplanations(analyzedProblemsOnPage, totalProblemsFound + analyzedProblemsOnPage.length, totalProblemsFound);
                    setExplanations(prev => [...prev, ...initialExplanations].sort((a,b) => a.problemNumber - b.problemNumber));
                    allInitialExplanations.push(...initialExplanations);
                    totalProblemsFound += analyzedProblemsOnPage.length;
                }
            }

            if (signal.aborted) return;

            if (totalProblemsFound === 0) {
                setError("해적 AI가 이미지에서 문제를 찾지 못했습니다.");
                setIsProcessing(false);
                return;
            }

            const remainingUsage = tierLimits[currentMode] - (usageData[currentMode] || 0);
            if (totalProblemsFound > remainingUsage) {
                const modeLabel = { fast: '빠른해설', dajeong: '표준해설', 'quality': '전문해설' }[currentMode];
                setError(`'${modeLabel}' 모드의 오늘 사용량을 초과했습니다.`);
                setIsProcessing(false);
                return;
            }

            if (!isAdmin) {
                const usageDocRef = doc(db, "users", user.uid, "usage", getTodayDateString());
                await setDoc(usageDocRef, { [currentMode]: increment(totalProblemsFound) }, { merge: true });
                setUsageData(prev => ({ ...prev, [currentMode]: (prev[currentMode] || 0) + totalProblemsFound }));
            }

            await service.generateExplanations(allInitialExplanations, guidelines, currentMode, {
                setStatusMessage,
                onUpdateExplanation: (updated) => setExplanations(prev => prev.map(exp => exp.id === updated.id ? updated : exp)),
            }, signal);

            if (signal.aborted) return;
            
            setStatusMessage('모든 해설 생성이 완료되었습니다.');
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err) {
            if (signal.aborted) return;
            const errorMessage = err instanceof Error ? err.message : '파일 처리 중 알 수 없는 오류가 발생했습니다.';
            if (errorMessage.includes("해적 AI")) setApiKeyError(errorMessage);
            else setError(errorMessage);
        } finally {
            if (!signal.aborted) setIsProcessing(false);
        }
    };
    
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (isProcessing) return;
            if (!explanationMode) {
                setPromptForMode(true);
                setTimeout(() => setPromptForMode(false), 2500);
                return;
            }
            const files = Array.from(event.clipboardData?.items || []).map(item => item.getAsFile()).filter(Boolean) as File[];
            if (files.length > 0) handleFileProcess(files);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isProcessing, explanationMode, handleFileProcess]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Priority 1: Close modals/panels
                if (isGuidelinesOpen) {
                    setIsGuidelinesOpen(false);
                    return;
                }
                if (isHwpRequestsOpen) {
                    setIsHwpRequestsOpen(false);
                    return;
                }
                if (isThemeEditorOpen) {
                    setIsThemeEditorOpen(false);
                    return;
                }
                if (isHistoryOpen) {
                    setIsHistoryOpen(false);
                    return;
                }
                if (isTermsOpen) {
                    setIsTermsOpen(false);
                    return;
                }
                if (isPrivacyOpen) {
                    setIsPrivacyOpen(false);
                    return;
                }
                if (activeQna) {
                    handleCloseQna();
                    return;
                }
    
                // Priority 2: Cancel processing
                if (isProcessing) {
                    handleCancelProcessing();
                    return;
                }
                
                // Priority 3: Go home
                if (explanations.length > 0 && !isProcessing) {
                    handleGoHome();
                    return;
                }
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
    
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        isGuidelinesOpen, 
        isHwpRequestsOpen,
        isThemeEditorOpen, 
        isHistoryOpen, 
        isTermsOpen,
        isPrivacyOpen,
        activeQna, 
        isProcessing, 
        explanations.length, 
        handleGoHome, 
        handleCloseQna, 
        handleCancelProcessing
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
                setCurrentExplanationSetId(setId);
                setExplanationSets(prev => [{ id: setId, userId: user.uid, title: `${new Date().toLocaleDateString('ko-KR')} 해설`, createdAt: new Date(), explanationCount: 0 }, ...prev]);
            }

            const finalImage = explanationToSave.problemImage.startsWith('data:image') ? await uploadProblemImage(user.uid, explanationToSave.problemImage) : explanationToSave.problemImage;

            // Create a clean object for Firestore, converting undefined to null and removing UI state.
            const dataForFirestore = {
                markdown: explanationToSave.markdown,
                pageNumber: explanationToSave.pageNumber,
                problemNumber: explanationToSave.problemNumber,
                problemImage: finalImage,
                originalProblemText: explanationToSave.originalProblemText,
                problemBody: explanationToSave.problemBody,
                problemType: explanationToSave.problemType,
                choices: explanationToSave.choices,
                coreConcepts: explanationToSave.coreConcepts || [],
                difficulty: explanationToSave.difficulty ?? null,
                variationProblem: explanationToSave.variationProblem === undefined ? null : explanationToSave.variationProblem,
                isGolden: explanationToSave.isGolden || false,
            };

            const docRef = doc(collection(db, "explanationSets", setId, "explanations"));
            await setDoc(docRef, dataForFirestore);
            
            await setDoc(doc(db, "explanationSets", setId), { explanationCount: increment(1) }, { merge: true });

            setExplanations(prev => prev.map(exp => exp.id === id ? { ...exp, docId: docRef.id, problemImage: finalImage } : exp));
        } catch (error) {
            setError(`해설 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsSaving(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
        }
    }, [explanations, currentExplanationSetId, user, isSaving]);

    const handleDeleteExplanation = useCallback(async (id: number) => {
        const expToDelete = explanations.find(e => e.id === id);
        if (!expToDelete) return;
        setExplanations(prev => prev.filter(exp => exp.id !== id));
        if (expToDelete.docId && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, "explanationSets", currentExplanationSetId, "explanations", expToDelete.docId));
                batch.update(doc(db, "explanationSets", currentExplanationSetId), { explanationCount: increment(-1) });
                await batch.commit();
            } catch (error) {
                setError("해설 삭제에 실패했습니다.");
                setExplanations(prev => [...prev, expToDelete].sort((a,b) => a.problemNumber - b.problemNumber));
            }
        }
    }, [explanations, currentExplanationSetId]);
    
    const handleDeleteSet = async (setId: string) => {
        try {
            await deleteDoc(doc(db, "explanationSets", setId));
            setExplanationSets(prev => prev.filter(s => s.id !== setId));
            if (currentExplanationSetId === setId) handleGoHome();
        } catch (error) {
            setError("해설 세트 삭제에 실패했습니다.");
        }
    };
    
    const handleRetryExplanation = useCallback(async (id: number) => {
        if (!user || isRetrying.has(id)) return;
        const currentMode = explanationMode;
        if (!currentMode) {
            setPromptForMode(true);
            setTimeout(() => setPromptForMode(false), 2500);
            return;
        }

        const expToRetry = explanations.find(e => e.id === id);
        if (!expToRetry) return;

        setIsRetrying(prev => new Set(prev).add(id));
        setExplanations(prev => prev.map(exp => 
            exp.id === id ? { ...exp, isLoading: true, isError: false, markdown: '해설을 다시 생성하는 중...' } : exp
        ));

        try {
            const results = await generateExplanationsBatch([expToRetry.originalProblemText], guidelines, currentMode);
            const result = results[0];
            
            if (result) {
                const processedMarkdown = postProcessMarkdown(result.explanation);
                const failureKeywords = ["풀이를 제공할 수 없", "해설을 생성할 수 없", "풀 수 없", "답변할 수 없"];
                if (!processedMarkdown || failureKeywords.some(keyword => processedMarkdown.includes(keyword))) {
                    throw new Error("AI가 이 문제에 대한 해설 생성을 거부했습니다.");
                }
                const formattedMarkdown = formatMathEquations(processedMarkdown);
                const updated: Explanation = { 
                    ...expToRetry, 
                    markdown: formattedMarkdown, 
                    coreConcepts: result.coreConcepts, 
                    difficulty: result.difficulty, 
                    isLoading: false, 
                    isError: false,
                };
                setExplanations(prev => prev.map(exp => exp.id === id ? updated : exp));
            } else {
                throw new Error("AI가 유효하지 않은 응답을 반환했습니다.");
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '다시 생성 중 알 수 없는 오류가 발생했습니다.';
            setExplanations(prev => prev.map(exp => 
                exp.id === id ? { ...exp, isLoading: false, isError: true, markdown: errorMessage } : exp
            ));
        } finally {
            setIsRetrying(prev => { const newSet = new Set(prev); newSet.delete(id); return newSet; });
        }
    }, [user, isRetrying, explanationMode, explanations, guidelines]);


    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    
    const toggleSelection = (id: number) => {
        setSelectedIds(prev => { const newSet = new Set(prev); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; });
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        const expsToDelete = explanations.filter(e => selectedIds.has(e.id));
        const savedExpsToDelete = expsToDelete.filter(e => e.docId && currentExplanationSetId);
        setExplanations(prev => prev.filter(e => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
        if (savedExpsToDelete.length > 0 && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                savedExpsToDelete.forEach(exp => exp.docId && batch.delete(doc(db, "explanationSets", currentExplanationSetId, "explanations", exp.docId)));
                batch.update(doc(db, "explanationSets", currentExplanationSetId), { explanationCount: increment(-savedExpsToDelete.length) });
                await batch.commit();
            } catch (error) {
                setError("선택한 해설 삭제에 실패했습니다.");
                setExplanations(prev => [...prev, ...expsToDelete].sort((a,b)=>a.problemNumber-b.problemNumber));
            }
        }
    };
    
    const handleSaveSelected = useCallback(async () => {
        const unsavedSelected = explanations.filter(exp => selectedIds.has(exp.id) && !exp.docId);
        if (unsavedSelected.length === 0) return alert("선택된 해설 중 새로 저장할 항목이 없습니다.");
        setStatusMessage(`${unsavedSelected.length}개 해설 저장 중...`);
        setIsProcessing(true);
        try {
            await Promise.all(unsavedSelected.map(exp => handleSaveExplanation(exp.id)));
            setStatusMessage(`${unsavedSelected.length}개 해설 저장 완료!`);
        } catch (error) {
            setError("선택한 해설을 저장하는 중 오류가 발생했습니다.");
        } finally {
            setIsProcessing(false);
            setTimeout(() => setStatusMessage(null), 3000);
        }
    }, [selectedIds, explanations, handleSaveExplanation]);

    const handleHwpRequest = async () => {
        if (userTier === 'basic' || selectedIds.size === 0 || !user) return;
        const selectedExplanations = explanations.filter(exp => selectedIds.has(exp.id));
        if (selectedExplanations.some(exp => !exp.docId || exp.problemImage.startsWith('data:image'))) {
            return alert(`저장되지 않은 해설이 있습니다. '선택 저장' 버튼을 눌러 먼저 모든 해설을 저장해주세요.`);
        }
        setStatusMessage("HWP 변환 요청 접수 중...");
        setIsProcessing(true);
        try {
            const requestData: HwpExplanationData[] = selectedExplanations.map(exp => ({ problemImage: exp.problemImage, markdown: exp.markdown, problemNumber: exp.problemNumber }));
            await addDoc(collection(db, "hwpRequests"), { userId: user.uid, userEmail: user.email || 'N/A', createdAt: serverTimestamp(), status: 'pending', explanations: requestData });
            alert("접수 되었습니다. 관리자 확인 후 마이페이지에서 파일을 받으실 수 있습니다.");
        } catch (error) {
            setError("HWP 요청 접수에 실패했습니다.");
        } finally {
            setIsProcessing(false);
            setStatusMessage(null);
        }
    };
    
    const handleUiAssetUpload = async (assetName: 'dropzoneImage', file: File) => {
        setStatusMessage("UI 이미지 업로드 중...");
        try {
            const base64String = await fileToBase64(file, { convertToJpeg: true, maxWidth: 512 });
            const downloadURL = await uploadUiAsset(assetName, base64String);
            await setDoc(doc(db, 'settings', 'uiAssets'), { dropzoneImageUrl: downloadURL }, { merge: true });
            setUiAssets(prev => ({...prev, dropzoneImageUrl: downloadURL}));
            setStatusMessage("이미지 업로드 및 적용 완료!");
        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : 'UI 이미지 업로드에 실패했습니다.';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleLogout = () => signOut(auth).catch(err => console.error("Logout failed:", err));
    const handleSaveToCache = useCallback(async (explanation: Explanation) => {
        // A simple hash of the base64 string. Not perfect but sufficient for identical images.
        const simpleHash = async (s: string): Promise<string> => {
            const encoder = new TextEncoder();
            const data = encoder.encode(s);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        setStatusMessage("캐시에 저장하는 중...");
        try {
            const hash = await simpleHash(explanation.problemImage);
            const finalImage = explanation.problemImage.startsWith('data:image') 
                ? await uploadProblemImage(user!.uid, explanation.problemImage, true) // isCache=true
                : explanation.problemImage;
            
            await setDoc(doc(db, "goldenSet", hash), {
                problemImage: finalImage,
                markdown: explanation.markdown,
                coreConcepts: explanation.coreConcepts || [],
                difficulty: explanation.difficulty || 3,
                variationProblem: explanation.variationProblem || null,
                createdAt: serverTimestamp()
            });
            setExplanations(prev => prev.map(exp => exp.id === explanation.id ? {...exp, isGolden: true } : exp));
            setStatusMessage("황금 해설 캐시에 저장 완료!");
        } catch(e) {
            setError(e instanceof Error ? e.message : "캐시 저장 실패");
        } finally {
            setTimeout(() => setStatusMessage(null), 3000);
        }
    }, [user]);

    if (isAuthenticating) return <div className="w-full h-screen flex items-center justify-center"><Loader status="사용자 정보 확인 중..." /></div>;

    return (
        <div className="min-h-screen flex flex-col bg-background text-text-primary">
            {!user ? (
                <div className="flex-grow flex flex-col">
                    <AuthComponent appError={error} />
                    <Footer onOpenTerms={() => setIsTermsOpen(true)} onOpenPrivacy={() => setIsPrivacyOpen(true)} />
                </div>
            ) : (
                <>
                    <Header 
                        user={user}
                        usageData={usageData}
                        tierLimits={tierLimits}
                        explanationMode={explanationMode}
                        isProcessing={isProcessing}
                        promptForMode={promptForMode}
                        isAdmin={isAdmin}
                        onGoHome={handleGoHome}
                        onOpenThemeEditor={() => setIsThemeEditorOpen(true)}
                        onOpenHistory={() => setIsHistoryOpen(true)}
                        onSetExplanationMode={setExplanationMode}
                        onLogout={handleLogout}
                        onOpenGuidelines={() => setIsGuidelinesOpen(false)}
                        onOpenHwpRequests={() => setIsHwpRequestsOpen(false)}
                    />
                    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 flex-grow">
                        {apiKeyError && <ApiKeyErrorDisplay message={apiKeyError} />}
                        {error && !apiKeyError && <div className="bg-danger/20 border border-danger text-danger p-4 rounded-md mb-6"><strong>오류:</strong> {error}</div>}
                        
                        <div className="w-full flex flex-col lg:flex-row gap-8">
                            <div className="flex-1 min-w-0">
                                {isProcessing && explanations.length === 0 && <div className="flex justify-center my-12"><Loader status={statusMessage || '처리 중...'} onCancel={handleCancelProcessing} /></div>}
                                
                                {explanations.length === 0 && !isProcessing && !apiKeyError && (
                                    <div className="max-w-3xl mx-auto">
                                        <FileDropzone onFileProcess={handleFileProcess} dropzoneImageUrl={uiAssets.dropzoneImageUrl} />
                                        <p className="text-right text-sm text-danger mt-2 pr-2">해설 - ver2.0</p>
                                    </div>
                                )}

                                {explanations.length > 0 && (
                                    <>
                                        <div className="bg-surface p-4 rounded-lg mb-6 border border-primary flex flex-col sm:flex-row justify-between items-center gap-4">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={isSelectionMode} onChange={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedIds(new Set()); }} className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent" />
                                                    <span className="font-semibold">선택</span>
                                                </label>
                                                 {isSelectionMode && (
                                                    <>
                                                        <button onClick={() => setSelectedIds(new Set(explanations.map(e => e.id)))} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-accent hover:text-white transition-colors">전체 선택</button>
                                                        <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-primary transition-colors">선택 해제</button>
                                                        <span className="text-sm text-text-secondary">{selectedIds.size}/{explanations.length}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center flex-wrap justify-center sm:justify-end gap-3">
                                                {isSelectionMode && (
                                                    <>
                                                        <button onClick={handleSaveSelected} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"><SaveIcon /> 선택 저장</button>
                                                        <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-danger/20 text-danger rounded-md hover:bg-danger/30 disabled:opacity-50"><TrashIcon/> 선택 삭제</button>
                                                    </>
                                                )}
                                                <button onClick={handleHwpRequest} disabled={!isSelectionMode || selectedIds.size === 0 || userTier === 'basic'} className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary hover:border-accent disabled:opacity-50 group">
                                                    <span className="relative flex items-center gap-2"><HwpIcon /> 한글(HWP)</span>
                                                    <div className="relative group/tooltip ml-1.5"><QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap z-10">샤프등급이상부터 사용가능합니다<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div></div>
                                                    </div>
                                                </button>
                                                <button disabled className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary opacity-50 cursor-not-allowed group">
                                                    <span className="relative flex items-center gap-2"><PdfIcon /> PDF</span>
                                                     <div className="relative group/tooltip ml-1.5"><QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap z-10">준비중입니다<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div></div>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid gap-6">
                                            {sortedExplanations.map((exp, index) => (
                                                <ExplanationCard key={exp.id} id={`exp-card-${exp.id}`} explanation={exp} onDelete={handleDeleteExplanation} onSave={handleSaveExplanation} onRetry={handleRetryExplanation} isSaving={isSaving.has(exp.id)} isRetrying={isRetrying.has(exp.id)} setRenderedContentRef={(el) => { renderedContentRefs.current[index] = el; }} isSelectionMode={isSelectionMode} isSelected={selectedIds.has(exp.id)} onSelect={toggleSelection} onOpenQna={handleOpenQna} isAdmin={isAdmin} onSaveToCache={handleSaveToCache} />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="w-full lg:w-80 lg:flex-shrink-0">
                                {explanations.length > 0 && (
                                    <div className="lg:sticky top-1/2 lg:-translate-y-1/2">
                                        <QnaPanel data={activeQna} onClose={handleCloseQna} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                    <Footer onOpenTerms={() => setIsTermsOpen(true)} onOpenPrivacy={() => setIsPrivacyOpen(true)} />
                </>
            )}
            
            {isAdmin && <GuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} guidelines={guidelines} setGuidelines={setGuidelines} />}
            {isAdmin && <AdminHwpRequestsModal isOpen={isHwpRequestsOpen} onClose={() => setIsHwpRequestsOpen(false)} />}
            <ThemeEditor isOpen={isThemeEditorOpen} onClose={() => setIsThemeEditorOpen(false)} />
            <HistoryPanel isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} sets={explanationSets} onLoadSet={handleLoadSet} onDeleteSet={handleDeleteSet} user={user} userTier={userTier} usageData={usageData} tierLimits={tierLimits} isAdmin={isAdmin} onUiAssetUpload={handleUiAssetUpload} />
            <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
        </div>
    );
}