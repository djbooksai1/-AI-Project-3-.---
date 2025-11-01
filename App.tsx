

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { GuidelinesModal } from './components/GuidelinesModal';
import { FileDropzone } from './components/PdfDropzone';
import { Loader } from './components/Loader';
import { ExplanationCard } from './components/ExplanationCard';
import { ProblemSelector } from './components/ProblemSelector';
import { PdfIcon } from './components/icons/PdfIcon';
import { HwpIcon } from './components/icons/HwpIcon';
import { exportToPdf, exportToHtml } from './services/exportService';
import { Explanation, ExplanationMode, ExtractedProblem, UserSelection, QnaData, ExplanationSet, UsageData, UserTier } from './types';
import { FloatingInput } from './components/FloatingInput';
import { DEFAULT_GUIDELINES } from './guidelines';
import { getProcessingService } from './services/processingService';
import { useTheme } from './hooks/useTheme';
import { ThemeEditor } from './components/ThemeEditor';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, getDocs, writeBatch, addDoc, deleteDoc, where, documentId, increment } from 'firebase/firestore';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    User,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { QnaPanel } from './components/QnaPanel';
import { uploadImageFromBase64 } from './services/storageService';
import { HistoryPanel } from './components/HistoryPanel';
import { FloatingLogo } from './components/FloatingLogo';
import { GoogleIcon } from './components/icons/GoogleIcon';

// [+] 인증 UI 컴포넌트
const AuthComponent = () => {
    const [error, setError] = useState('');
    
    const handleGoogleLogin = async () => {
        setError('');
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Firestore에 사용자 정보가 있는지 확인하고, 없으면 새로 생성
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
                await setDoc(userDocRef, {
                    email: user.email,
                    createdAt: serverTimestamp(),
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    tier: 'free', // 기본 등급 부여
                });
            }
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Google login failed.');
            }
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="relative">
                <div className="w-full max-w-md p-8 bg-surface rounded-lg shadow-lg border border-primary">
                    <div className="text-center space-y-5">
                        <div className="text-accent">
                            <h2 className="text-6xl font-black">해.적</h2>
                        </div>
                        <div className="text-accent">
                            <p className="text-2xl font-bold">: 해설을, 적다.</p>
                        </div>
                        <p className="text-sm text-text-secondary">
                            대한민국 최고의 문제풀이 및 해설작성 서비스
                        </p>
                        {error && <p className="text-sm text-center text-danger">{error}</p>}
                        
                        <button
                            onClick={handleGoogleLogin}
                            className="w-full inline-flex justify-center items-center py-3 px-4 border border-primary shadow-sm bg-background text-sm font-medium text-text-primary rounded-md hover:bg-primary"
                        >
                            <GoogleIcon />
                            Google로 로그인
                        </button>
                    </div>
                </div>
                <div className="absolute top-full right-0 mt-4 text-right">
                     <p className="text-xs text-text-secondary">
                        Copyright © 2025 Dajeong Intelligence.<br />All Rights Reserved.
                    </p>
                    <img 
                        src="https://793d73a28bf90b83bce0aff088b4b84b.cdn.bubble.io/f1741657290407x311400631094205250/Group%2012726288352.svg" 
                        alt="Dajeong Intelligence Logo" 
                        className="w-32 h-auto ml-auto mt-2"
                    />
                </div>
            </div>
        </div>
    );
};

type SavingStatus = 'idle' | 'saving' | 'saved' | 'error';

