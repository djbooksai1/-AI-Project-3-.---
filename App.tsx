import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { GuidelinesModal } from './components/GuidelinesModal';
import { PdfDropzone } from './components/PdfDropzone';
import { Loader } from './components/Loader';
import { ExplanationCard } from './components/ExplanationCard';
import { RetryIcon } from './components/icons/RetryIcon';
import { pdfToImages } from './services/pdfService';
import { generateExplanation } from './services/geminiService';
import { Explanation } from './types';

const DEFAULT_GUIDELINES = `1. **개념 먼저, 풀이 나중:** 문제 해결에 필요한 핵심 개념, 공식, 또는 원리를 먼저 명확하게 설명합니다. 그 후, 이 개념을 어떻게 문제에 적용하는지 단계별로 보여줍니다.
2. **단계별 풀이:** 풀이 과정을 여러 단계로 나누어 각 단계마다 무엇을 하는지 명확한 소제목(예: '1단계: 방정식 세우기')을 붙여 설명합니다. 복잡한 계산은 중간 과정을 생략하지 않고 보여줍니다.
3. **친절한 말투:** 학생이 옆에서 과외를 받는 것처럼, 친절하고 이해하기 쉬운 구어체로 설명합니다. "해봅시다", "~해야 합니다", "~을 알 수 있습니다"와 같은 표현을 사용합니다.
4. **시각적 요소 활용:** 분수, 루트, 시그마 등 모든 수학 기호와 수식은 LaTeX 문법을 사용하여 명확하게 표현합니다. 모든 LaTeX 문법은 반드시 '$' 기호로 감싸야 합니다(예: $y = x^2 + 2x + 1$).
5. **핵심 강조:** 문제 해결의 핵심이 되는 부분이나 학생들이 자주 실수하는 부분은 **볼드체**나 색상(지원 시)을 사용하여 강조하고, '주의' 또는 '핵심'과 같은 표식을 붙여 부가 설명을 합니다.
6. **답 명시:** 모든 풀이가 끝난 후, 최종 답을 명확하게 보여줍니다. (예: '따라서, 정답은 5입니다.')`;

