

import React from 'react';
import { PaletteIcon } from './icons/PaletteIcon';
import { ExplanationMode, UsageData } from '../types';
import { User } from 'firebase/auth';
import { HistoryIcon } from './icons/HistoryIcon';

type SavingStatus = 'idle' | 'saving' | 'saved' | 'error';
interface HeaderProps {
    onGoHome: () => void;
    onOpenGuidelines: () => void;
    onOpenThemeEditor: () => void;
    onOpenHistory: () => void;
    explanationMode: ExplanationMode;
    onSetExplanationMode: (mode: ExplanationMode) => void;
    user: User | null;
    onLogout: () => void;
    savingStatus: SavingStatus;
    usageData: UsageData;
    tierLimits: UsageData;
    isProcessing: boolean;
}

export function Header({ 
    onGoHome, 
    onOpenGuidelines, 
    onOpenThemeEditor, 
    onOpenHistory,
    explanationMode, 
    onSetExplanationMode, 
    user, 
    onLogout,
    savingStatus,
    usageData,
    tierLimits,
    isProcessing
}: HeaderProps) {
    // 여기에서 UI에 표시될 해설 모드의 이름을 자유롭게 변경할 수 있습니다.
    // 'id'는 데이터베이스와 코드 로직에서 사용되는 고유 값이므로 변경해서는 안 됩니다.
    const modes: { id: ExplanationMode, label: string, title: string }[] = [
        { id: 'fast', label: '빠른해설', title: 'gemini-2.5-flash 모델을 사용하여 신속하게 해설을 생성합니다.' },
        { id: 'dajeong', label: '표준해설', title: 'gemini-2.5-pro 모델을 사용하여 속도와 품질의 균형을 맞춘 표준 해설을 생성합니다.' },
        { id: 'quality', label: '전문해설', title: 'gemini-2.5-pro 모델의 Deep Thinking 기능을 활성화하여 매우 복잡한 문제에 대한 심층적인 해설을 생성합니다 (느림).' },
    ];

    const getStatusIndicator = () => {
        switch (savingStatus) {
            case 'saving':
                return <span className="text-sm text-accent animate-pulse">자동 저장 중...</span>;
            case 'saved':
                return <span className="text-sm text-success">저장 완료</span>;
            case 'error':
                return <span className="text-sm text-danger">저장 실패</span>;
            default:
                return null;
        }
    };
    
    const getRemaining = (mode: ExplanationMode) => {
        const limit = tierLimits[mode];
        const used = usageData[mode] || 0;
        if (limit === Infinity) {
            return '∞';
        }
        return Math.max(0, limit - used);
    };

    return (
        <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-10 border-b border-primary">
            <div className="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <button onClick={onGoHome} className="inline-grid text-left">
                        <h1 className="text-4xl md:text-5xl font-black text-accent tracking-[0.2em] whitespace-nowrap select-none">
                            해적
                        </h1>
                        <h2 className="text-xs md:text-sm text-text-secondary mt-1 select-none text-center tracking-wider">
                            해.적 : 해설을, 적다.
                        </h2>
                    </button>
                    {user && (
                         <button
                            onClick={onOpenGuidelines}
                            className="px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary hidden lg:block"
                        >
                            해설강령 ver2.0
                        </button>
                    )}
                </div>

                {user && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-surface p-1 rounded-lg border border-primary">
                            {modes.map(mode => {
                                const remaining = getRemaining(mode.id);
                                const isExhausted = remaining === 0;
                                return (
                                    <button
                                        key={mode.id}
                                        onClick={() => onSetExplanationMode(mode.id)}
                                        disabled={isProcessing}
                                        className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap relative ${
                                            explanationMode === mode.id
                                                ? 'bg-accent text-white shadow-sm'
                                                : 'bg-transparent text-text-secondary hover:bg-primary/50'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        title={`${mode.title}\n오늘 남은 횟수: ${remaining}`}
                                    >
                                        {mode.label}
                                        <span className={`absolute -top-1.5 -right-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                            isExhausted
                                                ? 'bg-danger text-white'
                                                : explanationMode === mode.id
                                                ? 'bg-white text-accent'
                                                : 'bg-primary text-text-secondary'
                                        }`}>
                                            {remaining}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-24 text-center hidden sm:block">{getStatusIndicator()}</div>
                            <span className="text-sm text-text-secondary hidden xl:inline">{user.email}</span>
                            
                            <button
                                onClick={onOpenHistory}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover transition-colors"
                                title="마이페이지"
                            >
                                <HistoryIcon />
                                <span className="hidden md:inline">마이페이지</span>
                            </button>
                            
                            <button
                                onClick={onOpenThemeEditor}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary"
                                title="지도 꾸미기"
                            >
                                <PaletteIcon />
                                 <span className="hidden md:inline">지도 꾸미기</span>
                            </button>
                            
                            <button onClick={onLogout} className="px-4 py-2 text-sm font-semibold bg-danger text-white rounded-md hover:bg-danger/80 transition-colors">
                                로그아웃
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
};