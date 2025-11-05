

import { getPdfDocument, renderPdfPageToImage } from './pdfService';
import { 
    generateExplanationsBatch,
    detectMathProblemsFromImage,
    postProcessMarkdown,
    formatMathEquations,
    StructuredExplanation,
} from './geminiService';
import { fileToBase64, isPdfFile } from './fileService';
import { Explanation, ExplanationMode, Bbox } from '../types';
import { db } from '../firebaseConfig';
// FIX: Firestore functions should be imported from 'firebase/firestore', not a local config file.
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

interface ProcessingCallbacks {
    setStatusMessage: (message: string) => void;
    onUpdateExplanation: (updatedExplanation: Explanation) => void;
}

export type AnalyzedProblem = { 
    pageNumber: number; 
    problemText: string; 
    pageImage: string; 
    bbox: Bbox;
};

type PageImage = { image: string; pageNumber: number };

const cropImage = (base64Image: string, bbox: Bbox): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));

            // 1. AI가 감지한 영역의 절대 픽셀 좌표 및 크기 계산
            const sx = bbox.x_min * img.naturalWidth;
            const sy = bbox.y_min * img.naturalHeight;
            const sWidth = (bbox.x_max - bbox.x_min) * img.naturalWidth;
            // FIX: Corrected typo from 'a.bbox.y_min' to 'bbox.y_min'.
            const sHeight = (bbox.y_max - bbox.y_min) * img.naturalHeight;
            
            // 2. "좌표 보정" 로직: 문제 번호를 포함하기 위해 좌측과 상단으로 지능적 확장
            // 문제 너비의 15%를 좌측 여백으로, 높이의 5%를 상단 여백으로 확보
            const leftExpansion = sWidth * 0.15;
            const topExpansion = sHeight * 0.05;
            // 미관을 위한 최소한의 우측/하단 여백
            const otherPadding = sWidth * 0.05; 

            // 3. 보정된 새로운 좌표계 계산
            const correctedX = Math.max(0, sx - leftExpansion);
            const correctedY = Math.max(0, sy - topExpansion);
            const correctedWidth = Math.min(img.naturalWidth - correctedX, sWidth + leftExpansion + otherPadding);
            const correctedHeight = Math.min(img.naturalHeight - correctedY, sHeight + topExpansion + otherPadding);

            // 4. 보정된 좌표계를 사용하여 캔버스에 이미지 그리기
            canvas.width = correctedWidth;
            canvas.height = correctedHeight;
            ctx.drawImage(img, correctedX, correctedY, correctedWidth, correctedHeight, 0, 0, correctedWidth, correctedHeight);
            
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = (err) => reject(err);
        img.src = base64Image;
    });
};

const parseProblemNumberFromText = (text: string): number | null => {
    const problemStartRegex = /^(?:\[\s*(\d{1,3})\s*\]|(\d{1,3})\.)/;
    const match = text.trim().match(problemStartRegex);
    return match ? parseInt(match[1] || match[2], 10) : null;
};

