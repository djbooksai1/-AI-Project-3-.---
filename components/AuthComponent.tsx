import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebaseConfig';
import { 
    RecaptchaVerifier,
    signInWithPhoneNumber,
    ConfirmationResult
} from 'firebase/auth';

export const AuthComponent = ({ appError }: { appError: string | null }) => {
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
        <div className="w-full max-w-sm">
            <div className="bg-surface p-8 rounded-2xl shadow-lg border border-primary text-center">
                <div className="mb-6">
                    <h2 className="text-6xl font-black text-accent">해.적</h2>
                </div>
                <div className="mb-4">
                    <p className="text-2xl font-bold text-accent">: 해설을, 적다.</p>
                </div>
                <p className="text-sm text-text-secondary mb-6">
                    대한민국 최고의 문제풀이 및 해설 서비스
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
    );
};