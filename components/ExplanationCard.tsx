import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { type Explanation, type QnaData } from '../types';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';
import { OIcon } from './icons/OIcon';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { useTheme } from '../hooks/useTheme';
import { generateVariationProblem, extractCoreIdeas } from '../services/geminiService';
import { RetryIcon } from './icons/RetryIcon';
import { QnaPanel } from './QnaPanel';

interface ExplanationCardProps {
    explanation: Explanation;
    guidelines: string;
    onDelete: (id: number) => void;
    onToggleSatisfied: (id: number) => void;
    setRenderedContentRef: (el: HTMLDivElement | null) => void;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onOpenQna: (data: QnaData) => void;
    activeQna: QnaData | null;
}

interface ImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    altText: string;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, imageUrl, altText }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 cursor-zoom-out"
            onClick={onClose}
        >
            <div 
                className="relative max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()} 
            >
                <img 
                    src={imageUrl} 
                    alt={altText} 
                    className="block max-w-[95vw] max-h-[95vh] object-contain rounded-md" 
                />
                <button 
                    onClick={onClose}
                    className="absolute -top-3 -right-3 bg-surface text-text-primary rounded-full h-8 w-8 flex items-center justify-center text-xl font-bold hover:bg-danger transition-colors"
                    aria-label="Close image viewer"
                >
                    &times;
                </button>
            </div>
        </div>
    );
};


type VariationLevel = 'numeric' | 'form' | 'creative';

type VariationState =
    | { status: 'idle' }
    | { status: 'fetchingIdeas'; level: 'form' | 'creative' }
    | { status: 'showingIdeas'; level: 'form' | 'creative'; ideas: string[] }
    | { status: 'generatingProblem'; level: VariationLevel; idea?: string }
    | { status: 'showingProblem'; problem: string; explanation: string }
    | { status: 'error'; message: string };

