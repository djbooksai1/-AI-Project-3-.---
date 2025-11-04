import React, { useState, useEffect, useRef } from 'react';
import { QnaData } from '../types';
import { askCaptainAboutLine } from '../services/geminiService';
import { Loader } from './Loader';
import ReactMarkdown from 'react-markdown';
import { XIcon } from './icons/XIcon';
import { MathJaxRenderer } from './MathJaxRenderer';

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
    
    // When the selected data changes, reset the Q&A state
    useEffect(() => {
        setQuestion('');
        setAnswer(null);
        setError(null);
        setIsLoading(false);
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

    const typesetMath = (element: HTMLElement | null) => {
        if (element && window.MathJax?.typesetPromise) {
            window.MathJax.typesetClear([element]);
            window.MathJax.typesetPromise([element]).catch(err => console.error('MathJax typeset error:', err));
        }
    }

    useEffect(() => {
        if (answer) {
            typesetMath(answerRef.current);
        }
    }, [answer]);

    if (!data) {
        return (
            <div className="bg-surface rounded-lg shadow-md border border-primary p-4 flex flex-col items-center justify-center text-center h-48">
                <h3 className="text-lg font-bold text-accent">선장에게 질문하기</h3>
                <p className="mt-2 text-sm text-text-secondary">해설에서 드래그해서 질문하세요!</p>
            </div>
        );
    }

    return (
        <div className="bg-surface rounded-lg shadow-md border border-primary p-4 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
                <h3 className="text-lg font-bold text-accent">선장에게 질문하기</h3>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-primary">
                    <XIcon />
                </button>
            </div>
            
            <div className="overflow-y-auto space-y-3 flex-grow">
                <div className="mb-3">
                    <p className="text-sm font-semibold text-text-secondary mb-1">질문하는 내용:</p>
                    <div className="p-2 bg-background border border-primary rounded-md text-sm text-text-primary">
                        <MathJaxRenderer text={data.selectedLineHtml} />
                    </div>
                </div>

                <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="이해가 안 되는 부분을 질문해보세요..."
                    className="w-full p-2 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent outline-none min-h-[4.5rem] max-h-[15rem] resize-y"
                    rows={3}
                />
                <div className="flex justify-end items-center gap-3">
                    <button onClick={handleAskCaptain} disabled={isLoading || !question} className="px-4 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover disabled:opacity-50">
                        {isLoading ? '답변 중...' : '질문 전송'}
                    </button>
                </div>

                {isLoading && <div className="py-4"><Loader status="선장이 생각하는 중..." /></div>}
                {error && <p className="text-danger text-sm">{error}</p>}
                {answer && (
                    <div className="p-4 bg-background border border-success rounded-md" ref={answerRef}>
                        <p className="text-sm font-semibold text-success">선장의 답변:</p>
                        <div className="prose prose-sm max-w-none text-text-primary mt-2">
                             <ReactMarkdown>{answer}</ReactMarkdown>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}