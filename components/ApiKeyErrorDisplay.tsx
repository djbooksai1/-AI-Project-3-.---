import React from 'react';

export const ApiKeyErrorDisplay = ({ message }: { message: string }) => {
    return (
        <div className="bg-danger/20 border border-danger text-danger p-6 rounded-lg mb-6 shadow-md">
            <strong className="font-bold text-lg block mb-2">해적 AI 서비스 설정 오류</strong>
            <p className="mt-2 text-sm">{message}</p>
            <div className="mt-4 text-sm bg-background/50 p-4 rounded-md text-text-primary">
                <p className="font-semibold text-base">해결 방법:</p>
                <ol className="list-decimal list-inside mt-2 space-y-2">
                    <li>Google Cloud Console에 로그인하여 올바른 프로젝트를 선택했는지 확인하세요.</li>
                    <li>'API 및 서비스' &gt; '라이브러리'에서 <strong>Generative Language API</strong>를 검색하여 '사용 설정'했는지 확인하세요.</li>
                    <li>'API 및 서비스' &gt; '사용자 인증 정보'에서 사용 중인 API 키가 <strong>Generative Language API</strong>를 사용하도록 제한되지 않았는지 확인하세요.</li>
                    <li>프로젝트에 <a href="https://cloud.google.com/billing/docs/how-to/modify-project" target="_blank" rel="noopener noreferrer" className="underline font-bold text-accent hover:text-accent-hover">결제 계정이 연결</a>되어 있고 활성화 상태인지 확인하세요.</li>
                    <li>Firebase Console의 <strong>Firestore Database</strong> &gt; <strong>규칙(Rules)</strong> 탭에서 로그인한 사용자가 `prompts` 컬렉션을 읽을 수 있도록 허용되었는지 확인하세요. (예: `allow read: if request.auth != null;`)</li>
                </ol>
                <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="inline-block mt-4 px-5 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover transition-colors">
                    Google Cloud Console로 이동
                </a>
            </div>
        </div>
    );
};