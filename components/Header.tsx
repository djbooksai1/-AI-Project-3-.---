import React from 'react';
import { PaletteIcon } from './icons/PaletteIcon';
import { ExplanationMode, UsageData, UserTier } from '../types';
import { User } from 'firebase/auth';
import { HistoryIcon } from './icons/HistoryIcon';
import { BookIcon } from './icons/BookIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';

type SavingStatus = 'idle' | 'saving' | 'saved' | 'error';
interface HeaderProps {
    onGoHome: () => void;
    onOpenThemeEditor: () => void;
    onOpenHistory: () => void;
    explanationMode: ExplanationMode | null;
    onSetExplanationMode: (mode: ExplanationMode) => void;
    user: User | null;
    onLogout: () => void;
    usageData: UsageData;
    tierLimits: UsageData;
    isProcessing: boolean;
    promptForMode: boolean;
    isAdmin: boolean;
    onOpenGuidelines: () => void;
    onOpenHwpRequests: () => void;
}

export function Header({ 
    onGoHome, 
    onOpenThemeEditor, 
    onOpenHistory,
    explanationMode, 
    onSetExplanationMode, 
    user, 
    onLogout,
    usageData,
    tierLimits,
    isProcessing,
    promptForMode,
    isAdmin,
    onOpenGuidelines,
    onOpenHwpRequests
}: HeaderProps) {
    const modes: { id: ExplanationMode, label: string, title: string }[] = [
        { id: 'fast', label: '빠른해설', title: '빠른 해설을 위한 해석의 ai 를 활용합니다.' },
        { id: 'dajeong', label: '표준해설', title: '속도와 품질을 챙기기 위한 균형잡힌 해적의 ai를 활용합니다.' },
        { id: 'quality', label: '전문해설', title: '복잡한 문제와 엄격한 강령준수를 위한 해적의 고급형 ai 를 활용합니다.' },
    ];
    
    const activeColorClass: Record<ExplanationMode, string> = {
        fast: 'bg-blue-600 text-white', // 푸른색
        dajeong: 'bg-red-600 text-white', // 붉은색
        quality: 'bg-gold text-black' // 황금색
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
            <div className="w-full lg:w-1/2 mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <button onClick={onGoHome} className="inline-grid text-left">
                            <h1 className="text-4xl md:text-5xl font-black text-accent tracking-[0.2em] whitespace-nowrap select-none">
                                해적
                            </h1>
                            <h2 className="text-xs md:text-sm text-text-secondary mt-1 select-none text-center tracking-wider">
                                해설을, 적다.
                            </h2>
                        </button>
                    </div>
                </div>

                {user && (
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className={`flex items-center bg-surface p-1 rounded-lg border border-primary transition-all duration-300 ${promptForMode ? 'animate-pulse-red-border' : ''}`}>
                                {modes.map(mode => {
                                    const remaining = getRemaining(mode.id);
                                    const isExhausted = remaining === 0;
                                    const isActive = explanationMode === mode.id;

                                    return (
                                        <button
                                            key={mode.id}
                                            onClick={() => onSetExplanationMode(mode.id)}
                                            disabled={isProcessing}
                                            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap relative ${
                                                isActive
                                                    ? activeColorClass[mode.id]
                                                    : 'bg-transparent text-text-secondary hover:bg-primary/50'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                            title={`${mode.title}\n오늘 남은 횟수: ${remaining}`}
                                        >
                                            {mode.label}
                                            <span className={`absolute -top-1.5 -right-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                                isExhausted
                                                    ? 'bg-danger text-white'
                                                    : isActive
                                                    ? `bg-white ${mode.id === 'quality' ? 'text-black' : 'text-accent'}`
                                                    : 'bg-primary text-text-secondary'
                                            }`}>
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
                        
                        <div className="flex items-center gap-2 md:gap-3">
                            <span className="text-sm text-text-secondary hidden xl:inline">{user.email}</span>
                            
                            <button
                                onClick={onOpenHistory}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover transition-colors"
                                title="마이페이지"
                            >
                                <HistoryIcon />
                                <span className="hidden md:inline">마이페이지</span>
                            </button>
                            
                            {isAdmin && (
                                <>
                                <button
                                    onClick={onOpenHwpRequests}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary"
                                    title="HWP 요청 목록"
                                >
                                    <ClipboardListIcon />
                                    <span className="hidden md:inline">HWP 요청</span>
                                </button>
                                <button
                                    onClick={onOpenGuidelines}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary"
                                    title="해설강령 관리"
                                >
                                    <BookIcon />
                                    <span className="hidden md:inline">강령 관리</span>
                                </button>
                                </>
                            )}
                            
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