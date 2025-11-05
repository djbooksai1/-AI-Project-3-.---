

import React, { useState, useEffect, useRef } from 'react';
import { QnaData } from '../types';
import { askCaptainAboutLine } from '../services/geminiService';
import { Loader } from './Loader';
import ReactMarkdown from 'react-markdown';
import { XIcon } from './icons/XIcon';
import { MathJaxRenderer } from './MathJaxRenderer';
import { useTheme } from '../hooks/useTheme';

interface QnaPanelProps {
    data: QnaData | null;
    onClose: () => void;
}

export const QnaPanel: React.FC<QnaPanelProps> = ({ data, onClose }) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const answerRef = useRef<HTMLDivElement>(null);
    const { explanationFontSize, explanationMathSize, explanationTextFont } = useTheme();
    
    useEffect(() => {
        if (data) {
            setQuestion('');
            setAnswer(null);
            setError(null);
            setIsLoading(false);
        }
    }, [data]);

    const handleAskCaptain = async () => {
        if (!question || !data) return;

        setIsLoading(true);
        setError(null);
        setAnswer(null);
        try {
            const result = await askCaptainAboutLine(
                data.problemText,
                data.fullExplanation,
                data.selectedLine,
                question
            );
            setAnswer(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const processContent = async (element: HTMLElement | null) => {
            if (!element) return;
            if (window.Prism) window.Prism.highlightAllUnder(element);
            if (window.MathJax?.typesetPromise) {
                await window.MathJax.typesetPromise([element]).catch(err => console.error("MathJax typeset error:", err));
            }
        };

        if (answer) {
            processContent(answerRef.current);
        }
    }, [answer]);

    return (
        <div className="bg-surface rounded-lg shadow-xl w-full border border-primary flex flex-col max-h-[80vh]">
            <div className="p-4 flex justify-between items-center border-b border-primary flex-shrink-0">
                <h3 className="text-lg font-bold text-accent">선장에게 질문하기</h3>
                {data && (
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-primary">
                        <XIcon />
                    </button>
                )}
            </div>
            
            {data ? (
                <>
                    <div className="overflow-y-auto space-y-4 p-4">
                        <div>
                            <p className="text-sm font-semibold text-text-secondary mb-1">질문하는 내용:</p>
                            <div 
                                className="p-3 bg-background border border-primary rounded-md text-text-primary"
                                style={{ fontSize: `${explanationFontSize}px`, fontFamily: explanationTextFont.family }}
                            >
                                <style>{`.qna-panel-content .MathJax { font-size: ${explanationMathSize}% !important; }`}</style>
                                <div className="qna-panel-content">
                                    <MathJaxRenderer text={data.selectedLineHtml} />
                                </div>
                            </div>
                        </div>

                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="이해가 안 되는 부분을 질문해보세요..."
                            className="w-full p-2 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent outline-none min-h-[5rem] max-h-[15rem] resize-y"
                            rows={3}
                        />
                        
                        {isLoading && <div className="py-4"><Loader status="선장이 생각하는 중..." /></div>}
                        {error && <p className="text-danger text-sm p-2 bg-danger/10 rounded-md">{error}</p>}
                        {answer && (
                            <div className="p-4 bg-background border border-success/50 rounded-md">
                                <p className="text-sm font-semibold text-success">선장의 답변:</p>
                                <div className="prose prose-sm max-w-none text-text-primary mt-2" ref={answerRef}>
                                     <ReactMarkdown>{answer}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-primary flex justify-end items-center gap-3 flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 bg-primary/50 text-text-primary rounded-md hover:bg-primary">
                            닫기
                        </button>
                        <button onClick={handleAskCaptain} disabled={isLoading || !question} className="px-4 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover disabled:opacity-50">
                            {isLoading ? '답변 중...' : '질문 전송'}
                        </button>
                    </div>
                </>
            ) : (
                <div className="p-6 text-center text-text-secondary flex flex-col items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-semibold text-text-primary mb-1">궁금한 점이 있으신가요?</p>
                    <p className="text-sm">해설 내용 중 아무 곳이나 클릭하여 AI 선장에게 자세한 설명을 요청해보세요.</p>
                </div>
            )}
        </div>
    );
}