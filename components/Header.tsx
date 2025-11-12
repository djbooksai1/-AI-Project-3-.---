

import React from 'react';
import { PaletteIcon } from './icons/PaletteIcon';
import { User } from 'firebase/auth';
import { HistoryIcon } from './icons/HistoryIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';
import { DockIcon } from './icons/DockIcon';

interface HeaderProps {
    onGoHome: () => void;
    onOpenThemeEditor: () => void;
    onOpenHistory: () => void;
    user: User | null;
    onLogout: () => void;
    isAdmin: boolean;
    onOpenHwpRequests: () => void;
    onOpenDock: () => void;
}

export function Header({ 
    onGoHome, 
    onOpenThemeEditor, 
    onOpenHistory,
    user, 
    onLogout,
    isAdmin,
    onOpenHwpRequests,
    onOpenDock
}: HeaderProps) {
    return (
        <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-10 border-b border-primary">
            <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div className="flex-shrink-0 self-start lg:self-center">
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center lg:justify-end gap-4 w-full lg:w-auto">
                        <div className="flex items-center flex-wrap justify-center sm:justify-end gap-2 md:gap-3">
                            <span className="text-sm text-text-secondary hidden xl:inline">{user.email}</span>
                            
                             <button
                                onClick={onOpenDock}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary"
                                title="선착장"
                            >
                                <DockIcon />
                                <span className="hidden md:inline">선착장</span>
                            </button>

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