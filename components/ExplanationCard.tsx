



import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { type Explanation, type QnaData } from '../types';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { useTheme } from '../hooks/useTheme';
import { CheckIcon } from './icons/CheckIcon';
import { SaveIcon } from './icons/SaveIcon';
import { GoldIcon } from './icons/GoldIcon';
import { generateVariationNumbersOnly, generateVariationIdeas, generateVariationFromIdea } from '../services/geminiService';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';


interface ExplanationCardProps {
    explanation: Explanation;
    onDelete: (id: number) => void;
    onSave: (id: number) => void;
    isSaving: boolean;
    setRenderedContentRef: (el: HTMLDivElement | null) => void;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onOpenQna: (data: QnaData) => void;
    isAdmin: boolean;
    onSaveToCache: (explanation: Explanation) => void;
}

const ImageModal: React.FC<{isOpen: boolean; onClose: () => void; imageUrl: string; altText: string}> = ({ isOpen, onClose, imageUrl, altText }) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 cursor-zoom-out" onClick={onClose}>
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

export const ExplanationCard: React.FC<ExplanationCardProps> = ({ explanation, onDelete, onSave, isSaving, setRenderedContentRef, id, isSelectionMode, isSelected, onSelect, onOpenQna, isAdmin, onSaveToCache }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const renderedContentRef = useRef<HTMLDivElement>(null);
    const variationContentRef = useRef<HTMLDivElement>(null);
    const { explanationFontSize, explanationMathSize, explanationTextFont, explanationPadding } = useTheme();
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    type VariationState = 'idle' | 'numbers_loading' | 'ideas_loading' | 'ideas_shown' | 'problem_loading';
    const [variationState, setVariationState] = useState<VariationState>('idle');
    const [variationIdeas, setVariationIdeas] = useState<string[]>([]);
    const [generatedVariation, setGeneratedVariation] = useState<Explanation['variationProblem'] | null>(explanation.variationProblem || null);
    const [variationError, setVariationError] = useState<string | null>(null);

    const handleGenerateNumbersVariation = useCallback(async () => {
        setVariationState('numbers_loading');
        setVariationError(null);
        try {
            const guidelinesDoc = await getDoc(doc(db, 'settings', 'guidelines'));
            const guidelines = guidelinesDoc.exists() ? guidelinesDoc.data().content : '';
            const result = await generateVariationNumbersOnly(explanation.originalProblemText, guidelines);
            setGeneratedVariation(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : '숫자 변형 문제 생성에 실패했습니다.';
            setVariationError(message);
        } finally {
            setVariationState('idle');
        }
    }, [explanation.originalProblemText]);

    const handleFetchIdeas = useCallback(async () => {
        setVariationState('ideas_loading');
        setVariationError(null);
        try {
            const guidelinesDoc = await getDoc(doc(db, 'settings', 'guidelines'));
            const guidelines = guidelinesDoc.exists() ? guidelinesDoc.data().content : '';
            const ideas = await generateVariationIdeas(explanation.originalProblemText, guidelines);
            setVariationIdeas(ideas);
            setVariationState('ideas_shown');
        } catch (error) {
            const message = error instanceof Error ? error.message : '아이디어 생성에 실패했습니다.';
            setVariationError(message);
            setVariationState('idle');
        }
    }, [explanation.originalProblemText]);

    const handleGenerateFromIdea = useCallback(async (idea: string) => {
        setVariationState('problem_loading');
        setVariationError(null);
        setVariationIdeas([]);
        try {
            const guidelinesDoc = await getDoc(doc(db, 'settings', 'guidelines'));
            const guidelines = guidelinesDoc.exists() ? guidelinesDoc.data().content : '';
            const result = await generateVariationFromIdea(explanation.originalProblemText, idea, guidelines);
            setGeneratedVariation(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : '문제 생성에 실패했습니다.';
            setVariationError(message);
        } finally {
            setVariationState('idle');
        }
    }, [explanation.originalProblemText]);

    const handleResetVariation = useCallback(() => {
        setGeneratedVariation(null);
        setVariationState('idle');
        setVariationIdeas([]);
        setVariationError(null);
    }, []);

    useLayoutEffect(() => {
        setRenderedContentRef(renderedContentRef.current);
        return () => setRenderedContentRef(null);
    }, [setRenderedContentRef]);

    useEffect(() => {
        const processContent = async (element: HTMLElement | null) => {
            if (!element) return;
            if (window.Prism) window.Prism.highlightAllUnder(element);
            if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise([element]).catch(err => console.error("MathJax typeset error:", err));
        };
        if (isExpanded) processContent(renderedContentRef.current);
        if (generatedVariation) processContent(variationContentRef.current);
    }, [explanation.markdown, generatedVariation, isExpanded, explanationFontSize, explanationMathSize, explanationTextFont, isSelectionMode]);

    const handleTextClick = useCallback((event: React.MouseEvent<HTMLElement>, rawMarkdownFragment: string) => {
        if (isSelectionMode) return;
        event.stopPropagation();
        
        onOpenQna({
            cardId: explanation.id,
            problemText: explanation.originalProblemText,
            fullExplanation: explanation.markdown,
            selectedLine: rawMarkdownFragment, // Raw markdown for AI
            selectedLineHtml: rawMarkdownFragment, // Raw markdown for MathJaxRenderer to render
        });
    }, [onOpenQna, explanation, isSelectionMode]);

    const renderMarkdown = useMemo((): Components => {
        const getRawMarkdownFromNode = (node: any): string => {
            if (node?.position?.start?.offset !== undefined && node?.position?.end?.offset !== undefined) {
                return explanation.markdown.slice(node.position.start.offset, node.position.end.offset);
            }
            return '';
        };

        const SentenceWrapper: React.FC<React.PropsWithChildren<{ rawMarkdown: string }>> = ({ children, rawMarkdown }) => {
            const interactiveClass = "cursor-pointer transition-colors duration-200 hover:bg-primary/30 rounded";
            
            const processChildren = (nodes: React.ReactNode): React.ReactNode => {
                 return React.Children.map(nodes, (child) => {
                    if (typeof child === 'string') {
                        const mathRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g;
                        const parts = child.split(mathRegex);
                        return parts.map((part, pIndex) => {
                            if (!part) return null;
                            if (pIndex % 2 === 1) return <React.Fragment key={`math-${pIndex}`}>{part}</React.Fragment>;
                            if (!part.trim()) return <React.Fragment key={`text-${pIndex}`}>{part}</React.Fragment>;
                            return <span key={`text-${pIndex}`} onClick={(e) => handleTextClick(e, rawMarkdown)} className={interactiveClass}>{part}</span>;
                        });
                    }
                    if (React.isValidElement(child) && child.type !== 'code' && (child.props as any)?.node?.tagName !== 'code') {
                        return React.cloneElement(child as React.ReactElement<any>, { children: processChildren((child.props as any).children) });
                    }
                    return child;
                });
            };
            return <>{processChildren(children)}</>;
        };

        return {
            p: (props) => <p {...props} className="my-2"><SentenceWrapper rawMarkdown={getRawMarkdownFromNode(props.node)}>{props.children}</SentenceWrapper></p>,
            h2: (props) => <h2 {...props} className="text-lg font-bold my-2"><SentenceWrapper rawMarkdown={getRawMarkdownFromNode(props.node)}>{props.children}</SentenceWrapper></h2>,
            li: (props) => <li {...props}><SentenceWrapper rawMarkdown={getRawMarkdownFromNode(props.node)}>{props.children}</SentenceWrapper></li>,
            code: ({ className, children, ...props }) => /language-(\w+)/.exec(className || '') ? <code className={className} {...props}>{children}</code> : <code className="bg-primary/30 text-accent font-semibold px-1 py-0.5 rounded text-sm" {...props}>{children}</code>,
        };
    }, [handleTextClick, explanation.markdown]);


    return (
        <div id={id} className={`bg-surface rounded-lg shadow-md border transition-all duration-300 ${isSelectionMode && isSelected ? 'border-accent ring-2 ring-accent' : explanation.isGolden ? 'border-gold' : 'border-primary'}`}>
            <ImageModal isOpen={isImageModalOpen} onClose={() => setIsImageModalOpen(false)} imageUrl={explanation.problemImage} altText={`Problem ${explanation.problemNumber}`} />
            <div className="flex items-center justify-between p-3 border-b border-primary">
                <div className="flex items-center gap-3">
                    {isSelectionMode && <input type="checkbox" checked={isSelected} onChange={() => onSelect(explanation.id)} className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent cursor-pointer" />}
                    <span className="text-lg font-bold text-accent">문제 {explanation.problemNumber}</span>
                    <span className="text-sm text-text-secondary">(출처: {explanation.pageNumber}p)</span>
                    {explanation.isGolden && <div title="해적 캐시 인증됨"><GoldIcon /></div>}
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && !explanation.isGolden && <button onClick={() => onSaveToCache(explanation)} className="p-2 rounded-full text-text-secondary hover:bg-gold hover:text-black" title="캐시에 저장"><GoldIcon /></button>}
                    {!explanation.docId ? <button onClick={() => onSave(explanation.id)} disabled={isSaving} className="p-2 rounded-full text-text-secondary hover:bg-accent hover:text-white disabled:opacity-50" title="저장">{isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SaveIcon />}</button> : <div className="p-2 text-success" title="저장됨"><CheckIcon /></div>}
                    <button onClick={() => onDelete(explanation.id)} className="p-2 rounded-full text-text-secondary hover:bg-danger hover:text-white" title="삭제"><XIcon /></button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 rounded-full text-text-secondary hover:bg-primary" title={isExpanded ? "접기" : "펼치기"}>{isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}</button>
                </div>
            </div>
            {isExpanded && (
                <div className="grid grid-cols-1">
                    {/* Problem Image Part */}
                    <div className="p-4 flex justify-center">
                        <img src={explanation.problemImage} alt={`Problem ${explanation.problemNumber}`} onClick={() => setIsImageModalOpen(true)} className="max-h-72 w-auto object-contain rounded-md bg-background cursor-zoom-in" />
                    </div>
                    {/* Explanation Part */}
                    <div className="flex flex-col">
                        <div className="flex-grow">
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 p-3 border-y border-primary/50">
                                {explanation.difficulty && <DifficultyStars level={explanation.difficulty} />}
                                {explanation.coreConcepts && explanation.coreConcepts.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {explanation.coreConcepts.map((concept, i) => <span key={i} className="px-2 py-1 text-xs font-semibold bg-primary/50 text-text-secondary rounded-full">{concept}</span>)}
                                    </div>
                                )}
                            </div>
                            {explanation.isLoading ? <div className="p-6 h-full flex items-center justify-center"><Loader status={explanation.markdown} /></div> : explanation.isError ? <div className="p-6 text-center text-danger"><p>{explanation.markdown}</p></div> : (
                                <div ref={renderedContentRef} className="explanation-content prose prose-sm max-w-none text-text-primary" style={{ fontSize: `${explanationFontSize}px`, '--tw-prose-body': 'var(--color-text-primary)', fontFamily: explanationTextFont.family, padding: `${explanationPadding}px` } as React.CSSProperties}>
                                    <style>{`.explanation-content .MathJax { font-size: ${explanationMathSize}% !important; }`}</style>
                                    <ReactMarkdown components={renderMarkdown}>{explanation.markdown}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                        <div className="border-t border-primary/50 mt-auto">
                            <div className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-accent text-sm">변형 문제</h4>
                                    <div className="flex items-center gap-2">
                                        {variationState === 'idle' && (
                                            <button onClick={handleFetchIdeas} className="px-2 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-accent hover:text-white transition-colors">새 아이디어로 만들기</button>
                                        )}
                                        {generatedVariation && variationState === 'idle' && (
                                             <button onClick={handleResetVariation} className="px-2 py-1 text-xs font-semibold bg-primary/50 rounded-md hover:bg-primary transition-colors">다른 변형 만들기</button>
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
                                            className="px-3 py-1.5 text-sm font-semibold bg-accent/80 text-white rounded-md hover:bg-accent transition-colors"
                                        >
                                            변형 문제 만들기
                                        </button>
                                    </div>
                                )}
                                
                                {variationState === 'idle' && generatedVariation && (
                                    <div ref={variationContentRef} className="space-y-2 text-sm">
                                        <div className="prose prose-sm max-w-none text-text-primary"><ReactMarkdown>{generatedVariation.problem}</ReactMarkdown></div>
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">변형 문제 해설 보기</summary>
                                            <div className="mt-2 p-2 border-t border-primary/30 prose prose-sm max-w-none text-text-primary"><ReactMarkdown>{generatedVariation.explanation}</ReactMarkdown></div>
                                        </details>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};