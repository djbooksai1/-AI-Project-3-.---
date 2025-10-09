import React from 'react';

interface LoaderProps {
    status: string;
    remainingTime?: number | null;
}

const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
        return `약 ${minutes}분 ${seconds}초`;
    }
    return `약 ${seconds}초`;
}

export const Loader: React.FC<LoaderProps> = ({ status, remainingTime }) => {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-accent"></div>
            <p className="mt-6 text-lg font-semibold text-text-primary">{status}</p>
            {remainingTime && remainingTime > 0 ? (
                <p className="mt-2 text-sm text-text-secondary">
                    예상 완료 시간: {formatTime(remainingTime)}
                </p>
            ) : (
                <p className="mt-2 text-sm text-text-secondary">잠시만 기다려주세요...</p>
            )}
        </div>
    );
};