// Very simple string hash. Not cryptographically secure, but good enough for cache key generation.
const simpleHash = async (s: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(s);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

class ProcessingService {
    
    async getAllPageImages(files: File[], setStatusMessage: (message: string) => void): Promise<PageImage[]> {
        const allPageImages: PageImage[] = [];
        for (const [index, file] of files.entries()) {
            setStatusMessage(`파일 ${index + 1}/${files.length} 변환 중: ${file.name}`);
            if (await isPdfFile(file)) {
                let pdf;
                try {
                    pdf = await getPdfDocument(file);
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const image = await renderPdfPageToImage(page, 3.0);
                        allPageImages.push({ image, pageNumber: i });
                        page.cleanup();
                    }
                    if (pdf && pdf.destroy) await pdf.destroy();
                } catch (pdfError) {
                    console.warn(`PDF processing failed, falling back to image.`, pdfError);
                    const image = await fileToBase64(file);
                    allPageImages.push({ image, pageNumber: 1 });
                }
            } else {
                const image = await fileToBase64(file);
                allPageImages.push({ image, pageNumber: 1 });
            }
        }
        return allPageImages;
    }

    async analyzePage(pageData: PageImage): Promise<AnalyzedProblem[]> {
        try {
            const detectedProblems = await detectMathProblemsFromImage(pageData.image);
            return detectedProblems.map(p => ({
                ...p,
                pageNumber: pageData.pageNumber,
                pageImage: pageData.image,
            }));
        } catch (error) {
            console.error(`Error analyzing page ${pageData.pageNumber} with Vision AI:`, error);
            throw error;
        }
    }

    async createInitialExplanations(analyzedProblems: AnalyzedProblem[], totalProblemCount: number, alreadyFound: number): Promise<Explanation[]> {
        const sortedByPosition = [...analyzedProblems].sort((a, b) => a.bbox.y_min - b.bbox.y_min);
        const problemsWithNumbers = sortedByPosition.map((problem, index) => ({
            ...problem,
            problemNumber: parseProblemNumberFromText(problem.problemText) ?? (1000 + index),
        }));
    
        const explanationPromises = problemsWithNumbers.map(async (problem) => {
            const croppedImage = await cropImage(problem.pageImage, problem.bbox);
            return {
                id: Date.now() + Math.random(),
                markdown: ``, // Will be updated after sorting
                isLoading: true,
                isError: false,
                pageNumber: problem.pageNumber,
                problemNumber: problem.problemNumber,
                problemImage: croppedImage,
                originalProblemText: problem.problemText,
                variationProblem: undefined,
            };
        });
    
        const initialExplanations = await Promise.all(explanationPromises);
        initialExplanations
            .sort((a, b) => a.problemNumber - b.problemNumber)
            .forEach((exp, index) => {
                exp.markdown = `해설 생성 대기 중... (${alreadyFound + index + 1}/${totalProblemCount})`;
            });
    
        return initialExplanations;
    }

    async generateExplanations(
        initialExplanations: Explanation[],
        guidelines: string,
        explanationMode: ExplanationMode,
        callbacks: ProcessingCallbacks,
        signal: AbortSignal
    ): Promise<void> {
        const failureKeywords = ["풀이를 제공할 수 없", "해설을 생성할 수 없", "풀 수 없", "답변할 수 없"];
        let generatedCount = 0;

        for (const exp of initialExplanations) {
            if (signal.aborted) return;
            callbacks.setStatusMessage(`해설 생성 중... (${generatedCount + 1}/${initialExplanations.length})`);

            // 1. Haejeok Cache Check
            const hash = await simpleHash(exp.problemImage);
            const cacheRef = doc(db, 'goldenSet', hash);
            const cacheSnap = await getDoc(cacheRef);

            if (cacheSnap.exists()) {
                const data = cacheSnap.data();
                const updated: Explanation = {
                    ...exp,
                    markdown: data.markdown,
                    coreConcepts: data.coreConcepts,
                    difficulty: data.difficulty,
                    variationProblem: data.variationProblem,
                    isLoading: false,
                    isGolden: true
                };
                callbacks.onUpdateExplanation(updated);
                generatedCount++;
                continue;
            }
            
            if (signal.aborted) return;

            // 2. Individual Generation
            try {
                const results = await generateExplanationsBatch([exp.originalProblemText], guidelines, explanationMode);
                if (signal.aborted) return;

                const result = results[0]; // Batch call with one item returns an array with one item
                
                if (result) {
                    const processedMarkdown = postProcessMarkdown(result.explanation);
                    if (!processedMarkdown || failureKeywords.some(keyword => processedMarkdown.includes(keyword))) {
                        const errorMessage = "AI가 이 문제에 대한 해설 생성을 거부했습니다.";
                        callbacks.onUpdateExplanation({ ...exp, markdown: errorMessage, isLoading: false, isError: true });
                        this.logGenerationFailure(exp, guidelines, processedMarkdown);
                    } else {
                        const formattedMarkdown = formatMathEquations(processedMarkdown);
                        const updated: Explanation = { ...exp, markdown: formattedMarkdown, coreConcepts: result.coreConcepts, difficulty: result.difficulty, isLoading: false, variationProblem: undefined };
                        callbacks.onUpdateExplanation(updated);
                    }
                } else {
                     const errorMessage = "AI가 유효하지 않은 응답을 반환했습니다.";
                     callbacks.onUpdateExplanation({ ...exp, markdown: errorMessage, isLoading: false, isError: true });
                     this.logGenerationFailure(exp, guidelines, "AI returned null or undefined result object.");
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const isTimeout = errorMessage.toLowerCase().includes('timeout') || errorMessage.includes('504');
                const finalMessage = isTimeout 
                    ? "해설 생성 시간이 초과되었습니다. AI 서버가 현재 응답이 느리거나, 문제가 너무 복잡할 수 있습니다."
                    : `AI 해설 생성 중 오류: ${errorMessage}`;
                callbacks.onUpdateExplanation({ ...exp, markdown: finalMessage, isLoading: false, isError: true });
                this.logGenerationFailure(exp, guidelines, `Generation failed: ${errorMessage}`);
            }
            generatedCount++;
        }
    }

    async logGenerationFailure(explanation: Explanation, guidelines: string, failureReason: string) {
        try {
            await addDoc(collection(db, "failedGenerations"), {
                timestamp: serverTimestamp(),
                originalProblemText: explanation.originalProblemText,
                problemImage: explanation.problemImage, // Note: This might be a long base64 string if not yet saved
                guidelines,
                failureReason,
            });
        } catch (error) {
            console.error("Failed to log generation failure to Firestore:", error);
        }
    }
}

let serviceInstance: ProcessingService | null = null;
export const getProcessingService = (): ProcessingService => {
    if (!serviceInstance) {
        serviceInstance = new ProcessingService();
    }
    return serviceInstance;
};