export const ExplanationCard: React.FC<ExplanationCardProps> = ({ explanation, guidelines, onDelete, onToggleSatisfied, setRenderedContentRef, id, isSelectionMode, isSelected, onSelect, onOpenQna, activeQna }) => {
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true); // Card is expanded by default now
    const cardRootRef = useRef<HTMLDivElement>(null);
    const renderedContentRef = useRef<HTMLDivElement>(null);
    const cardBodyRef = useRef<HTMLDivElement>(null);
    const variationContentRef = useRef<HTMLDivElement>(null);
    const { isLoading, pageNumber, problemNumber, problemImage, isError } = explanation;
    const { 
        layout,
        explanationFontSize,
        explanationMathSize,
        explanationTextFont,
        explanationPadding,
    } = useTheme();
    
    const [variationState, setVariationState] = useState<VariationState>({ status: 'idle' });
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    
    const highlightedElementRef = useRef<HTMLElement | null>(null);

    const isQnaActive = useMemo(() => activeQna?.cardId === explanation.id, [activeQna, explanation.id]);


    const AVERAGE_EXPLANATION_TIME = 25; // seconds
    const [remainingTime, setRemainingTime] = useState<number | null>(null);

    useEffect(() => {
        let timer: number | undefined;
        if (isLoading) {
            setRemainingTime(AVERAGE_EXPLANATION_TIME);
            timer = window.setInterval(() => {
                setRemainingTime(prev => (prev !== null && prev > 1 ? prev - 1 : 0));
            }, 1000);
        } else {
            setRemainingTime(null);
        }
        return () => clearInterval(timer);
    }, [isLoading]);


    useEffect(() => {
        if (setRenderedContentRef) {
            setRenderedContentRef(renderedContentRef.current);
        }
        return () => {
             if (setRenderedContentRef) {
                setRenderedContentRef(null);
             }
        }
    }, [setRenderedContentRef]);
    
    useEffect(() => {
        // When the active Q&A session changes globally,
        // check if this card should clear its highlight.
        if (!isQnaActive && highlightedElementRef.current) {
            highlightedElementRef.current.classList.remove('qna-line-highlight');
            highlightedElementRef.current = null;
        }
    }, [isQnaActive]);

    const typesetMath = (element: HTMLElement | null) => {
        if (!element) return;
        
        const typeset = () => {
             if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                window.MathJax.typesetClear([element]);
                window.MathJax.typesetPromise([element]).catch((err) =>
                    console.error('MathJax typeset error:', err)
                );
            }
        };

        if (window.MathJax?.startup?.promise) {
            window.MathJax.startup.promise.then(typeset);
        } else {
            typeset();
        }
    }

    useLayoutEffect(() => {
        if (isExpanded && !isLoading && !isError) {
            typesetMath(renderedContentRef.current);
        }
    }, [explanation.markdown, isExpanded, isLoading, isError]);

    useLayoutEffect(() => {
        if (isExpanded && variationState.status === 'showingProblem') {
            typesetMath(variationContentRef.current);
        }
    }, [variationState, isExpanded]);

    const markdownToRender = useMemo(() => {
        const match = explanation.markdown.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
        return match ? match[1].trim() : explanation.markdown.trim();
    }, [explanation.markdown]);


    const handleCopy = () => {
        navigator.clipboard.writeText(markdownToRender);
        setCopied(true);
    };

    useEffect(() => {
        if (copied) {
            const timer = setTimeout(() => setCopied(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [copied]);

    const handleCardClick = () => {
        if (isSelectionMode) {
            onSelect(explanation.id);
        }
    };
    
    const handleLineClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        
        if (highlightedElementRef.current) {
            highlightedElementRef.current.classList.remove('qna-line-highlight');
        }

        const element = event.currentTarget;
        const text = element.textContent?.trim();
        const html = element.innerHTML;
        const cardBody = cardBodyRef.current;


        if (text && text.length > 5 && cardBody) { // Ignore clicks on very short/empty lines
            element.classList.add('qna-line-highlight');
            highlightedElementRef.current = element;
            
            onOpenQna({
                cardId: explanation.id,
                selectedLine: text,
                selectedLineHtml: html,
                sourceHeight: cardBody.clientHeight,
                problemText: explanation.originalProblemText,
                fullExplanation: markdownToRender,
            });
        }
    }, [onOpenQna, explanation.id, explanation.originalProblemText, markdownToRender]);
    
    // FIX: Replaced the ClickableWrapper component by applying onClick handlers and classes directly to the markdown elements. This fixes multiple TypeScript errors and avoids creating invalid HTML structures (e.g., div inside ul).
    const markdownComponents: Components = useMemo(() => ({
        code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (match && match[1] === 'svg') {
                const svgCode = String(children).replace(/\n$/, '');
                return <div className="my-4 p-4 bg-white rounded-md overflow-auto" dangerouslySetInnerHTML={{ __html: svgCode }} />;
            }
            if (inline) {
                 return <code className={`${className || ''} cursor-help rounded-sm`} {...props} onClick={handleLineClick}>{children}</code>;
            }
            return (
                 <pre onClick={handleLineClick} className="bg-background p-2 rounded-md my-2 overflow-auto cursor-help rounded-sm">
                    <code className={className} {...props}>{children}</code>
                </pre>
            );
        },
        p: ({ node, children, ...props }) => <p {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</p>,
        li: ({ node, children, ...props }) => <li {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</li>,
        blockquote: ({ node, children, ...props }) => <blockquote {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</blockquote>,
        h1: ({ node, children, ...props }) => <h1 {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</h1>,
        h2: ({ node, children, ...props }) => <h2 {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</h2>,
        h3: ({ node, children, ...props }) => <h3 {...props} onClick={handleLineClick} className="cursor-help rounded-sm">{children}</h3>,
    }), [handleLineClick]);


    const handleGenerateVariation = async (level: VariationLevel, idea?: string) => {
        if (!explanation.originalProblemText) {
            setVariationState({ status: 'error', message: "변형 문제를 생성하기 위한 원본 문제 텍스트가 없습니다." });
            return;
        }
        setVariationState({ status: 'generatingProblem', level, idea });
        try {
            const result = await generateVariationProblem(explanation.originalProblemText, guidelines, level, idea);
            setVariationState({ status: 'showingProblem', ...result });
        } catch (e) {
            setVariationState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
    };
    
    const handleStartIdeaGeneration = async (level: 'form' | 'creative') => {
        if (!explanation.originalProblemText) {
            setVariationState({ status: 'error', message: "핵심 아이디어를 추출하기 위한 원본 문제 텍스트가 없습니다." });
            return;
        }
        setVariationState({ status: 'fetchingIdeas', level });
        try {
            const ideas = await extractCoreIdeas(explanation.originalProblemText);
            if (ideas.length === 0) {
                setVariationState({ status: 'error', message: "핵심 아이디어를 추출할 수 없습니다. 문제가 너무 간단하거나 인식이 불안정할 수 있습니다." });
            } else {
                setVariationState({ status: 'showingIdeas', level, ideas });
            }
        } catch (e) {
            setVariationState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
    };

    const dynamicStyles = `
      #${id} .prose {
        font-size: ${explanationFontSize}px !important;
        font-family: ${explanationTextFont.family} !important;
      }
      /* Prevent custom font from interfering with MathJax's font stack */
      #${id} .prose mjx-container {
        font-family: initial !important;
        /* Use font-size for robust scaling instead of non-standard zoom */
        font-size: ${explanationMathSize}% !important;
      }
    `;

    const renderVariationGenerator = () => {
        switch (variationState.status) {
            case 'idle':
                return (
                    <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                        <button onClick={() => handleGenerateVariation('numeric')} className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-white rounded-md hover:bg-primary/80 transition-colors">1. 숫자 변형</button>
                        <button onClick={() => handleStartIdeaGeneration('form')} className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md hover:bg-accent-hover transition-colors">2. 형태 변형</button>
                        <button onClick={() => handleStartIdeaGeneration('creative')} className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-success text-white rounded-md hover:bg-success/80 transition-colors">3. AI 창작</button>
                    </div>
                );
            case 'fetchingIdeas':
                return <div className="mt-4"><Loader status="AI가 핵심 아이디어를 추출하고 있습니다..." /></div>;

            case 'showingIdeas':
                return (
                    <div className="mt-4 p-4 bg-background rounded-md border border-primary">
                        <h4 className="font-bold text-text-primary mb-3">어떤 아이디어를 중심으로 변형할까요?</h4>
                        <div className="flex flex-col items-stretch gap-2">
                            {variationState.ideas.map((idea, index) => (
                                <button key={index} onClick={() => handleGenerateVariation(variationState.level, idea)} className="w-full text-left px-4 py-2 text-sm font-semibold bg-surface text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors border border-primary/50">
                                    {idea}
                                </button>
                            ))}
                        </div>
                         <div className="text-right mt-3">
                            <button onClick={() => setVariationState({ status: 'idle' })} className="text-sm text-text-secondary hover:text-text-primary">취소</button>
                        </div>
                    </div>
                );

            case 'generatingProblem':
                return <div className="mt-4"><Loader status="AI가 변형 문제를 생성하고 있습니다..." /></div>;

            case 'error':
                return (
                    <div className="mt-4 p-4 bg-danger/10 text-danger rounded-md">
                        <h4 className="font-bold">오류 발생</h4>
                        <p className="text-sm my-2">{variationState.message}</p>
                        <div className="text-right">
                            <button onClick={() => setVariationState({ status: 'idle' })} className="px-3 py-1 bg-danger text-white text-sm font-semibold rounded hover:bg-danger/80">
                                다시 시도
                            </button>
                        </div>
                    </div>
                );
            
            case 'showingProblem':
                 return (
                        <div ref={variationContentRef} className="mt-6 space-y-4 border-t-2 border-dashed border-primary pt-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-success p-1">생성된 변형문제</h3>
                                    <button onClick={() => setVariationState({ status: 'idle' })} className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold bg-primary rounded-md hover:bg-primary/80 transition-colors">
                                        <RetryIcon />
                                        새로 만들기
                                    </button>
                                </div>
                                 <div className="bg-background rounded-md p-4 border border-primary">
                                    <div className="prose prose-sm max-w-none text-text-primary">
                                        <ReactMarkdown components={markdownComponents}>
                                            {variationState.problem}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                             <div className="space-y-2">
                                <h3 className="text-lg font-semibold text-success p-1">변형문제 해설</h3>
                                 <div className="bg-background rounded-md p-4 border-2 border-success">
                                    <div className="prose prose-sm max-w-none text-text-primary">
                                        <ReactMarkdown components={markdownComponents}>
                                            {variationState.explanation}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );

            default:
                return null;
        }
    };


    const cardContent = (
        <div className={`explanation-card-content ${layout.className === 'side-by-side' ? 'md:grid md:grid-cols-2 md:gap-6' : 'space-y-6'}`}>
            {/* Problem Image Section */}
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-accent p-1">인식된 문제</h3>
                <div className="p-2 bg-background rounded-md border-2 border-primary flex items-center justify-center">
                    {problemImage ? (
                        <button onClick={() => setIsImageModalOpen(true)} className="focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-accent rounded-sm">
                            <img src={problemImage} alt={`Problem ${problemNumber}`} className="max-w-md h-auto rounded cursor-zoom-in" />
                        </button>
                    ) : (
                        <div className="w-full h-48 flex items-center justify-center text-text-secondary">
                            문제 이미지를 불러오는 중...
                        </div>
                    )}
                </div>
            </div>
            
            {/* Explanations Section */}
            <div className="space-y-4">
                {/* Pirate Map Preview */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                         <h3 className="text-lg font-semibold text-accent p-1">해적지도</h3>
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleCopy(); }} 
                            className="flex items-center gap-2 px-3 py-1 text-xs font-semibold bg-primary rounded-md hover:bg-primary/80 transition-colors"
                        >
                            {copied ? <CheckIcon /> : <CopyIcon />}
                            {copied ? '복사됨!' : 'Markdown 복사'}
                        </button>
                    </div>
                    <div 
                        ref={renderedContentRef} 
                        className="bg-background rounded-md min-h-[10rem] border-2 border-accent"
                        style={{
                            paddingTop: '1rem',
                            paddingBottom: '1rem',
                            paddingLeft: `${explanationPadding}px`,
                            paddingRight: `${explanationPadding}px`,
                        }}
                    >
                        <div className="prose prose-sm max-w-none text-text-primary">
                            <ReactMarkdown components={markdownComponents}>
                                {markdownToRender}
                            </ReactMarkdown>
                        </div>
                    </div>
                    
                    {renderVariationGenerator()}

                </div>
            </div>
        </div>
    );
    
    return (
        <>
            <style>{dynamicStyles}</style>
            <div
                ref={cardRootRef}
                id={id}
                className={`explanation-card bg-surface rounded-lg shadow-md overflow-hidden transition-all relative ${isSelectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'border-accent ring-2 ring-accent' : 'border-primary'} ${layout.className}`}
                onClick={handleCardClick}
            >
                <div 
                    className="explanation-card-header flex justify-between items-center p-4 hover:bg-primary/30 transition-colors cursor-pointer"
                    onClick={(e) => { if (!isSelectionMode) { e.stopPropagation(); setIsExpanded(!isExpanded); } }}
                >
                    <div className="flex items-center gap-3">
                        {isSelectionMode && (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => { e.stopPropagation(); onSelect(explanation.id); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-5 h-5 rounded bg-surface border-primary text-accent focus:ring-accent"
                            />
                        )}
                        <h2 className="text-lg font-bold text-text-primary">
                            문제 {problemNumber} <span className="text-sm font-medium text-text-secondary">(원본 {pageNumber}페이지)</span>
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(explanation.id); }}
                                className={`p-2 rounded-full transition-colors bg-primary/50 hover:bg-danger text-text-primary hover:text-white`}
                                title="해설 삭제"
                                disabled={isLoading}
                            >
                                <XIcon />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleSatisfied(explanation.id); }}
                                className={`p-2 rounded-full transition-colors ${explanation.isSatisfied ? 'bg-success text-white' : 'bg-primary/50 hover:bg-success text-text-primary hover:text-white'}`}
                                title="해설 만족"
                                disabled={isLoading}
                            >
                                <OIcon />
                            </button>
                        </div>
                        <div
                            className="p-1"
                            title={isExpanded ? "접기" : "펼치기"}
                        >
                            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        </div>
                    </div>
                </div>
                
                {isExpanded && (
                    <div ref={cardBodyRef} className="explanation-card-body p-4 border-t border-primary/50">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center bg-background rounded-md min-h-[22rem]">
                                <Loader status={explanation.markdown} remainingTime={remainingTime} />
                            </div>
                        ) : isError ? (
                             <div className="p-4 bg-danger/10 text-danger rounded-md min-h-[22rem] flex flex-col justify-center">
                                 <div className="flex items-center gap-2">
                                     <div className="w-5 h-5">
                                        <XIcon />
                                     </div>
                                     <h3 className="font-bold text-lg">해설 생성 오류</h3>
                                 </div>
                                 <p className="mt-2 text-sm opacity-90">{markdownToRender}</p>
                             </div>
                        ) : (
                           cardContent
                        )}
                    </div>
                )}
            </div>
            <ImageModal 
                isOpen={isImageModalOpen} 
                onClose={() => setIsImageModalOpen(false)}
                imageUrl={problemImage}
                altText={`Enlarged view of Problem ${problemNumber}`}
            />
        </>
    );
};