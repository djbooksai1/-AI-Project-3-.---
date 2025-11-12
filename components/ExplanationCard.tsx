import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { type Explanation, type QnaData, ExplanationMode } from '../types';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { useTheme } from '../hooks/useTheme';
import { CheckIcon } from './icons/CheckIcon';
import { SaveIcon } from './icons/SaveIcon';
import { GoldIcon } from './icons/GoldIcon';
import { RetryIcon } from './icons/RetryIcon';
import { useVariationGenerator } from '../hooks/useVariationGenerator';
import { MarkdownRenderer } from './MarkdownRenderer';


interface ExplanationCardProps {
    explanation: Explanation;
    index: number;
    totalCards: number;
    onDelete: (id: number) => void;
    onSave: (id: number) => void;
    onRetry: (id: number) => void;
    isSaving: boolean;
    isRetrying: boolean;
    setRenderedContentRef: (el: HTMLDivElement | null) => void;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onOpenQna: (data: QnaData) => void;
    isAdmin: boolean;
    onSaveToCache: (explanation: Explanation) => void;
    onRetryRecognition: (id: number) => void;
    isRetryingRecognition: boolean;
}

const ImageModal: React.FC<{isOpen: boolean; onClose: () => void; imageUrl: string; altText: string}> = ({ isOpen, onClose, imageUrl, altText }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            modalRef.current?.focus();
        }
    }, [isOpen]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation(); 
            onClose();
        }
    };

    if (!isOpen) return null;
    return (
        <div 
            ref={modalRef}
            tabIndex={-1} 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 cursor-zoom-out outline-none" 
            onClick={onClose}
            onKeyDown={handleKeyDown}
        >
            <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
                <img src={imageUrl} alt={altText} className="block max-w-[95vw] max-h-[95vh] object-contain rounded-md" />
                <button onClick={onClose} className="absolute -top-3 -right-3 bg-surface text-text-primary rounded-full h-8 w-8 flex items-center justify-center text-xl font-bold hover:bg-danger" aria-label="Close image viewer">&times;</button>
            </div>
        </div>
    );
};

