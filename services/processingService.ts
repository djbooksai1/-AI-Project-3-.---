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
    problemBody: string;
    problemType: '객관식' | '주관식';
    choices?: string;
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

            // [보안 수정] AI가 반환한 좌표가 [0, 1] 범위를 벗어나는 경우를 대비하여 값을 보정합니다.
            // 이렇게 하면 이미지 경계를 벗어나는 좌표로 인해 이미지가 깨지는 현상을 방지할 수 있습니다.
            const x_min = Math.max(0, bbox.x_min);
            const y_min = Math.max(0, bbox.y_min);
            const x_max = Math.min(1, bbox.x_max);
            const y_max = Math.min(1, bbox.y_max);

            // 1. 보정된 좌표를 사용하여 절대 픽셀 좌표 및 크기를 계산합니다.
            const sx = x_min * img.naturalWidth;
            const sy = y_min * img.naturalHeight;
            const sWidth = (x_max - x_min) * img.naturalWidth;
            const sHeight = (y_max - y_min) * img.naturalHeight;
            
            // 너비나 높이가 0 이하인 경우, 1x1 픽셀의 빈 흰색 이미지를 반환하여 깨진 이미지 아이콘을 방지합니다.
            if (sWidth <= 0 || sHeight <= 0) {
                console.warn("AI가 반환한 좌표로 계산된 너비 또는 높이가 0 이하입니다. 빈 이미지가 생성될 수 있습니다.", { bbox, sWidth, sHeight });
                canvas.width = 1;
                canvas.height = 1;
                ctx.fillStyle = 'white'; // 배경을 흰색으로 채워 검은색 이미지가 나오지 않도록 합니다.
                ctx.fillRect(0, 0, 1, 1);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
                return;
            }

            // 2. 유효한 좌표를 사용하여 캔버스에 이미지를 그립니다.
            canvas.width = sWidth;
            canvas.height = sHeight;
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
            
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
            problemNumber: parseProblemNumberFromText(problem.problemBody) ?? (1000 + index),
        }));
    
        const explanationPromises = problemsWithNumbers.map(async (problem) => {
            const originalProblemText = problem.problemBody + (problem.choices ? `\n${problem.choices}` : '');
            return {
                id: Date.now() + Math.random(),
                markdown: ``, // Will be updated after sorting
                isLoading: true,
                isError: false,
                pageNumber: problem.pageNumber,
                problemNumber: problem.problemNumber,
                problemImage: problem.pageImage, // Use the full page image instead of a cropped one.
                originalProblemText: originalProblemText,
                problemBody: problem.problemBody,
                problemType: problem.problemType,
                choices: problem.choices,
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
        
        // 1. Separate cached explanations from those needing generation
        const explanationsToGenerate: Explanation[] = [];
        
        // First, check cache for all problems
        for (const [index, exp] of initialExplanations.entries()) {
            if (signal.aborted) return;
            callbacks.setStatusMessage(`캐시 확인 중... (${index + 1}/${initialExplanations.length})`);
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
            } else {
                explanationsToGenerate.push(exp);
            }
        }
    
        if (signal.aborted) return;
        
        // If all explanations were found in cache, we're done.
        if (explanationsToGenerate.length === 0) {
            return;
        }
    
        // 2. Batch generate explanations for the remaining problems
        const problemTextsToGenerate = explanationsToGenerate.map(exp => exp.originalProblemText);
        
        callbacks.setStatusMessage(`해설 일괄 생성 중... (${explanationsToGenerate.length}개)`);
    
        try {
            const results = await generateExplanationsBatch(problemTextsToGenerate, guidelines, explanationMode);
            if (signal.aborted) return;
            
            if (!results || results.length !== explanationsToGenerate.length) {
                throw new Error(`AI가 반환한 해설 개수(${results?.length || 0})가 요청한 개수(${explanationsToGenerate.length})와 다릅니다.`);
            }
    
            // 3. Update explanations with the batch results
            results.forEach((result, index) => {
                const originalExplanation = explanationsToGenerate[index];
                if (result) {
                    const processedMarkdown = postProcessMarkdown(result.explanation);
                    if (!processedMarkdown || failureKeywords.some(keyword => processedMarkdown.includes(keyword))) {
                        const errorMessage = "AI가 이 문제에 대한 해설 생성을 거부했습니다.";
                        callbacks.onUpdateExplanation({ ...originalExplanation, markdown: errorMessage, isLoading: false, isError: true });
                        this.logGenerationFailure(originalExplanation, guidelines, processedMarkdown);
                    } else {
                        const formattedMarkdown = formatMathEquations(processedMarkdown);
                        const updated: Explanation = { ...originalExplanation, markdown: formattedMarkdown, coreConcepts: result.coreConcepts, difficulty: result.difficulty, isLoading: false, variationProblem: undefined };
                        callbacks.onUpdateExplanation(updated);
                    }
                } else {
                    const errorMessage = "AI가 유효하지 않은 응답을 반환했습니다.";
                    callbacks.onUpdateExplanation({ ...originalExplanation, markdown: errorMessage, isLoading: false, isError: true });
                    this.logGenerationFailure(originalExplanation, guidelines, "AI returned null or undefined result object.");
                }
            });
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const isTimeout = errorMessage.toLowerCase().includes('timeout') || errorMessage.includes('504');
            const finalMessage = isTimeout 
                ? "해설 생성 시간이 초과되었습니다. AI 서버가 현재 응답이 느리거나, 문제가 너무 복잡할 수 있습니다."
                : `AI 해설 생성 중 오류: ${errorMessage}`;
            
            // Mark all pending explanations as errored
            explanationsToGenerate.forEach(exp => {
                callbacks.onUpdateExplanation({ ...exp, markdown: finalMessage, isLoading: false, isError: true });
                this.logGenerationFailure(exp, guidelines, `Generation failed: ${errorMessage}`);
            });
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