import React from 'react';

interface HeaderProps {
    onOpenGuidelines: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenGuidelines }) => {
    return (
        <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-10 border-b border-primary">
            <div className="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
                <div className="inline-grid">
                    <h1 className="text-4xl md:text-5xl font-black text-accent tracking-[0.2em] whitespace-nowrap select-none">
                        해적
                    </h1>
                    <h2
                        className="text-xs md:text-sm text-text-secondary mt-1 select-none flex justify-between px-3"
                    >
                        <span>해설</span>
                        <span>적용하기</span>
                    </h2>
                </div>
                <button
                    onClick={onOpenGuidelines}
                    className="px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-primary transition-colors border border-primary"
                >
                    해설강령 ver1.0
                </button>
            </div>
        </header>
    );
};