const DifficultyStars: React.FC<{ level?: number }> = ({ level }) => {
    if (typeof level !== 'number') return null;
    return (
        <div className="flex items-center gap-0.5" title={`난이도 ${level}/5`}>
            {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className={`w-4 h-4 ${i < level ? 'text-yellow-400' : 'text-primary/50'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </div>
    );
};

const modeMap: Record<ExplanationMode, string> = {
    fast: '빠른해설',
    dajeong: '표준해설',
    quality: '전문해설',
};

export const ExplanationCard: React.FC<ExplanationCardProps> = ({ explanation, index, totalCards, onDelete, onSave, onRetry, isSaving, isRetrying, setRenderedContentRef, id, isSelectionMode, isSelected, onSelect, onOpenQna, isAdmin, onSaveToCache, onRetryRecognition, isRetryingRecognition }) => {
    const [isExpanded, setIsExpanded] = useState(index === 0);
    const renderedContentRef = useRef<HTMLDivElement>(null);
    const { explanationFontSize, explanationMathSize, explanationTextFont, explanationPadding, theme } = useTheme();
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const {
        variationState,
        variationIdeas,
        generatedVariation,
        variationError,
        handleGenerateNumbersVariation,
        handleFetchIdeas,
        handleGenerateFromIdea,
        handleResetVariation,
    } = useVariationGenerator(explanation.originalProblemText, explanation.variationProblem);
    
    const accentColor = theme.colors.accent;

    useLayoutEffect(() => {
        setRenderedContentRef(renderedContentRef.current);
        return () => setRenderedContentRef(null);
    }, [setRenderedContentRef, isExpanded]);
    
    const choiceItems = useMemo(() => {
        if (!explanation.choices) return [];
        // This regex splits the string before each circled number, preserving the number.
        // It works whether the choices are on the same line or separated by newlines.
        const splitRegex = /(?=①|②|③|④|⑤)/;
        return explanation.choices.split(splitRegex).filter(choice => choice.trim() !== '');
    }, [explanation.choices]);

    const markdownStyle = useMemo(() => ({
        fontSize: `${explanationFontSize}px`,
        fontFamily: explanationTextFont.family,
    }), [explanationFontSize, explanationTextFont]);

    const explanationStyle = useMemo(() => ({
        fontSize: `${explanationFontSize}px`,
        fontFamily: explanationTextFont.family,
        padding: `${explanationPadding}px`,
    }), [explanationFontSize, explanationTextFont, explanationPadding]);

    const handleExplanationClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        let target = event.target as HTMLElement;

        // Traverse up to find a meaningful block element (p, li, etc.)
        const blockElements = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'];
        while (target && target !== event.currentTarget) {
            if (blockElements.includes(target.tagName)) {
                break;
            }
            target = target.parentElement as HTMLElement;
        }

        // If we found a block element and it's not the container itself
        if (target && target !== event.currentTarget) {
            const selectedLine = target.textContent || '';
            const selectedLineHtml = target.innerHTML;

            if (selectedLine.trim()) {
                onOpenQna({
                    cardId: explanation.id,
                    problemText: explanation.originalProblemText,
                    fullExplanation: explanation.markdown,
                    selectedLine,
                    selectedLineHtml,
                });
            }
        }
    }, [explanation, onOpenQna]);
    
    return (
        <div id={id} className={`bg-surface rounded-lg shadow-md border transition-all duration-300 overflow-hidden ${isSelectionMode && isSelected ? 'border-accent ring-2 ring-accent' : explanation.isGolden ? 'border-gold' : 'border-primary'}`}>
            <ImageModal isOpen={isImageModalOpen} onClose={() => setIsImageModalOpen(false)} imageUrl={explanation.problemImage} altText={`Problem ${explanation.problemNumber}`} />
            <div 
                className="flex items-center justify-between p-3 border-b border-primary cursor-pointer"
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    setIsExpanded(!isExpanded)}
                }
            >
                <div className="flex items-center gap-3 flex-wrap">
                    {isSelectionMode && <input type="checkbox" checked={isSelected} onChange={() => onSelect(explanation.id)} onClick={e => e.stopPropagation()} className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent cursor-pointer" />}
                    <span className="text-lg font-bold text-accent">문제 {explanation.problemNumber}</span>
                    <span className="text-sm text-text-secondary">(출처: {explanation.pageNumber}p)</span>
                    {explanation.explanationMode && (
                        <span className="text-xs font-semibold bg-primary/50 text-text-secondary px-2 py-0.5 rounded-full whitespace-nowrap">
                            {modeMap[explanation.explanationMode]} / 
                            직접선택 {explanation.isManualSelection ? 'O' : 'X'} / 
                            다정강령 {explanation.usedDajeongGuidelines ? 'O' : 'X'}
                        </span>
                    )}
                    {explanation.isGolden && <div title="해적 캐시 인증됨"><GoldIcon /></div>}
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && !explanation.isGolden && <button onClick={(e) => { e.stopPropagation(); onSaveToCache(explanation); }} className="p-2 rounded-full text-text-secondary hover:bg-gold hover:text-black" title="캐시에 저장"><GoldIcon /></button>}
                    {!explanation.docId ? <button onClick={(e) => { e.stopPropagation(); onSave(explanation.id); }} disabled={isSaving} className="p-2 rounded-full text-text-secondary hover:bg-accent hover:text-white disabled:opacity-50" title="저장">{isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SaveIcon />}</button> : <div className="p-2 text-success" title="저장됨"><CheckIcon /></div>}
                    <button onClick={(e) => { e.stopPropagation(); onDelete(explanation.id); }} className="p-2 rounded-full text-text-secondary hover:bg-danger hover:text-white" title="삭제"><XIcon /></button>
                    <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-2 rounded-full text-text-secondary hover:bg-primary" title={isExpanded ? "접기" : "펼치기"}>{isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}</button>
                </div>
            </div>
            {isExpanded && (
                <div className="relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                        <div className="flex flex-col overflow-hidden">
                            <h4 className="text-sm font-semibold text-text-secondary mb-2 text-center">인식된 페이지</h4>
                            <div className="flex-grow flex items-center justify-center p-2 bg-background rounded-md border border-primary/30 min-h-[150px] overflow-hidden">
                                <img 
                                    src={explanation.problemImage} 
                                    alt={`Problem ${explanation.problemNumber}`} 
                                    onClick={() => setIsImageModalOpen(true)} 
                                    className="max-h-60 w-auto object-contain rounded-sm cursor-zoom-in" 
                                />
                            </div>
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <h4 className="text-sm font-semibold text-text-secondary">해적이 인식한 문제</h4>
                                <button 
                                    onClick={() => onRetryRecognition(explanation.id)} 
                                    disabled={isRetryingRecognition}
                                    className="p-1 rounded-full text-danger hover:bg-danger hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" 
                                    title="문제 다시 인식하기"
                                >
                                    {isRetryingRecognition ? (
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <RetryIcon />
                                    )}
                                </button>
                            </div>
                            <style>{`.recognized-text-content .MathJax { font-size: ${explanationMathSize}% !important; }`}</style>
                            <div className="recognized-text-content max-w-none text-text-primary bg-background p-3 rounded-md border border-primary/30 flex-grow overflow-auto max-h-60 min-h-[150px]">
                                <MarkdownRenderer
                                    markdown={explanation.problemBody}
                                    style={markdownStyle as React.CSSProperties}
                                />
                                {choiceItems.length > 0 && (
                                    <div className="flex flex-row flex-wrap justify-between items-center mt-4 text-center">
                                        {choiceItems.map((choice, index) => (
                                            <div key={index} className="px-2 py-1">
                                                <MarkdownRenderer
                                                    markdown={choice.trim()}
                                                    style={markdownStyle as React.CSSProperties}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex-grow">
                            <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1 p-3 border-y border-primary/50">
                                <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
                                    {explanation.difficulty && <DifficultyStars level={explanation.difficulty} />}
                                    {explanation.coreConcepts && explanation.coreConcepts.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {explanation.coreConcepts.map((concept, i) => <span key={i} className={`px-2 py-1 text-xs font-semibold bg-primary/50 text-text-secondary rounded-full`}>{concept}</span>)}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => onRetry(explanation.id)} disabled={explanation.isLoading || isRetrying} className="p-2 rounded-full text-danger hover:bg-danger hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" title="다시쓰기"><RetryIcon /></button>
                            </div>
                            {explanation.isLoading ? <div className="p-6 h-full flex items-center justify-center"><Loader status={explanation.markdown} /></div> : explanation.isError ? <div className="p-6 text-center text-danger"><p>{explanation.markdown}</p></div> : (
                                <>
                                    <style>{`.explanation-content .MathJax { font-size: ${explanationMathSize}% !important; }`}</style>
                                    <div ref={renderedContentRef} onClick={handleExplanationClick} className="cursor-help">
                                        <MarkdownRenderer
                                            markdown={explanation.markdown}
                                            className="explanation-content text-text-primary overflow-x-auto break-words"
                                            style={explanationStyle as React.CSSProperties}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="border-t border-primary/50 mt-auto">
                            <div className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-accent text-sm">변형 문제</h4>
                                    <div className="flex items-center gap-2">
                                        {variationState === 'idle' && (
                                            <button onClick={handleFetchIdeas} className="text-xs font-semibold" style={{color: accentColor}}>새 아이디어로 만들기</button>
                                        )}
                                        {generatedVariation && variationState === 'idle' && (
                                                <button onClick={handleResetVariation} className="text-xs font-semibold" style={{color: accentColor}}>다른 변형 만들기</button>
                                        )}
                                        {variationState === 'ideas_shown' && (
                                            <button onClick={handleResetVariation} className="px-2 py-1 text-xs font-semibold bg-danger/50 text-danger rounded-md hover:bg-danger/70 transition-colors">취소</button>
                                        )}
                                    </div>
                                </div>
                                {variationError && <div className="p-2 text-center text-xs text-danger bg-danger/10 rounded-md">{variationError}</div>}
                                
                                {variationState === 'numbers_loading' && <Loader status="AI가 변형 문제를 만들고 있습니다..." />}
                                {variationState === 'ideas_loading' && <Loader status="새로운 문제 아이디어를 구상 중입니다..." />}
                                {variationState === 'problem_loading' && <Loader status="아이디어를 바탕으로 문제를 만드는 중입니다..." />}

                                {variationState === 'ideas_shown' && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-text-secondary text-center mb-2">어떤 아이디어로 변형 문제를 만들어 볼까요?</p>
                                        {variationIdeas.map((idea, index) => (
                                            <button 
                                                key={index}
                                                onClick={() => handleGenerateFromIdea(idea)}
                                                className="w-full text-left p-2 text-sm bg-background border border-primary rounded-md hover:border-accent hover:bg-accent/10 transition-all"
                                            >
                                                {idea}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {variationState === 'idle' && !generatedVariation && !explanation.isError && (
                                    <div className="text-center py-2">
                                        <button 
                                            onClick={handleGenerateNumbersVariation}
                                            style={{backgroundColor: theme.colors['accent-hover'], color: theme.colors.surface}}
                                            className="px-3 py-1.5 text-sm font-semibold rounded-md hover:animate-pulse-red-border"
                                        >
                                            변형 문제 만들기
                                        </button>
                                    </div>
                                )}
                                
                                <div className="text-sm">
                                    {variationState === 'idle' && generatedVariation && (
                                        <div className="space-y-2">
                                            <MarkdownRenderer markdown={generatedVariation.problem} className="prose prose-sm max-w-none text-text-primary overflow-x-auto" />
                                            <details className="text-xs">
                                                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">변형 문제 해설 보기</summary>
                                                <div className="mt-2 p-2 border-t border-primary/30">
                                                     <MarkdownRenderer markdown={generatedVariation.explanation} className="prose prose-sm max-w-none text-text-primary overflow-x-auto" />
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};