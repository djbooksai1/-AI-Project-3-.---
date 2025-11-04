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

// [+] 인증 UI 컴포넌트
const AuthComponent = ({ appError }: { appError: string | null }) => {
    const [error, setError] = useState('');

    // Phone auth state
    const [phoneNumber, setPhoneNumber] = useState(localStorage.getItem('lastPhoneNumber') || '');
    const [verificationCode, setVerificationCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);

    // Recaptcha verifier instance
    const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
    
    const displayError = appError || error;

    useEffect(() => {
        // Initialize reCAPTCHA verifier once on component mount and keep it stable.
        if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': () => {},
                'expired-callback': () => {
                    setError('reCAPTCHA 인증이 만료되었습니다. 다시 시도해주세요.');
                    // Optionally, re-render the verifier if it expires
                }
            });
            // Render the reCAPTCHA widget
            recaptchaVerifierRef.current.render();
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
            const appVerifier = recaptchaVerifierRef.current!;
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
                    
                    <div id="recaptcha-container" className="flex justify-center mt-4"></div>
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

const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Robust unique ID generator to prevent state-related bugs
const newId = () => Date.now() + Math.random();


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

    const [uiAssets, setUiAssets] = useState({
        hwpButtonBgUrl: '',
        pdfButtonBgUrl: '',
        dropzoneImageUrl: '',
    });
    
    const renderedContentRefs = useRef<(HTMLDivElement | null)[]>([]);

    const cancellationController = useRef<AbortController | null>(null);
    
    // [+] Memoize the sorted explanations to prevent re-sorting on every render
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

    const handleOpenQna = useCallback((data: QnaData) => {
        setActiveQna(data);
    }, []);

    const handleCloseQna = useCallback(() => {
        setActiveQna(null);
    }, []);

    useEffect(() => {
        renderedContentRefs.current = renderedContentRefs.current.slice(0, explanations.length);
    }, [explanations.length]);
    
    // Simplified and robust auth state handling
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                
                // Set up session
                const newSessionId = `${Date.now()}-${Math.random()}`;
                setCurrentSessionId(newSessionId);

                const userDoc = await getDoc(userDocRef);
                const updateData: { [key: string]: any } = {
                    currentSessionId: newSessionId
                };

                if (!userDoc.exists()) {
                    let formattedPhoneNumber = currentUser.phoneNumber;
                    if (formattedPhoneNumber && formattedPhoneNumber.startsWith('+82')) {
                        formattedPhoneNumber = '0' + formattedPhoneNumber.substring(3);
                    }
                    updateData.email = currentUser.email;
                    updateData.phoneNumber = formattedPhoneNumber;
                    updateData.createdAt = serverTimestamp();
                    updateData.displayName = currentUser.displayName;
                    updateData.photoURL = currentUser.photoURL;
                    updateData.tier = 'basic';
                }
                
                try {
                    await setDoc(userDocRef, updateData, { merge: true });
                } catch (dbError) {
                    console.error("Error updating user document:", dbError);
                    setError("사용자 정보를 업데이트하는 데 실패했습니다.");
                }

                setUser(currentUser);
            } else {
                setUser(null);
                setCurrentSessionId(null);
                handleGoHome(); // Reset app state on logout
            }
            setIsAuthenticating(false);
        });
        return () => unsubscribe();
    }, [handleGoHome]);

    // Single session listener
    useEffect(() => {
        if (user && currentSessionId) {
            const userDocRef = doc(db, "users", user.uid);
            const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.currentSessionId && data.currentSessionId !== currentSessionId) {
                        setError("다른 기기에서 로그인하여 자동으로 로그아웃되었습니다.");
                        signOut(auth);
                    }
                }
            });
            return () => unsubscribe();
        }
    }, [user, currentSessionId]);


     useEffect(() => {
        const fetchGuidelines = async () => {
            if (!user) return; 

            const guidelinesDocRef = doc(db, 'settings', 'guidelines');
            try {
                const docSnap = await getDoc(guidelinesDocRef);
                if (docSnap.exists()) {
                    setGuidelines(docSnap.data().content);
                } else {
                    console.log("Guidelines document does not exist in Firestore.");
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
                setError("저장된 해설 목록을 불러오는 데 실패했습니다.");
            }
        };

        const fetchUserData = async (uid: string) => {
            // Admin role check
            const adminDocRef = doc(db, "admins", uid);
            const adminDocSnap = await getDoc(adminDocRef);
            setIsAdmin(adminDocSnap.exists());
            
            const userDocRef = doc(db, "users", uid);
            const usageDocRef = doc(db, "users", uid, "usage", getTodayDateString());

            try {
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    const tier = (data.tier || 'basic') as UserTier;
                    setUserTier(tier);
                    setTierLimits(TIER_LIMITS[tier] || TIER_LIMITS.basic);
                } else {
                    setUserTier('basic');
                    setTierLimits(TIER_LIMITS.basic);
                }

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
        
        const fetchUiAssets = async () => {
            const assetsDocRef = doc(db, 'settings', 'uiAssets');
            try {
                const docSnap = await getDoc(assetsDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUiAssets(prev => ({
                        ...prev,
                        hwpButtonBgUrl: data.hwpButtonBgUrl || '',
                        pdfButtonBgUrl: data.pdfButtonBgUrl || '',
                        dropzoneImageUrl: data.dropzoneImageUrl || '',
                    }));
                }
            } catch (error) {
                console.warn("Could not fetch UI assets from Firestore, using defaults.", error);
            }
        };

        if (user) {
            fetchGuidelines();
            fetchHistory(user.uid);
            fetchUserData(user.uid);
            fetchUiAssets();
        } else {
            setIsAdmin(false);
        }
    }, [user]);
    
    const loadExplanationSet = useCallback(async (setId: string) => {
        handleGoHome();
        setIsProcessing(true);
        setStatusMessage("해설 세트를 불러오는 중...");
        setError(null);
        try {
            const explanationsRef = collection(db, "explanationSets", setId, "explanations");
            const q = query(explanationsRef, orderBy("problemNumber", "asc"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError("불러올 해설이 없습니다. 삭제되었거나 비어있는 세트일 수 있습니다.");
                setCurrentExplanationSetId(null);
                setExplanations([]);
                return;
            }
            
            const loadedExplanations: Explanation[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    id: newId(), // Use robust unique ID generation
                    docId: doc.id,
                } as Explanation
            });
            
            setExplanations(loadedExplanations);
            setCurrentExplanationSetId(setId);

        } catch (error) {
            console.error("Error loading explanation set: ", error);
            setError('해설 세트를 불러오는 데 실패했습니다.');
        } finally {
            setIsProcessing(false);
            setStatusMessage(null);
        }
    }, [handleGoHome]);

    const handleLoadSet = useCallback(async (setId: string) => {
        const hasUnsavedChanges = explanations.some(exp => !exp.docId);
        if (hasUnsavedChanges && !window.confirm("저장되지 않은 해설이 있습니다. 저장하지 않은 내용은 사라집니다. 정말로 다른 해설을 불러오시겠습니까?")) {
            return;
        }
        setIsHistoryOpen(false); 
        await loadExplanationSet(setId);
    }, [explanations, loadExplanationSet]);
    
    const resetAfterCancellation = async (mode: ExplanationMode, originalCount: number) => {
        const finalExplanations = explanations.filter(e => !e.isLoading);
        const completedCount = finalExplanations.length;
        const cancelledCount = originalCount - completedCount;

        if (cancelledCount > 0 && user && !isAdmin) {
            const usageDocRef = doc(db, "users", user.uid, "usage", getTodayDateString());
            try {
                await setDoc(usageDocRef, { [mode]: increment(-cancelledCount) }, { merge: true });
                setUsageData(prev => ({ ...prev, [mode]: Math.max(0, (prev[mode] || 0) - cancelledCount) }));
                console.log(`Refunded ${cancelledCount} uses for mode ${mode}.`);
            } catch (e) {
                console.error("Failed to refund usage data:", e);
                setError("사용량 복원에 실패했습니다. 새로고침하여 다시 확인해주세요.");
            }
        }
        setStatusMessage('해설 생성이 취소되었습니다.');
        setTimeout(() => setStatusMessage(null), 3000);
        setIsProcessing(false);
    };

    const handleCancelProcessing = () => {
        if (cancellationController.current) {
            cancellationController.current.abort();
            // --- Instant Cancellation UI Update ---
            setStatusMessage('해설 생성을 취소하는 중...');
            setIsProcessing(false); // Immediately stop the processing state for the UI
            // Remove any explanations that are still in a loading state from the view
            setExplanations(prev => prev.filter(exp => !exp.isLoading));
            setTimeout(() => setStatusMessage(null), 2000); // Clear the cancelling message
        }
    };

    const handleFileProcess = async (files: File[]) => {
        if (files.length === 0 || !user) return;
        
        const isPdf = files.some(f => f.type === 'application/pdf');
        const pageCount = isPdf ? (await Promise.all(files.filter(f => f.type === 'application/pdf').map(async f => {
            try {
                const doc = await getProcessingService()['getPdfDocument'](f);
                return doc.numPages;
            } catch { return 0; }
        }))).reduce((a, b) => a + b, 0) : files.length;
        
        if (pageCount > 5) {
            if (!window.confirm(`경고: ${pageCount}개의 페이지가 감지되었습니다. 모든 페이지를 분석하면 해적 AI API 호출로 인해 상당한 비용이 발생할 수 있습니다. 테스트 시에는 1~2 페이지만 사용하시는 것을 권장합니다. 정말로 계속하시겠습니까?`)) {
                return;
            }
        }

        const currentMode = explanationMode;
        if (!currentMode) {
            setPromptForMode(true);
            setTimeout(() => setPromptForMode(false), 2500);
            return;
        }

        handleGoHome();
        setIsProcessing(true);
        setStatusMessage('파일 분석을 시작합니다...');

        cancellationController.current = new AbortController();
        const signal = cancellationController.current.signal;
        let initialProblemCount = 0;

        try {
            const analyzedProblems = await getProcessingService().analyzeFiles(files, setStatusMessage);

            if (signal.aborted) {
                // resetAfterCancellation handles state, no need to do more here.
                return;
            }

            if (analyzedProblems.length > 0) {
                initialProblemCount = analyzedProblems.length;
                const remainingUsage = tierLimits[currentMode] - (usageData[currentMode] || 0);
                if (analyzedProblems.length > remainingUsage) {
                    const modeLabel = { fast: '빠른해설', dajeong: '표준해설', 'quality': '전문해설' }[currentMode];
                    setError(`'${modeLabel}' 모드의 오늘 사용량을 초과했습니다. 오늘은 ${remainingUsage}개까지 더 생성할 수 있습니다.`);
                    setIsProcessing(false);
                    return;
                }
                
                // UX Improvement: Show cropped problems immediately
                const initialExplanations = await getProcessingService().createInitialExplanations(analyzedProblems, setStatusMessage);

                if (signal.aborted) {
                    return;
                }

                setExplanations(initialExplanations);
                setIsProcessing(true); // Keep processing for generation

                // Charge user upfront
                if (!isAdmin) {
                    const usageDocRef = doc(db, "users", user.uid, "usage", getTodayDateString());
                    await setDoc(usageDocRef, { [currentMode]: increment(initialExplanations.length) }, { merge: true });
                    setUsageData(prev => ({ ...prev, [currentMode]: (prev[currentMode] || 0) + initialExplanations.length }));
                }

                // Generate explanations in the background
                const { refundCount } = await getProcessingService().generateExplanations(
                    initialExplanations,
                    guidelines,
                    currentMode,
                    {
                        setStatusMessage,
                        onUpdateExplanation: (updated) => setExplanations(prev => prev.map(exp => exp.id === updated.id ? updated : exp)),
                    },
                    signal
                );
                
                if (refundCount > 0 && user && !isAdmin) {
                    const usageDocRef = doc(db, "users", user.uid, "usage", getTodayDateString());
                    try {
                        await setDoc(usageDocRef, { [currentMode]: increment(-refundCount) }, { merge: true });
                        setUsageData(prev => ({ ...prev, [currentMode]: Math.max(0, (prev[currentMode] || 0) - refundCount) }));
                        const refundMessage = `(${refundCount}개 해설 생성 실패로 사용량이 복구되었습니다.)`;
                        setStatusMessage(prev => prev ? `${prev}\n${refundMessage}` : refundMessage);
                    } catch (e) {
                        console.error("Failed to refund usage data for failed generations:", e);
                        setError("일부 해설 생성 실패에 대한 사용량 복원에 실패했습니다. 새로고침하여 다시 확인해주세요.");
                    }
                }

                if (signal.aborted) {
                    resetAfterCancellation(currentMode, initialProblemCount);
                } else {
                    setStatusMessage('모든 해설 생성이 완료되었습니다.');
                    setTimeout(() => setStatusMessage(null), 3000);
                    setIsProcessing(false);
                }

            } else {
                setError("해적 AI가 이미지에서 문제를 찾지 못했습니다. 다른 파일을 시도해주세요.");
                setIsProcessing(false);
            }
        } catch (err) {
            if (signal.aborted) {
                console.log("Process was cancelled during an error.");
                resetAfterCancellation(currentMode, initialProblemCount);
                return;
            }
            const errorMessage = err instanceof Error ? err.message : '파일 처리 중 알 수 없는 오류가 발생했습니다.';
            if (errorMessage.includes("해적 AI 이미지 분석 API")) {
                 setApiKeyError(errorMessage);
            } else {
                 setError(errorMessage);
            }
            setIsProcessing(false);
        }
    };
    
    const handlePaste = (event: ClipboardEvent) => {
        if (isProcessing) return;
        
        if (!explanationMode) {
            setPromptForMode(true);
            setTimeout(() => setPromptForMode(false), 2500);
            return;
        }

        const items = event.clipboardData?.items;
        if (!items) return;
        
        const files: File[] = Array.from(items).map(item => item.getAsFile()).filter(Boolean) as File[];
        if (files.length > 0) {
            handleFileProcess(files);
        }
    };

    useEffect(() => {
        // Use a ref to hold the latest handleFileProcess function to avoid stale closures
        const handlePasteRef = (e: ClipboardEvent) => handlePaste(e);
        window.addEventListener('paste', handlePasteRef);
        return () => window.removeEventListener('paste', handlePasteRef);
    }, [isProcessing, explanationMode]); // Re-create listener if these change

    const handleSaveExplanation = useCallback(async (id: number) => {
        if (isSaving.has(id) || !user) return;

        setIsSaving(prev => new Set(prev).add(id));
        setError(null);

        const explanationToSave = explanations.find(e => e.id === id);
        if (!explanationToSave || explanationToSave.docId) {
            setIsSaving(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            return;
        }

        try {
            let setId = currentExplanationSetId;
            let isNewSet = false;

            if (!setId) {
                const newSetRef = await addDoc(collection(db, "explanationSets"), {
                    userId: user.uid,
                    title: `${new Date().toLocaleDateString('ko-KR')} 해설`,
                    createdAt: serverTimestamp(),
                    explanationCount: 0
                });
                setId = newSetRef.id;
                setCurrentExplanationSetId(setId);
                isNewSet = true;
            }

            let finalImage = explanationToSave.problemImage;
            if (finalImage.startsWith('data:image')) {
                finalImage = await uploadProblemImage(user.uid, finalImage);
            }
            
            const { id: reactId, isLoading, isError, ...dataToSave } = explanationToSave;
            const docRef = doc(collection(db, "explanationSets", setId, "explanations"));
            
            await setDoc(docRef, { ...dataToSave, problemImage: finalImage });

            const setDocRef = doc(db, "explanationSets", setId);
            await setDoc(setDocRef, { explanationCount: increment(1) }, { merge: true });

            setExplanations(prev => prev.map(exp =>
                exp.id === id ? { ...exp, docId: docRef.id, problemImage: finalImage } : exp
            ));

            if (isNewSet) {
                 const setsRef = collection(db, "explanationSets");
                 const q = query(setsRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));
                 const querySnapshot = await getDocs(q);
                 setExplanationSets(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExplanationSet)));
            }

        } catch (error) {
            console.error("Save failed:", error);
            setError("해설 저장에 실패했습니다. Firebase Storage 및 Firestore 규칙을 확인해주세요.");
        } finally {
            setIsSaving(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        }
    }, [explanations, currentExplanationSetId, user, isSaving]);


    const handleDeleteExplanation = useCallback(async (id: number) => {
        const expToDelete = explanations.find(e => e.id === id);
        if (!expToDelete) return;
    
        setExplanations(prev => prev.filter(exp => exp.id !== id));
    
        if (expToDelete.docId && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                const expDocRef = doc(db, "explanationSets", currentExplanationSetId, "explanations", expToDelete.docId);
                batch.delete(expDocRef);
    
                const setDocRef = doc(db, "explanationSets", currentExplanationSetId);
                batch.update(setDocRef, { explanationCount: increment(-1) });
                
                await batch.commit();
            } catch (error) {
                console.error("Failed to delete explanation from Firestore:", error);
                setError("해설 삭제에 실패했습니다. 페이지를 새로고침 해주세요.");
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
            console.error("Error deleting set:", error);
            setError("해설 세트 삭제에 실패했습니다.");
        }
    };

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    
    const toggleSelection = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;

        const idsToDelete = Array.from(selectedIds);
        const expsToDelete = explanations.filter(e => idsToDelete.includes(e.id));
        const savedExpsToDelete = expsToDelete.filter(e => e.docId && currentExplanationSetId);

        setExplanations(prev => prev.filter(e => !idsToDelete.includes(e.id)));
        setSelectedIds(new Set());

        if (savedExpsToDelete.length > 0 && currentExplanationSetId) {
            try {
                const batch = writeBatch(db);
                savedExpsToDelete.forEach(exp => {
                    if (exp.docId) { // Type guard
                        const docRef = doc(db, "explanationSets", currentExplanationSetId, "explanations", exp.docId);
                        batch.delete(docRef);
                    }
                });
                
                const setDocRef = doc(db, "explanationSets", currentExplanationSetId);
                batch.update(setDocRef, { explanationCount: increment(-savedExpsToDelete.length) });

                await batch.commit();
            } catch (error) {
                console.error("Batch delete failed:", error);
                setError("선택한 해설 삭제에 실패했습니다.");
                setExplanations(prev => [...prev, ...expsToDelete].sort((a,b)=>a.problemNumber-b.problemNumber));
            }
        }
    };
    
    const handleSaveSelected = useCallback(async () => {
        if (selectedIds.size === 0) return;
        
        const unsavedSelected = explanations.filter(exp => selectedIds.has(exp.id) && !exp.docId);

        if (unsavedSelected.length === 0) {
            alert("선택된 해설 중 새로 저장할 항목이 없습니다.");
            return;
        }

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
        if (userTier === 'basic' || selectedIds.size === 0 || !user) {
            return; // Button is disabled, but this is a safeguard
        }
    
        const selectedExplanations = explanations.filter(exp => selectedIds.has(exp.id));
    
        const unsavedExplanations = selectedExplanations.filter(exp => !exp.docId || exp.problemImage.startsWith('data:image'));
        if (unsavedExplanations.length > 0) {
            alert(`저장되지 않은 해설이 ${unsavedExplanations.length}개 있습니다. '선택 저장' 버튼을 눌러 먼저 모든 해설을 저장해주세요.`);
            return;
        }
        
        setStatusMessage("HWP 변환 요청 접수 중...");
        setIsProcessing(true);
    
        try {
            const requestData: HwpExplanationData[] = selectedExplanations.map(exp => ({
                problemImage: exp.problemImage,
                markdown: exp.markdown,
                problemNumber: exp.problemNumber
            }));
    
            await addDoc(collection(db, "hwpRequests"), {
                userId: user.uid,
                userEmail: user.email || 'N/A',
                createdAt: serverTimestamp(),
                status: 'pending',
                explanations: requestData
            });
            
            alert("접수 되었습니다. 관리자 확인 후 마이페이지에서 파일을 받으실 수 있습니다.");
    
        } catch (error) {
            console.error("Failed to submit HWP request:", error);
            setError("HWP 요청 접수에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
            
            const assetsDocRef = doc(db, 'settings', 'uiAssets');
            await setDoc(assetsDocRef, { dropzoneImageUrl: downloadURL }, { merge: true });

            setUiAssets(prev => ({...prev, dropzoneImageUrl: downloadURL}));
            setStatusMessage("이미지 업로드 및 적용 완료!");
        } catch(e) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : 'UI 이미지 업로드에 실패했습니다.';
            setError(errorMessage);
            // Re-throw the error so the calling component knows about the failure.
            throw new Error(errorMessage);
        } finally {
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            // The onAuthStateChanged listener will automatically handle state reset via handleGoHome()
        } catch (err) {
            console.error("Logout failed:", err);
        }
    };

    if (isAuthenticating) {
        return <div className="w-full h-screen flex items-center justify-center"><Loader status="사용자 정보 확인 중..." /></div>;
    }

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
                        onGoHome={handleGoHome}
                        onOpenThemeEditor={() => setIsThemeEditorOpen(true)}
                        onOpenHistory={() => setIsHistoryOpen(true)}
                        explanationMode={explanationMode}
                        onSetExplanationMode={setExplanationMode}
                        user={user}
                        onLogout={handleLogout}
                        usageData={usageData}
                        tierLimits={tierLimits}
                        isProcessing={isProcessing}
                        promptForMode={promptForMode}
                        isAdmin={isAdmin}
                        onOpenGuidelines={() => setIsGuidelinesOpen(true)}
                        onOpenHwpRequests={() => setIsHwpRequestsOpen(true)}
                    />
                    <main className="w-full max-w-4xl mx-auto p-4 md:p-8 flex-grow">
                        {apiKeyError && <ApiKeyErrorDisplay message={apiKeyError} />}
                        {error && !apiKeyError && (
                            <div className="bg-danger/20 border border-danger text-danger p-4 rounded-md mb-6">
                                <strong>오류:</strong> {error}
                            </div>
                        )}
                        
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1 min-w-0">
                                {isProcessing && <div className="flex justify-center my-12"><Loader status={statusMessage || '처리 중...'} onCancel={handleCancelProcessing} /></div>}
                                
                                {explanations.length === 0 && !isProcessing && !apiKeyError && (
                                    <div>
                                        <FileDropzone 
                                            onFileProcess={handleFileProcess} 
                                            dropzoneImageUrl={uiAssets.dropzoneImageUrl}
                                        />
                                        <p className="text-right text-sm text-danger mt-2 pr-2">해설 - ver2.0</p>
                                    </div>
                                )}

                                {explanations.length > 0 && (
                                    <>
                                        <div className="bg-surface p-4 rounded-lg mb-6 border border-primary flex flex-col sm:flex-row justify-between items-center gap-4">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <label htmlFor="selection-mode" className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" id="selection-mode" checked={isSelectionMode} onChange={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedIds(new Set()); }} className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent" />
                                                    <span className="font-semibold">선택</span>
                                                </label>
                                                 {isSelectionMode && (
                                                    <>
                                                        <button onClick={() => setSelectedIds(new Set(explanations.map(e => e.id)))} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-accent hover:text-white transition-colors">전체 선택</button>
                                                        <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-primary transition-colors">선택 해제</button>
                                                        <span className="text-sm text-text-secondary">{selectedIds.size} / {explanations.length}개 선택됨</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {isSelectionMode && (
                                                    <>
                                                        <button 
                                                            onClick={handleSaveSelected}
                                                            disabled={selectedIds.size === 0}
                                                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <SaveIcon /> 선택 저장
                                                        </button>
                                                        <button 
                                                            onClick={handleDeleteSelected} 
                                                            disabled={selectedIds.size === 0} 
                                                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-danger/20 text-danger rounded-md hover:bg-danger/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <TrashIcon/> 선택 삭제
                                                        </button>
                                                    </>
                                                )}
                                                <button 
                                                    onClick={handleHwpRequest} 
                                                    disabled={!isSelectionMode || selectedIds.size === 0 || userTier === 'basic'}
                                                    className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary hover:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
                                                >
                                                    <div 
                                                        className="absolute inset-0 bg-no-repeat bg-center opacity-25 group-hover:opacity-50 transition-opacity pointer-events-none"
                                                        style={{ 
                                                            backgroundImage: `url('${uiAssets.hwpButtonBgUrl}')`,
                                                            backgroundSize: '70%' 
                                                        }}
                                                    />
                                                    <span className="relative flex items-center gap-2">
                                                        <HwpIcon /> 한글(HWP)로 내보내기
                                                    </span>
                                                    <div className="relative group/tooltip ml-1.5">
                                                        <QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs font-semibold text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                            샤프등급이상부터 사용가능합니다
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div>
                                                        </div>
                                                    </div>
                                                </button>
                                                <button 
                                                    disabled={true} 
                                                    className="relative flex items-center justify-center px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md border border-primary transition-all opacity-50 cursor-not-allowed overflow-hidden group"
                                                >
                                                    <div 
                                                        className="absolute inset-0 bg-no-repeat bg-center opacity-25 pointer-events-none"
                                                        style={{ 
                                                            backgroundImage: `url('${uiAssets.pdfButtonBgUrl}')`,
                                                            backgroundSize: '70%' 
                                                        }}
                                                    />
                                                    <span className="relative flex items-center gap-2">
                                                        <PdfIcon /> PDF로 내보내기
                                                    </span>
                                                     <div className="relative group/tooltip ml-1.5">
                                                        <QuestionMarkCircleIcon />
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 text-xs font-semibold text-white bg-gray-900/80 rounded-md opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                            준비중입니다
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900/80"></div>
                                                        </div>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid gap-6">
                                            {sortedExplanations.map((exp, index) => (
                                                <ExplanationCard 
                                                    key={exp.id} 
                                                    id={`explanation-card-${exp.id}`} 
                                                    explanation={exp} 
                                                    guidelines={guidelines} 
                                                    onDelete={handleDeleteExplanation} 
                                                    onSave={handleSaveExplanation}
                                                    isSaving={isSaving.has(exp.id)}
                                                    setRenderedContentRef={(el) => { renderedContentRefs.current[index] = el; }} 
                                                    isSelectionMode={isSelectionMode} 
                                                    isSelected={selectedIds.has(exp.id)} 
                                                    onSelect={toggleSelection} 
                                                    onOpenQna={handleOpenQna} 
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            {explanations.length > 0 && (
                                <div className="w-full lg:w-80 lg:flex-shrink-0 relative">
                                    <div className="lg:sticky lg:top-1/2 lg:-translate-y-1/2">
                                        <QnaPanel data={activeQna} onClose={handleCloseQna} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                    <Footer onOpenTerms={() => setIsTermsOpen(true)} onOpenPrivacy={() => setIsPrivacyOpen(true)} />
                </>
            )}
            
            {isAdmin && <GuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} guidelines={guidelines} setGuidelines={setGuidelines} />}
            {isAdmin && <AdminHwpRequestsModal isOpen={isHwpRequestsOpen} onClose={() => setIsHwpRequestsOpen(false)} />}
            <ThemeEditor isOpen={isThemeEditorOpen} onClose={() => setIsThemeEditorOpen(false)} />
            <HistoryPanel 
                isOpen={isHistoryOpen} 
                onClose={() => setIsHistoryOpen(false)} 
                sets={explanationSets} 
                onLoadSet={handleLoadSet} 
                onDeleteSet={handleDeleteSet} 
                user={user}
                userTier={userTier} 
                usageData={usageData}
                tierLimits={tierLimits}
                isAdmin={isAdmin}
                onUiAssetUpload={handleUiAssetUpload}
            />
            <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
        </div>
    );
}