const App: React.FC = () => {
    const [explanations, setExplanations] = useState<Explanation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [guidelines, setGuidelines] = useState(DEFAULT_GUIDELINES);
    const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
    const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
    const explanationCounterRef = useRef(0);

    useEffect(() => {
        const savedGuidelines = localStorage.getItem('guidelines');
        if (savedGuidelines) {
            setGuidelines(savedGuidelines);
        }
    }, []);
    
    const handleSetGuidelines = (newGuidelines: string) => {
        setGuidelines(newGuidelines);
        localStorage.setItem('guidelines', newGuidelines);
    }

    const handleFileProcess = useCallback(async (file: File) => {
        setIsLoading(true);
        setLoadingStatus('PDF 파일을 페이지별 이미지로 변환 중입니다...');
        setExplanations([]);
        explanationCounterRef.current = 0;
        
        try {
            const images = await pdfToImages(file);
            const totalPages = images.length;
            const AVG_TIME_PER_PAGE = 45; // 페이지당 평균 예상 시간 (초)
            setEstimatedTime(totalPages * AVG_TIME_PER_PAGE);

            const explanationPromises = images.map((base64Image, index) => {
                return (async () => {
                    try {
                         setLoadingStatus(`${index + 1}/${totalPages} 페이지 해설 생성 중...`);
                         const markdown = await generateExplanation(base64Image, guidelines, false);
                         const newExplanation: Explanation = {
                             id: explanationCounterRef.current++,
                             questionImage: base64Image,
                             markdown,
                             markedForRetry: false,
                             isSatisfied: false,
                         };
                         // Update state progressively
                         setExplanations(prev => [...prev, newExplanation].sort((a,b) => a.id - b.id));
                    } catch (err) {
                        console.error(`Error generating explanation for page ${index + 1}:`, err);
                        const errorExplanation: Explanation = {
                            id: explanationCounterRef.current++,
                            questionImage: base64Image,
                            markdown: `오류: 해설 생성에 실패했습니다. (${err instanceof Error ? err.message : 'Unknown error'})`,
                            markedForRetry: true,
                            isSatisfied: false,
                        };
                        setExplanations(prev => [...prev, errorExplanation].sort((a,b) => a.id - b.id));
                    }
                })();
            });

            await Promise.all(explanationPromises);

        } catch (error) {
            alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
            console.error(error);
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
            setEstimatedTime(null);
        }
    }, [guidelines]);

    const handleToggleRetry = (id: number) => {
        setExplanations(prev =>
            prev.map(exp =>
                exp.id === id ? { ...exp, markedForRetry: !exp.markedForRetry } : exp
            )
        );
    };

    const handleToggleSatisfied = (id: number) => {
        setExplanations(prev =>
            prev.map(exp =>
                exp.id === id ? { ...exp, isSatisfied: !exp.isSatisfied } : exp
            )
        );
    };
    
    const handleRetryMarked = useCallback(async () => {
        const retryList = explanations.filter(e => e.markedForRetry);
        if (retryList.length === 0) {
            alert('다시 생성할 해설이 없습니다. X 버튼을 눌러 다시 생성할 해설을 선택해주세요.');
            return;
        }

        setIsLoading(true);
        const totalRetries = retryList.length;
        setEstimatedTime(totalRetries * 45);

        let completedRetries = 0;
        
        for (const exp of retryList) {
            completedRetries++;
            setLoadingStatus(`${completedRetries}/${totalRetries}개 해설 재성성 중...`);
            try {
                const newMarkdown = await generateExplanation(exp.questionImage, guidelines, true);
                setExplanations(prev => prev.map(e => 
                    e.id === exp.id ? { ...e, markdown: newMarkdown, markedForRetry: false } : e
                ));
            } catch (err) {
                console.error(`Failed to retry explanation for id ${exp.id}:`, err);
                alert(`해설 재성성에 실패했습니다 (ID: ${exp.id}).\n${err instanceof Error ? err.message : 'Unknown error'}`);
                 setExplanations(prev => prev.map(e => 
                    e.id === exp.id ? { ...e, markdown: `${e.markdown}\n\n---재시도 실패---\n${err instanceof Error ? err.message : 'Unknown error'}` } : e
                ));
            }
        }
        
        setIsLoading(false);
        setLoadingStatus('');
        setEstimatedTime(null);
    }, [explanations, guidelines]);


    return (
        <div className="bg-background text-text-primary min-h-screen">
            <Header onOpenGuidelines={() => setIsGuidelinesOpen(true)} />

            <main className="container mx-auto px-4 md:px-8 py-8">
                {isLoading ? (
                    <Loader status={loadingStatus} remainingTime={estimatedTime} />
                ) : explanations.length === 0 ? (
                    <PdfDropzone onFileProcess={handleFileProcess} />
                ) : (
                    <div className="space-y-8">
                        <div className="flex justify-end">
                            <button
                                onClick={handleRetryMarked}
                                disabled={!explanations.some(e => e.markedForRetry)}
                                className="flex items-center gap-2 px-4 py-2 font-semibold bg-danger text-white rounded-md hover:bg-danger/80 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                            >
                                <RetryIcon />
                                선택한 해설 다시 만들기
                            </button>
                        </div>
                        {explanations.map((exp, index) => (
                            <ExplanationCard
                                key={exp.id}
                                explanation={exp}
                                onToggleRetry={handleToggleRetry}
                                onToggleSatisfied={handleToggleSatisfied}
                                pageNumber={index + 1}
                            />
                        ))}
                    </div>
                )}
            </main>
            
            <GuidelinesModal
                isOpen={isGuidelinesOpen}
                onClose={() => setIsGuidelinesOpen(false)}
                guidelines={guidelines}
                setGuidelines={handleSetGuidelines}
            />
        </div>
    );
};

export default App;
