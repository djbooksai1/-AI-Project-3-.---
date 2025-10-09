import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import { type Explanation } from '../types';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';
import { OIcon } from './icons/OIcon';
import { XIcon } from './icons/XIcon';

// TypeScript에서 window.MathJax 객체를 사용하기 위한 전역 타입 선언
declare global {
  interface Window {
    MathJax: {
      typesetPromise: (nodes?: HTMLElement[]) => Promise<void>;
    }
  }
}

interface ExplanationCardProps {
    explanation: Explanation;
    onToggleRetry: (id: number) => void;
    onToggleSatisfied: (id: number) => void;
    pageNumber: number;
}

// AI가 '$' 기호를 누락한 LaTeX를 지능적으로 찾아 감싸주는 새로운 함수
const autoWrapLatex = (text: string): string => {
    const placeholders: string[] = [];
    // 1. 이미 올바르게 포맷된 수식을 보호합니다.
    const protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        placeholders.push(match);
        return `__MATHJAX_PLACEHOLDER_${placeholders.length - 1}__`;
    });

    // 2. 한국어를 기준으로 텍스트를 분할하여 수식 부분을 격리합니다.
    const segments = protectedText.split(/([\uac00-\ud7a3]+)/g);

    const processedSegments = segments.map(segment => {
        // 한국어거나 이미 보호된 부분이면 그대로 둡니다.
        if (/[\uac00-\ud7a3]/.test(segment) || segment.includes('__MATHJAX_PLACEHOLDER_')) {
            return segment;
        }

        // LaTeX 명령어, 중괄호, 제곱/아래첨자 등 강력한 LaTeX 표시가 있는지 확인합니다.
        const hasLatexIndicators = /\\([a-zA-Z]+[a-zA-Z0-9]*)|[{}^_]/.test(segment);
        const trimmedSegment = segment.trim();

        // LaTeX 표시가 있고 내용이 존재하면 수식으로 간주하고 '$'로 감쌉니다.
        if (hasLatexIndicators && trimmedSegment) {
            const leadingSpace = segment.match(/^\s*/)?.[0] || '';
            const trailingSpace = segment.match(/\s*$/)?.[0] || '';
            return `${leadingSpace}$${trimmedSegment}$${trailingSpace}`;
        }

        return segment;
    });

    let result = processedSegments.join('');

    // 3. 보호했던 수식을 원래대로 복원합니다.
    result = result.replace(/__MATHJAX_PLACEHOLDER_(\d+)__/g, (_, index) => {
        return placeholders[parseInt(index, 10)];
    });

    return result;
};


export const ExplanationCard: React.FC<ExplanationCardProps> = ({ explanation, onToggleRetry, onToggleSatisfied, pageNumber }) => {
    const [copied, setCopied] = useState(false);
    const renderedContentRef = useRef<HTMLDivElement>(null);

    const cleanMarkdown = useMemo(() => {
        const match = explanation.markdown.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
        let rawMarkdown = match ? match[1].trim() : explanation.markdown.trim();
        
        // 1. 새로운 로직을 적용하여 누락된 LaTeX를 자동으로 감싸줍니다.
        const fixedLatexMarkdown = autoWrapLatex(rawMarkdown);

        // 2. 이제 모든 수식이 '$'로 감싸졌으므로, 안전하게 '\\ ' 공백 문제를 처리합니다.
        const segments = fixedLatexMarkdown.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
        const processedSegments = segments.map((segment, index) => {
            // 홀수 인덱스는 수학 환경이므로 그대로 둡니다.
            if (index % 2 === 1) {
                return segment;
            }
            // 짝수 인덱스는 일반 텍스트이므로, 여기서만 '\\ '를 일반 공백으로 바꿉니다.
            return segment.replace(/\\ /g, ' ');
        });

        return processedSegments.join('');
    }, [explanation.markdown]);

    // cleanMarkdown 텍스트가 변경될 때마다 MathJax를 실행하여 수식을 렌더링합니다.
    useEffect(() => {
        if (renderedContentRef.current && window.MathJax?.typesetPromise) {
            window.MathJax.typesetPromise([renderedContentRef.current]).catch((err) =>
                console.error('MathJax typeset error:', err)
            );
        }
    }, [cleanMarkdown]);


    const handleCopy = () => {
        navigator.clipboard.writeText(cleanMarkdown);
        setCopied(true);
    };

    useEffect(() => {
        if (copied) {
            const timer = setTimeout(() => setCopied(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [copied]);

    return (
        <div className="bg-surface rounded-lg shadow-md overflow-hidden relative border border-primary">
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                 <button 
                    onClick={() => onToggleRetry(explanation.id)}
                    className={`p-2 rounded-full transition-colors ${explanation.markedForRetry ? 'bg-danger text-white' : 'bg-primary/50 hover:bg-danger text-text-primary'}`}
                    title="해설 다시 생성"
                >
                    <XIcon />
                </button>
                <button
                    onClick={() => onToggleSatisfied(explanation.id)}
                    className={`p-2 rounded-full transition-colors ${explanation.isSatisfied ? 'bg-success text-white' : 'bg-primary/50 hover:bg-success text-text-primary'}`}
                    title="해설 만족"
                >
                    <OIcon />
                </button>
            </div>
            
            <div className="p-2 bg-primary/40 text-text-primary text-sm font-bold">
                페이지 {pageNumber}
            </div>
            
            <div className="p-6 space-y-6">
                 {/* Section 1: Raw Markdown */}
                 <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold text-accent">MARKDOWN 원본</h3>
                        <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-primary rounded-md hover:bg-primary/80 transition-colors">
                            {copied ? <CheckIcon /> : <CopyIcon />}
                            {copied ? '복사 완료!' : '복사'}
                        </button>
                    </div>
                    <textarea
                        readOnly
                        value={explanation.markdown.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)?.[1].trim() ?? explanation.markdown.trim()}
                        className="w-full h-80 bg-background p-4 rounded-md text-sm text-text-secondary font-mono resize-none border-2 border-accent/50 focus:ring-2 focus:ring-accent outline-none"
                    />
                </div>

                {/* Divider */}
                <div className="border-t border-primary"></div>
                
                {/* Section 2: Rendered LaTeX */}
                <div>
                    <h3 className="text-lg font-semibold text-accent mb-3">이쁜 해설지</h3>
                    <div ref={renderedContentRef} className="p-4 bg-background rounded-md min-h-[22rem] border-2 border-accent">
                        <div className="prose prose-sm max-w-none text-text-primary">
                            <ReactMarkdown 
                                remarkPlugins={[remarkMath]}
                            >
                                {cleanMarkdown}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};