import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';
import { XIcon } from './icons/XIcon';

interface ThemeEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

type EditorTab = 'colors' | 'typography';

// FIX: Changed props to use React.PropsWithChildren for better type safety with children.
type TabButtonProps = React.PropsWithChildren<{
    tab: EditorTab;
    activeTab: EditorTab;
    setActiveTab: (tab: EditorTab) => void;
}>;

function TabButton({ tab, activeTab, setActiveTab, children }: TabButtonProps) {
    return (
        <button
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === tab ? 'bg-surface text-accent border-b-2 border-accent' : 'bg-transparent text-text-secondary hover:text-text-primary'}`}
        >
            {children}
        </button>
    );
}

export function ThemeEditor({ isOpen, onClose }: ThemeEditorProps) {
    const {
        theme, setTheme, themes,
        explanationFontSize, setExplanationFontSize,
        explanationMathSize, setExplanationMathSize,
        explanationTextFont, setExplanationTextFont, textFonts,
        explanationPadding, setExplanationPadding,
        saveThemeSettingsToFirestore, // Get the save function from context
    } = useTheme();
    const [activeTab, setActiveTab] = useState<EditorTab>('colors');

    const handleClose = useCallback(async () => {
        await saveThemeSettingsToFirestore(); // Save settings before closing
        onClose();
    }, [saveThemeSettingsToFirestore, onClose]);

    if (!isOpen) return null;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'colors':
                return (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {themes.map(t => (
                            <button
                                key={t.name}
                                onClick={() => setTheme(t)}
                                className={`p-2 border-2 rounded-lg transition-colors ${theme.name === t.name ? 'border-accent' : 'border-primary bg-background hover:border-accent/50'}`}
                            >
                                <div className="flex gap-1 mb-2">
                                    <div style={{ backgroundColor: t.colors.background }} className="w-1/4 h-8 rounded-sm"></div>
                                    <div style={{ backgroundColor: t.colors.surface }} className="w-1/4 h-8 rounded-sm"></div>
                                    <div style={{ backgroundColor: t.colors.accent }} className="w-1/4 h-8 rounded-sm"></div>
                                    <div style={{ backgroundColor: t.colors['text-primary'] }} className="w-1/4 h-8 rounded-sm"></div>
                                </div>
                                <span className="text-text-primary">{t.name}</span>
                            </button>
                        ))}
                    </div>
                );
            case 'typography':
                return (
                    <div className="space-y-6">
                        {/* Font Size */}
                        <div>
                            <label htmlFor="font-size" className="block mb-2 font-semibold">해적지도 본문 폰트 크기: {explanationFontSize.toFixed(1)}px</label>
                            <input
                                id="font-size"
                                type="range"
                                min="12"
                                max="20"
                                step="0.1"
                                value={explanationFontSize}
                                onChange={(e) => setExplanationFontSize(Number(e.target.value))}
                                className="w-full h-2 bg-primary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        {/* Math Size */}
                        <div>
                            <label htmlFor="math-size" className="block mb-2 font-semibold">해적지도 수식 크기: {explanationMathSize}%</label>
                            <input
                                id="math-size"
                                type="range"
                                min="80"
                                max="150"
                                value={explanationMathSize}
                                onChange={(e) => setExplanationMathSize(Number(e.target.value))}
                                className="w-full h-2 bg-primary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        {/* Padding */}
                        <div>
                            <label htmlFor="padding-size" className="block mb-2 font-semibold">해적지도 좌우 여백: {explanationPadding}px</label>
                            <input
                                id="padding-size"
                                type="range"
                                min="8"
                                max="48"
                                step="1"
                                value={explanationPadding}
                                onChange={(e) => setExplanationPadding(Number(e.target.value))}
                                className="w-full h-2 bg-primary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        {/* Text Font Family */}
                        <div>
                            <label htmlFor="text-font" className="block mb-2 font-semibold">해적지도 본문 글꼴</label>
                            <select
                                id="text-font"
                                value={explanationTextFont.name}
                                onChange={(e) => {
                                    const selectedFont = textFonts.find(f => f.name === e.target.value);
                                    if (selectedFont) setExplanationTextFont(selectedFont);
                                }}
                                className="w-full p-2 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent outline-none"
                            >
                                {textFonts.map(font => <option key={font.name} value={font.name}>{font.name}</option>)}
                            </select>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div
                className="bg-surface rounded-lg shadow-xl w-full max-w-3xl transform transition-all border border-primary max-h-[90vh] flex flex-col"
            >
                <div
                    className="p-4 flex justify-between items-center border-b border-primary"
                >
                    <h2 className="text-xl font-bold text-accent">지도 꾸미기</h2>
                    <button onClick={handleClose} className="p-2 rounded-full hover:bg-primary cursor-pointer">
                        <XIcon />
                    </button>
                </div>
                <div className="border-b border-primary px-4">
                    <nav className="flex items-center gap-4">
                        <TabButton tab="colors" activeTab={activeTab} setActiveTab={setActiveTab}>색상 배합</TabButton>
                        <TabButton tab="typography" activeTab={activeTab} setActiveTab={setActiveTab}>글꼴/크기</TabButton>
                    </nav>
                </div>
                <div className="p-6 overflow-y-auto">
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};