// FIX: Replaced the function with a more robust, generic version to improve type safety and avoid potential inference errors.
function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) {
    // FIX: Changed useRef to properly handle an undefined initial value for the timeout.
    // The original `useRef<number>()` is invalid without an initial value, causing the "Expected 1 arguments, but got 0" error.
    // FIX: The `useRef` hook requires an initial value. Passed `undefined` to fix the error.
    const timeoutRef = useRef<number | undefined>(undefined);
    
    useEffect(() => {
        // Cleanup the timeout on unmount
        return () => {
            if (timeoutRef.current) {
                // FIX: Explicitly call window.clearTimeout to avoid potential scope conflicts.
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const debouncedCallback = useCallback((...args: Parameters<T>) => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
            callback(...args);
        }, delay);
    }, [callback, delay]);

    return debouncedCallback;
}

const isMobileDevice = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

// [+] 등급별 사용량 제한 설정
const TIER_LIMITS: { [key in UserTier]: UsageData } = {
    free: { fast: 5, dajeong: 3, quality: 1 },
    standard: { fast: Infinity, dajeong: 3, quality: 1 },
    premium: { fast: Infinity, dajeong: Infinity, quality: 3 },
    royal: { fast: Infinity, dajeong: Infinity, quality: Infinity },
};

// [+] 오늘 날짜 문자열 생성 (YYYY-MM-DD)
const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(true);

    const [guidelines, setGuidelines] = useState(DEFAULT_GUIDELINES);
    const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
    const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [explanations, setExplanations] = useState<Explanation[]>([]);
    const [explanationIdCounter, setExplanationIdCounter] = useState(0);

    const [isProcessing, setIsProcessing] = useState(false);
    
    // PDF/Image processing state
    const [showProblemSelector, setShowProblemSelector] = useState(false);
    const [pageImages, setPageImages] = useState<{ image: string; pageNumber: number }[]>([]);
    const [initialProblems, setInitialProblems] = useState<Map<number, ExtractedProblem[]>>(new Map());
    
    // Auto-saving state
    const [currentExplanationSetId, setCurrentExplanationSetId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle');

    // History state
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [explanationSets, setExplanationSets] = useState<ExplanationSet[]>([]);

    // [+] 사용량 제한 관련 상태
    const [userTier, setUserTier] = useState<UserTier>('free');
    const [usageData, setUsageData] = useState<UsageData>({ fast: 0, dajeong: 0, quality: 0 });
    const [tierLimits, setTierLimits] = useState<UsageData>(TIER_LIMITS.free);


    const [explanationMode, setExplanationMode] = useState<ExplanationMode>('dajeong');
    const { layout } = useTheme();

    const [activeQna, setActiveQna] = useState<QnaData | null>(null);

    const renderedContentRefs = useRef<(HTMLDivElement | null)[]>([]);

    const handleGoHome = () => {
        setExplanations([]);
        setExplanationIdCounter(0);
        setShowProblemSelector(false);
        setError(null);
        setStatusMessage(null);
        setIsProcessing(false);
        setIsSelectionMode(false);
        setSelectedIds(new Set());
        setActiveQna(null);
        setCurrentExplanationSetId(null);
        setIsDirty(false);
        setSavingStatus('idle');
    };

    const handleOpenQna = useCallback((data: QnaData) => {
        setActiveQna(data);
    }, []);

    const handleCloseQna = useCallback(() => {
        setActiveQna(null);
    }, []);

    useEffect(() => {
        renderedContentRefs.current = renderedContentRefs.current.slice(0, explanations.length);
    }, [explanations.length]);
    
     useEffect(() => {
        const fetchGuidelines = async () => {
            if (!user) return; 

            const guidelinesDocRef = doc(db, 'settings', 'guidelines');
            try {
                const docSnap = await getDoc(guidelinesDocRef);
                if (docSnap.exists()) {
                    setGuidelines(docSnap.data().content);
                } else {
                    await setDoc(guidelinesDocRef, { content: DEFAULT_GUIDELINES });
                }
            } catch (error) {
                console.error("Error fetching guidelines from Firestore: ", error);
                setError("가이드라인을 불러오는 데 실패했습니다. 권한을 확인해주세요.");
            }
        };

        const fetchHistory = async (uid: string) => {
            try {
                const setsRef = collection(db, "explanationSets");
                const q = query(setsRef, where("userId", "==", uid), orderBy("createdAt", "desc"));
                const querySnapshot = await getDocs(q);
                const sets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExplanationSet));
                setExplanationSets(sets);
            } catch (error) {
                console.error("Error fetching history:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('firestore/indexes?create_composite=')) {
                    console.warn(
                        "Firestore query for history failed due to a missing index. " +
                        "This is expected on first run or without database setup. " +
                        "To enable history, please create the composite index in your Firebase console. " +
                        "The required index creation link can be found in the original error message in the browser console."
                    );
                } else {
                    setError("저장된 해설 목록을 불러오는 데 실패했습니다.");
                }
            }
        };

        const fetchUserData = async (uid: string) => {
            const userDocRef = doc(db, "users", uid);
            const usageDocRef = doc(db, "users", uid, "usage", getTodayDateString());

            try {
                // 사용자 등급 조회
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const tier = (userData.tier || 'free') as UserTier;
                    setUserTier(tier);
                    setTierLimits(TIER_LIMITS[tier] || TIER_LIMITS.free);
                }

                // 오늘의 사용량 조회
                const usageDocSnap = await getDoc(usageDocRef);
                if (usageDocSnap.exists()) {
                    setUsageData(usageDocSnap.data() as UsageData);
                } else {
                    setUsageData({ fast: 0, dajeong: 0, quality: 0 });
                }
            } catch (e) {
                console.error("Error fetching user data:", e);
                setError("사용자 등급 및 사용량 정보를 불러오는 데 실패했습니다.");
            }
        };


        if (user) {
            fetchGuidelines();
            fetchHistory(user.uid);
            fetchUserData(user.uid);
        }
    }, [user]);

    // Auto-saving logic
    const performSave = useCallback(async () => {
        if (!isDirty || !user || explanations.length === 0) {
            return;
        }

        setSavingStatus('saving');
        setError(null);

        try {
            let setId = currentExplanationSetId;

            // 1. If it's a new set, create the parent document first
            if (!setId) {
                const newSetRef = await addDoc(collection(db, "explanationSets"), {
                    userId: user.uid,
                    title: `${new Date().toLocaleDateString('ko-KR')} 해설`,
                    createdAt: serverTimestamp(),
                    explanationCount: explanations.length
                });
                setId = newSetRef.id;
                setCurrentExplanationSetId(setId);
            }

            // 2. Upload any new images (base64) to Storage
            const explanationsWithImageUrls = await Promise.all(
                explanations.map(async (exp) => {
                    if (exp.problemImage.startsWith('data:image')) {
                        const imageUrl = await uploadImageFromBase64(user.uid, exp.problemImage);
                        return { ...exp, problemImage: imageUrl };
                    }
                    return exp;
                })
            );

            // 3. Batch write all explanations to the subcollection
            const explanationsRef = collection(db, "explanationSets", setId, "explanations");
            const batch = writeBatch(db);

            // Simple sync: delete old ones first
            // FIX: The documentId function must be called to return a FieldPath object.
            const oldDocsSnapshot = await getDocs(query(explanationsRef, where(documentId(), "!=", "placeholder")));
            oldDocsSnapshot.forEach(doc => batch.delete(doc.ref));

            explanationsWithImageUrls.forEach(exp => {
                const { id, isLoading, isError, ...dataToSave } = exp;
                const docRef = doc(explanationsRef, exp.docId || undefined); // Use existing docId or create new
                batch.set(docRef, { ...dataToSave, problemNumber: exp.problemNumber });
            });
            
             // Update the count on the parent document
            const setDocRef = doc(db, "explanationSets", setId);
            batch.update(setDocRef, { explanationCount: explanations.length });


            await batch.commit();

            setSavingStatus('saved');
            setIsDirty(false);
            // Refresh history list
            const setsRef = collection(db, "explanationSets");
            const q = query(setsRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            setExplanationSets(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExplanationSet)));


        } catch (error) {
            console.error("Auto-save failed:", error);
            setSavingStatus('error');
            setError(error instanceof Error ? error.message : "자동 저장에 실패했습니다.");
        }
    }, [isDirty, user, explanations, currentExplanationSetId]);
    
    const debouncedSave = useDebouncedCallback(performSave, 2500);

    useEffect(() => {
        if (isDirty) {
            setSavingStatus('saving');
            debouncedSave();
        }
    }, [explanations, isDirty, debouncedSave]);

    const loadExplanationSet = async (setId: string) => {
        handleGoHome(); // Reset state before loading
        setIsProcessing(true);
        setStatusMessage("해설 세트를 불러오는 중...");
        try {
            const explanationsRef = collection(db, "explanationSets", setId, "explanations");
            const q = query(explanationsRef, orderBy("problemNumber", "asc"));
            const querySnapshot = await getDocs(q);
            
            let counter = 0;
            const loadedExplanations: Explanation[] = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: counter++,
                    docId: doc.id,
                    markdown: data.markdown,
                    isSatisfied: data.isSatisfied,
                    isLoading: false,
                    isError: false,
                    pageNumber: data.pageNumber,
                    problemNumber: data.problemNumber,
                    problemImage: data.problemImage,
                    originalProblemText: data.originalProblemText,
                };
            });
            
            setExplanations(loadedExplanations);
            setExplanationIdCounter(loadedExplanations.length);
            setCurrentExplanationSetId(setId);
            setIsDirty(false);
            setSavingStatus('idle');
            setIsHistoryOpen(false);

        } catch (error) {
            console.error("Error loading explanation set: ", error);
            setError('해설 세트를 불러오는 데 실패했습니다.');
        } finally {
            setIsProcessing(false);
            setStatusMessage(null);
        }
    };
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                setUser(null);
                handleGoHome(); // Clear all data on logout
            }
            setIsAuthenticating(false);
        });
        return () => unsubscribe();
    }, []);
    
    const handleConfirmSelections = useCallback(async (selections: UserSelection[]) => {
        setShowProblemSelector(false);
        if (selections.length === 0) return;

        // [+] 사용량 제한 확인
        // [보안 경고] 이 로직은 클라이언트 측에서만 실행되므로 숙련된 사용자는 제한을 우회할 수 있습니다.
        // 프로덕션 환경에서는 이 검증 로직을 Firebase Cloud Function과 같은 서버 측 코드로 이동하여
        // API 호출을 안전하게 제어하는 것이 강력히 권장됩니다.
        const remainingUsage = tierLimits[explanationMode] - (usageData[explanationMode] || 0);
        if (selections.length > remainingUsage) {
            const modeLabel = { fast: '빠른해설', dajeong: '표준해설', 'quality': '전문해설' }[explanationMode];
            setError(`'${modeLabel}' 모드의 오늘 사용량을 초과했습니다. 오늘은 ${remainingUsage}개까지 더 생성할 수 있습니다.`);
            return;
        }

        setIsProcessing(true);
        setError(null);

        // [+] Firestore에 사용량 업데이트
        if (user) {
            const today = getTodayDateString();
            const usageDocRef = doc(db, "users", user.uid, "usage", today);
            try {
                await setDoc(usageDocRef, {
                    [explanationMode]: increment(selections.length)
                }, { merge: true });
                
                // 로컬 상태 즉시 업데이트
                setUsageData(prev => ({
                    ...prev,
                    [explanationMode]: (prev[explanationMode] || 0) + selections.length,
                }));

            } catch (e) {
                console.error("Failed to update usage data:", e);
                setError("사용량 기록에 실패했습니다. 해설 생성을 중단합니다.");
                setIsProcessing(false);
                return;
            }
        } else {
            setError("사용자 인증 정보가 없습니다. 다시 로그인해주세요.");
            setIsProcessing(false);
            return;
        }
        
        let nextId = explanationIdCounter;
        
        const processingService = getProcessingService();
        processingService.generateExplanationsForSelections(selections, pageImages, guidelines, explanationMode, {
            setStatusMessage,
            onNewExplanation: (placeholder) => {
                 setExplanations(prev => [...prev, { ...placeholder, id: nextId++ }]);
            },
            onUpdateExplanation: (updatedExplanation) => {
                setExplanations(prev =>
                    prev.map(exp => (exp.id === updatedExplanation.id ? updatedExplanation : exp))
                );
            },
            onComplete: () => {
                setIsProcessing(false);
                setStatusMessage('모든 해설 생성이 완료되었습니다.');
                setTimeout(() => setStatusMessage(null), 3000);
                setExplanationIdCounter(nextId);
                setIsDirty(true); // Mark for auto-saving
            },
            onError: (err) => {
                setError(err.message);
                setIsProcessing(false);
                setStatusMessage(null);
            },
        });
    }, [pageImages, guidelines, explanationMode, explanationIdCounter, user, tierLimits, usageData]);

    const handleFileProcess = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        handleGoHome(); // Start a new session
        setIsProcessing(true);
        setStatusMessage('파일 분석을 시작합니다...');
        setError(null);

        try {
            const processingService = getProcessingService();
            const { pages, initialProblems } = await processingService.analyzeFiles(files, setStatusMessage);
            setPageImages(pages);

            const isMobile = isMobileDevice();

            if (isMobile && initialProblems.size > 0) {
                setStatusMessage('모바일 환경에서는 모든 문제를 자동으로 선택합니다...');
                const allSelections: UserSelection[] = [];
                initialProblems.forEach((problems, pageNum) => {
                    problems.forEach(p => {
                        allSelections.push({
                            id: p.id || `${pageNum}-${Math.random().toString(36).substr(2, 9)}`,
                            pageNumber: pageNum,
                            bbox: p.bbox,
                            initialText: '', // No initial text from client-side detection
                        });
                    });
                });
                
                if (allSelections.length > 0) {
                    handleConfirmSelections(allSelections);
                } else {
                     setError("이미지에서 문제를 찾을 수 없습니다. 데스크탑 환경에서 영역을 직접 지정해보세요.");
                     setIsProcessing(false);
                     setStatusMessage(null);
                }
            } else {
                setInitialProblems(initialProblems);
                setShowProblemSelector(true);
                setIsProcessing(false); // Stop processing indicator, selector is now shown
                setStatusMessage(null);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : '파일 처리 중 알 수 없는 오류가 발생했습니다.');
            setIsProcessing(false);
            setStatusMessage(null);
        }
    }, [handleConfirmSelections]);
    
    const handlePaste = useCallback((event: ClipboardEvent) => {
        if (showProblemSelector || isProcessing) return;
        const items = event.clipboardData?.items;
        if (!items) return;
        
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const file = new File([blob], `pasted_image_${Date.now()}.png`, { type: blob.type });
                    files.push(file);
                }
            }
        }
        if (files.length > 0) {
            handleFileProcess(files);
        }
    }, [handleFileProcess, showProblemSelector, isProcessing]);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [handlePaste]);


    const handleDeleteExplanation = useCallback((id: number) => {
        setExplanations(prev => prev.filter(exp => exp.id !== id));
        setIsDirty(true);
    }, []);

    const handleToggleSatisfied = useCallback((id: number) => {
        setExplanations(prev =>
            prev.map(exp =>
                exp.id === id ? { ...exp, isSatisfied: !exp.isSatisfied } : exp
            )
        );
        setIsDirty(true);
    }, []);
    
    const handleDeleteSet = async (setId: string) => {
        if (!confirm("정말로 이 해설 세트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            return;
        }

        try {
            // Also need to delete images from storage, but for simplicity, we'll skip that here.
            // A more robust solution would use a Cloud Function to clean up storage on document delete.
            const setDocRef = doc(db, "explanationSets", setId);
            
            const explanationsRef = collection(db, "explanationSets", setId, "explanations");
            const snapshot = await getDocs(explanationsRef);
            const batch = writeBatch(db);
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            await deleteDoc(setDocRef);

            setExplanationSets(prev => prev.filter(s => s.id !== setId));

            if (currentExplanationSetId === setId) {
                handleGoHome();
            }

        } catch (error) {
            console.error("Error deleting set:", error);
            setError("해설 세트 삭제에 실패했습니다.");
        }
    };


    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    
    const toggleSelection = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };
    
    const handleExport = async (format: 'pdf' | 'html') => {
        if (selectedIds.size === 0) {
            alert('내보낼 해설을 하나 이상 선택해주세요.');
            return;
        }

        setStatusMessage(`(${selectedIds.size}개) 해설을 ${format.toUpperCase()} 파일로 변환하는 중...`);
        setIsProcessing(true);

        const selectedNodes = explanations
            .filter(exp => selectedIds.has(exp.id))
            .map(exp => renderedContentRefs.current[explanations.findIndex(e => e.id === exp.id)]);
            
        try {
            if (format === 'pdf') {
                await exportToPdf(selectedNodes, (progress) => {
                     setStatusMessage(`PDF 생성 중... ${progress}%`);
                });
            } else {
                await exportToHtml(selectedNodes, (progress) => {
                     setStatusMessage(`HTML 생성 중... ${progress}%`);
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '파일 내보내기에 실패했습니다.');
        } finally {
            setIsProcessing(false);
            setStatusMessage(null);
        }
    };


    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error("Logout failed:", err);
        }
    };

    if (isAuthenticating) {
        return (
            <div className="w-full h-screen flex items-center justify-center">
                <Loader status="사용자 정보 확인 중..." />
            </div>
        );
    }
    
    if (!user) {
        return <AuthComponent />;
    }

    return (
        <div className="min-h-screen bg-background text-text-primary">
            <Header 
                onGoHome={handleGoHome}
                onOpenGuidelines={() => setIsGuidelinesOpen(true)}
                onOpenThemeEditor={() => setIsThemeEditorOpen(true)}
                onOpenHistory={() => setIsHistoryOpen(true)}
                explanationMode={explanationMode}
                onSetExplanationMode={setExplanationMode}
                user={user}
                onLogout={handleLogout}
                savingStatus={savingStatus}
                usageData={usageData}
                tierLimits={tierLimits}
                isProcessing={isProcessing}
            />

            <main className="container mx-auto p-4 md:p-8">
                {error && (
                    <div className="bg-danger/20 border border-danger text-danger p-4 rounded-md mb-6">
                        <strong>오류:</strong> {error}
                    </div>
                )}
                
                {showProblemSelector && (
                    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4">
                        <ProblemSelector
                            pages={pageImages}
                            initialProblems={initialProblems}
                            onConfirm={handleConfirmSelections}
                            onCancel={() => setShowProblemSelector(false)}
                        />
                    </div>
                )}
                
                <div className="flex flex-row gap-6 items-start">
                    {/* Main content column */}
                    <div className="flex-1 min-w-0">
                        {isProcessing && !showProblemSelector && (
                            <div className="flex justify-center my-12">
                                <Loader status={statusMessage || '처리 중...'} />
                            </div>
                        )}

                        {explanations.length === 0 && !isProcessing && (
                            <FileDropzone onFileProcess={handleFileProcess} />
                        )}

                        {explanations.length > 0 && (
                            <>
                                <div className="bg-surface p-4 rounded-lg mb-6 border border-primary flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <label htmlFor="selection-mode" className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                id="selection-mode"
                                                checked={isSelectionMode}
                                                onChange={() => {
                                                    setIsSelectionMode(!isSelectionMode);
                                                    if (isSelectionMode) setSelectedIds(new Set()); // Clear selections when turning off
                                                }}
                                                className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent"
                                            />
                                            <span className="font-semibold">내보내기 선택</span>
                                        </label>
                                        {isSelectionMode && (
                                            <span className="text-sm text-text-secondary">{selectedIds.size} / {explanations.length}개 선택됨</span>
                                        )}
                                </div>
                                <div className="flex items-center gap-3">
                                        <button onClick={() => handleExport('html')} disabled={!isSelectionMode || selectedIds.size === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                            <HwpIcon />
                                            HWP용 HTML로 내보내기
                                        </button>
                                        <button onClick={() => handleExport('pdf')} disabled={!isSelectionMode || selectedIds.size === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                            <PdfIcon />
                                            PDF로 내보내기
                                        </button>
                                </div>
                                </div>

                                <div className={`grid gap-6 ${layout.className}`}>
                                    {explanations.map((exp, index) => (
                                        <ExplanationCard
                                            key={exp.id}
                                            id={`explanation-card-${exp.id}`}
                                            explanation={exp}
                                            guidelines={guidelines}
                                            onDelete={handleDeleteExplanation}
                                            onToggleSatisfied={handleToggleSatisfied}
                                            setRenderedContentRef={(el) => { renderedContentRefs.current[index] = el; }}
                                            isSelectionMode={isSelectionMode}
                                            isSelected={selectedIds.has(exp.id)}
                                            onSelect={toggleSelection}
                                            onOpenQna={handleOpenQna}
                                            activeQna={activeQna}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                     {/* Q&A Panel column */}
                    {explanations.length > 0 && (
                        <div className="w-96 flex-shrink-0 sticky top-28">
                            {activeQna && (
                                <QnaPanel
                                    key={activeQna.cardId + activeQna.selectedLine}
                                    data={activeQna}
                                    onClose={handleCloseQna}
                                />
                            )}
                        </div>
                    )}
                </div>
            </main>
            
            <GuidelinesModal
                isOpen={isGuidelinesOpen}
                onClose={() => setIsGuidelinesOpen(false)}
                guidelines={guidelines}
                setGuidelines={setGuidelines}
            />

            <ThemeEditor 
                isOpen={isThemeEditorOpen}
                onClose={() => setIsThemeEditorOpen(false)}
            />

            <HistoryPanel
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                sets={explanationSets}
                onLoadSet={loadExplanationSet}
                onDeleteSet={handleDeleteSet}
                userTier={userTier}
            />
            
            <FloatingLogo />
        </div>
    );
}