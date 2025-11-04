import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { type Explanation, type QnaData } from '../types';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { useTheme } from '../hooks/useTheme';
import { generateVariationProblem, extractCoreIdeas } from '../services/geminiService';
import { CheckIcon } from './icons/CheckIcon';

interface ExplanationCardProps {
    explanation: Explanation;
    guidelines: string;
    onDelete: (id: number) => void;
    onSave: (id: number) => void;
    isSaving: boolean;
    setRenderedContentRef: (el: HTMLDivElement | null) => void;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onOpenQna: (data: QnaData) => void;
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

// [+] 문장 단위 클릭을 위한 래퍼 컴포넌트
const SentenceWrapper: React.FC<React.PropsWithChildren<{ onSentenceClick: (event: React.MouseEvent<HTMLElement>) => void }>> = ({ children, onSentenceClick }) => {
    const interactiveClass = "cursor-pointer transition-colors duration-200 hover:bg-primary/30 rounded";

    // 재귀적으로 React 노드를 순회하며 텍스트 노드를 찾아 문장 단위로 분할하고 span으로 감쌉니다.
    const processChildren = (nodes: React.ReactNode): React.ReactNode => {
        return React.Children.map(nodes, (child, index) => {
            if (typeof child === 'string') {
                // 문장 분리 로직: 구두점(.?!)을 기준으로 나누고, 구두점은 문장에 포함시킵니다.
                const parts = child.split(/([.?!])/);
                const sentences: string[] = [];
                for (let i = 0; i < parts.length; i += 2) {
                    if (i + 1 < parts.length) {
                        sentences.push(parts[i] + parts[i + 1]);
                    } else if (parts[i].trim()) {
                        sentences.push(parts[i]);
                    }
                }
                
                return sentences.map((sentence, sIndex) => {
                     if (!sentence.trim()) return <React.Fragment key={`${index}-${sIndex}`}>{sentence}</React.Fragment>;
                     return (
                        <span key={`${index}-${sIndex}`} onClick={onSentenceClick} className={interactiveClass}>
                            {sentence}
                        </span>
                     );
                });
            }

            if (React.isValidElement(child)) {
                // `code` 태그와 같은 특정 요소는 문장 분할에서 제외합니다.
                if (child.type === 'code' || (child.props as any)?.node?.tagName === 'code') {
                    return child;
                }
                return React.cloneElement(child as React.ReactElement<any>, {
                    // 자식 노드에 대해 재귀적으로 함수를 호출합니다.
                    children: processChildren(child.props.children)
                });
            }

            return child;
        });
    };

    return <>{processChildren(children)}</>;
};


export const ExplanationCard: React.FC<ExplanationCardProps> = ({ explanation, guidelines, onDelete, onSave, isSaving, setRenderedContentRef, id, isSelectionMode, isSelected, onSelect, onOpenQna }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const renderedContentRef = useRef<HTMLDivElement>(null);
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

    useLayoutEffect(() => {
        setRenderedContentRef(renderedContentRef.current);
        return () => {
            setRenderedContentRef(null);
        };
    }, [setRenderedContentRef]);

    useEffect(() => {
        if (isExpanded && renderedContentRef.current && window.MathJax?.typesetPromise) {
            window.MathJax.typesetPromise([renderedContentRef.current]).catch(err => console.error("MathJax typeset error:", err));
        }
        if (variationState.status === 'showingProblem' && variationContentRef.current && window.MathJax?.typesetPromise) {
            window.MathJax.typesetPromise([variationContentRef.current]).catch(err => console.error("MathJax typeset error on variation:", err));
        }
    }, [explanation.markdown, isExpanded, explanationFontSize, explanationMathSize, explanationTextFont, variationState]);

    const handleTextClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        if (isSelectionMode) return;
        event.stopPropagation(); // 부모 요소의 클릭 이벤트 방지

        const target = event.currentTarget;
        const selectedText = target.innerText;
        const selectedHtml = target.innerHTML;

        if (selectedText && selectedText.trim().length > 0) {
            onOpenQna({
                cardId: explanation.id,
                problemText: explanation.originalProblemText,
                fullExplanation: explanation.markdown,
                selectedLine: selectedText,
                selectedLineHtml: selectedHtml,
            });
        }
    }, [onOpenQna, explanation, isSelectionMode]);

    const renderMarkdown = useMemo((): Components => {
        // 제네릭 렌더러 컴포넌트: 자식들을 SentenceWrapper로 감쌉니다.
        const TextBlockRenderer: React.FC<React.PropsWithChildren<{ as: React.ElementType, className?: string }>> = ({ as: Component, children, ...props }) => {
            return (
                <Component {...props}>
                    <SentenceWrapper onSentenceClick={handleTextClick}>{children}</SentenceWrapper>
                </Component>
            );
        };

        return {
            p: (props) => <TextBlockRenderer as="p" {...props} className="my-2" />,
            h1: (props) => <TextBlockRenderer as="h1" {...props} className="text-xl font-bold my-3" />,
            h2: (props) => <TextBlockRenderer as="h2" {...props} className="text-lg font-bold my-3" />,
            h3: (props) => <TextBlockRenderer as="h3" {...props} className="text-base font-bold my-2" />,
            h4: (props) => <TextBlockRenderer as="h4" {...props} className="text-base font-semibold my-2" />,
            li: (props) => <TextBlockRenderer as="li" {...props} className="pl-1" />,
            blockquote: (props) => <TextBlockRenderer as="blockquote" {...props} className="border-l-4 border-accent pl-4 italic text-text-secondary my-2" />,
            td: (props) => <TextBlockRenderer as="td" {...props} className="border border-primary px-3 py-1.5" />,

            // 문장 분할이 필요 없는 요소들은 그대로 둡니다.
            strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
            em: ({ node, ...props }) => <em className="italic" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
            code: ({ node, inline, ...props }) => {
                const codeBlock = <code {...props} />;
                if (inline) {
                    return <span className={`bg-primary/50 text-text-primary px-1 py-0.5 rounded text-sm`}>{codeBlock}</span>;
                }
                // 코드 블록 전체를 클릭하여 질문할 수 있도록 남겨둡니다.
                return <pre onClick={handleTextClick} className={`bg-background p-3 rounded-md overflow-x-auto text-sm cursor-pointer transition-colors duration-200 hover:bg-primary/30`}><code {...props} /></pre>;
            },
            table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-3">
                    <table className="table-auto w-full border-collapse border border-primary" {...props} />
                </div>
            ),
            th: ({ node, ...props }) => <th className="border border-primary px-3 py-1.5 bg-surface text-left font-semibold" {...props} />,
        };
    }, [handleTextClick]);

    const handleGenerateVariation = async (level: VariationLevel, idea?: string) => {
        setVariationState({ status: 'generatingProblem', level, idea });
        try {
            const result = await generateVariationProblem(explanation.originalProblemText, guidelines, level, idea);
            setVariationState({ status: 'showingProblem', problem: result.problem, explanation: result.explanation });
        } catch (e) {
            setVariationState({ status: 'error', message: e instanceof Error ? e.message : 'An unknown error occurred' });
        }
    };

    const handleChooseIdea = async (level: 'form' | 'creative') => {
        setVariationState({ status: 'fetchingIdeas', level });
        try {
            const ideas = await extractCoreIdeas(explanation.originalProblemText);
            setVariationState({ status: 'showingIdeas', level, ideas });
        } catch (e) {
            setVariationState({ status: 'error', message: e instanceof Error ? e.message : 'An unknown error occurred' });
        }
    };
    
    const renderVariationContent = () => {
        switch (variationState.status) {
            case 'idle':
                return (
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={() => handleGenerateVariation('numeric')} className="flex-1 px-3 py-2 text-sm font-semibold bg-primary/50 text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors">숫자만 바꾸기</button>
                        <button onClick={() => handleChooseIdea('form')} className="flex-1 px-3 py-2 text-sm font-semibold bg-primary/50 text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors">표현만 바꾸기</button>
                        <button onClick={() => handleChooseIdea('creative')} className="flex-1 px-3 py-2 text-sm font-semibold bg-primary/50 text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors">새롭게 만들기</button>
                    </div>
                );
            case 'fetchingIdeas':
                return <div className="text-center"><Loader status="문제의 핵심 아이디어 분석 중..." /></div>;
            case 'showingIdeas':
                return (
                    <div className="space-y-3">
                        <p className="font-semibold text-text-primary">어떤 아이디어를 변형할까요?</p>
                        {variationState.ideas.map((idea, index) => (
                            <button key={index} onClick={() => handleGenerateVariation(variationState.level, idea)} className="w-full text-left px-4 py-3 text-sm bg-primary/50 text-text-primary rounded-md hover:bg-accent hover:text-white transition-colors">
                                {idea}
                            </button>
                        ))}
                        <button onClick={() => setVariationState({ status: 'idle' })} className="w-full text-center mt-2 text-xs text-text-secondary hover:underline">취소</button>
                    </div>
                );
            case 'generatingProblem':
                return <div className="text-center"><Loader status="AI가 변형 문제를 생성하는 중..." /></div>;
            case 'showingProblem':
                return (
                    <div ref={variationContentRef} className="prose max-w-none text-text-primary" style={{ fontSize: `${explanationFontSize}px`, fontFamily: explanationTextFont.family }}>
                        <h4 className="font-bold text-accent">변형 문제</h4>
                        <ReactMarkdown components={renderMarkdown}>{variationState.problem}</ReactMarkdown>
                        <h4 className="font-bold text-accent mt-4">변형 문제 해설</h4>
                        <ReactMarkdown components={renderMarkdown}>{variationState.explanation}</ReactMarkdown>
                        <button onClick={() => setVariationState({ status: 'idle' })} className="w-full text-center mt-4 px-4 py-2 bg-primary/50 text-text-primary text-sm font-semibold rounded-md hover:bg-primary transition-colors">
                            다른 변형 문제 만들기
                        </button>
                    </div>
                );
            case 'error':
                return (
                    <div className="text-center">
                        <p className="text-danger text-sm mb-3">오류: {variationState.message}</p>
                        <button onClick={() => setVariationState({ status: 'idle' })} className="px-4 py-2 bg-primary text-text-primary text-sm rounded-md">다시 시도</button>
                    </div>
                );
        }
    };
    
    return (
        <div id={id} className={`bg-surface rounded-xl shadow-md transition-all duration-300 border ${isSelectionMode && isSelected ? 'border-accent ring-2 ring-accent' : 'border-primary'}`}>
            <ImageModal isOpen={isImageModalOpen} onClose={() => setIsImageModalOpen(false)} imageUrl={problemImage} altText={`문제 ${problemNumber}`} />
            <div 
                className={`flex items-start gap-4 p-4 cursor-pointer ${isSelectionMode ? 'select-none' : ''}`} 
                onClick={() => isSelectionMode ? onSelect(explanation.id) : setIsExpanded(!isExpanded)}
            >
                 {isSelectionMode && (
                    <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => onSelect(explanation.id)} 
                        className="h-5 w-5 rounded border-primary bg-background text-accent focus:ring-accent mt-1"
                    />
                )}
                <div className="flex-grow">
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold text-accent mb-2">해적지도</h3>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-text-secondary">
                                {pageNumber}페이지 - {problemNumber < 1000 ? `${problemNumber}번 문제` : '번호 인식 불가'}
                            </span>
                            <button className="text-text-secondary hover:text-text-primary">
                                {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-center bg-background rounded-md border border-primary mb-2">
                        <img 
                            src={problemImage} 
                            alt={`문제 ${problemNumber}`} 
                            className="max-h-96 object-contain cursor-zoom-in"
                            onClick={(e) => {
                                if (!isSelectionMode) {
                                    e.stopPropagation();
                                    setIsImageModalOpen(true);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-primary/50 relative">
                    <div 
                        ref={renderedContentRef}
                        className="prose max-w-none text-text-primary break-words"
                        style={{ 
                            fontSize: `${explanationFontSize}px`, 
                            fontFamily: explanationTextFont.family,
                            paddingLeft: `${explanationPadding}px`,
                            paddingRight: `${explanationPadding}px`,
                            '--tw-prose-bullets': 'var(--color-text-primary)',
                            '--tw-prose-counters': 'var(--color-text-primary)',
                            '--tw-prose-hr': 'var(--color-primary)',
                            '--tw-prose-pre-bg': 'var(--color-background)',
                        }}
                    >
                         {isLoading ? (
                            <div className="flex justify-center items-center py-8">
                                <Loader status={explanation.markdown} />
                            </div>
                        ) : isError ? (
                             <div className="bg-danger/10 border border-danger text-danger p-4 rounded-md">
                                <strong className="font-bold">해설 생성 오류</strong>
                                <p className="text-sm mt-1">{explanation.markdown}</p>
                            </div>
                        ) : (
                            <ReactMarkdown
                                components={renderMarkdown}
                                remarkPlugins={[]}
                                rehypePlugins={[]}
                            >
                                {explanation.markdown}
                            </ReactMarkdown>
                        )}
                    </div>

                    {/* Variation generation UI */}
                    {!isLoading && !isError && (
                        <div className="mt-4 pt-4 border-t border-primary/30" style={{ paddingLeft: `${explanationPadding}px`, paddingRight: `${explanationPadding}px` }}>
                            <div className="bg-background p-4 rounded-lg">
                                 <h4 className="text-base font-semibold text-center text-text-primary mb-3">유사/변형문제 생성</h4>
                                 {renderVariationContent()}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            <div className="flex justify-between items-center bg-background p-3 rounded-b-lg border-t border-primary/50" style={{ paddingLeft: `${explanationPadding}px`, paddingRight: `${explanationPadding}px` }}>
                <div className="flex items-center gap-4">
                     {explanation.docId ? (
                        <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-success">
                            <CheckIcon /> 저장됨
                        </span>
                    ) : (
                        <button 
                            onClick={() => onSave(explanation.id)}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                            {isSaving ? '저장 중...' : '저장하기'}
                        </button>
                    )}
                </div>

                <button onClick={() => onDelete(explanation.id)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-danger/20 text-danger rounded-md hover:bg-danger/30 transition-colors">
                    <XIcon/>
                    삭제
                </button>
            </div>
        </div>
    );
};