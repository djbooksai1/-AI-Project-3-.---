import { getPdfDocument, renderPdfPageToImage } from './pdfService';
import { 
    generateExplanation, 
    structureTextIntoProblems,
    extractTextWithCloudVision,
    filterMathProblemsBatch,
} from './geminiService';
import { fileToBase64, isPdfFile } from './fileService';
import { Explanation, ExplanationMode, Bbox } from '../types';
import { uploadProblemImage } from './storageService';

interface ProcessingCallbacks {
    setStatusMessage: (message: string) => void;
    onUpdateExplanation: (updatedExplanation: Explanation) => void;
}

type PageImage = { image: string; pageNumber: number };
type AnalyzedProblem = { 
    pageNumber: number; 
    problemText: string; 
    pageImage: string; // The original full page image
    bbox: Bbox;        // The normalized bounding box of the problem on the page
};

/**
 * Crops a base64 image using a normalized bounding box.
 * @param base64Image The source image data URL.
 * @param bbox The normalized bounding box (coordinates from 0 to 1).
 * @returns A promise that resolves to the base64 data URL of the cropped image.
 */
const cropImage = (base64Image: string, bbox: Bbox): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Failed to get canvas context'));
            }

            const sx = bbox.x_min * img.naturalWidth;
            const sy = bbox.y_min * img.naturalHeight;
            const sWidth = (bbox.x_max - bbox.x_min) * img.naturalWidth;
            const sHeight = (bbox.y_max - bbox.y_min) * img.naturalHeight;

            // Add some padding around the cropped image for better visual appearance
            const padding = 20; // pixels
            const paddedX = Math.max(0, sx - padding);
            const paddedY = Math.max(0, sy - padding);
            const paddedWidth = Math.min(img.naturalWidth - paddedX, sWidth + padding * 2);
            const paddedHeight = Math.min(img.naturalHeight - paddedY, sHeight + padding * 2);

            canvas.width = paddedWidth;
            canvas.height = paddedHeight;

            ctx.drawImage(
                img,
                paddedX, paddedY, paddedWidth, paddedHeight, // Source rectangle (from original image)
                0, 0, paddedWidth, paddedHeight             // Destination rectangle (on canvas)
            );
            
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = (err) => reject(err);
        img.src = base64Image;
    });
};

// Helper function to extract problem number from text.
const parseProblemNumberFromText = (text: string): number | null => {
    // Regex for "1.", "[1]", "01.", etc. up to 3 digits.
    const problemStartRegex = /^(?:\[\s*(\d{1,3})\s*\]|(\d{1,3})\.)/;
    const match = text.trim().match(problemStartRegex);
    if (match) {
        const numStr = match[1] || match[2];
        if (numStr) {
            return parseInt(numStr, 10);
        }
    }
    return null;
};

class ProcessingService {
    
    public getPdfDocument = getPdfDocument;

    public async analyzeFiles(
        files: File[],
        setStatusMessage: (message: string) => void
    ): Promise<AnalyzedProblem[]> {
        const allPages: PageImage[] = [];

        for (const file of files) {
            let pageImages: PageImage[] = [];
            
            if (await isPdfFile(file)) {
                let pdf: any; 
                try {
                    setStatusMessage(`'${file.name}' PDF 문서 여는 중...`);
                    pdf = await this.getPdfDocument(file);
                    setStatusMessage(`'${file.name}'의 ${pdf.numPages}개 페이지를 순차적으로 렌더링합니다...`);
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const pageNumber = i;
                        try {
                            setStatusMessage(`'${file.name}'의 ${pageNumber}페이지 렌더링...`);
                            const page = await pdf.getPage(pageNumber);
                            const image = await renderPdfPageToImage(page, 2.0);
                            pageImages.push({ image, pageNumber });
                            page.cleanup();
                        } catch (pageError) {
                            console.error(`Error rendering page ${pageNumber} of "${file.name}". Skipping this page.`, pageError);
                            setStatusMessage(`'${file.name}'의 ${pageNumber}페이지 처리 실패. 이 페이지를 건너뜁니다.`);
                        }
                    }

                } catch (pdfError) {
                    console.warn(`PDF processing failed for "${file.name}", falling back to treating it as a single image.`, pdfError);
                    setStatusMessage(`'${file.name}' PDF 처리 실패. 이미지로 다시 시도합니다...`);
                    try {
                        const image = await fileToBase64(file);
                        pageImages.push({ image, pageNumber: 1 });
                    } catch (imageFallbackError) {
                        console.error(`Failed to process "${file.name}" even as an image. Skipping file.`, imageFallbackError);
                        setStatusMessage(`'${file.name}' 파일을 처리할 수 없습니다. 파일을 건너뜁니다.`);
                    }
                } finally {
                    if (pdf && pdf.destroy) {
                        await pdf.destroy();
                    }
                }
            } else {
                setStatusMessage(`'${file.name}' 이미지 처리 중...`);
                const image = await fileToBase64(file);
                pageImages.push({ image, pageNumber: 1 });
            }
            allPages.push(...pageImages);
        }
        
        if (allPages.length === 0) {
            return [];
        }

        setStatusMessage(`${allPages.length}개 페이지 병렬 분석 시작... (텍스트 추출 및 영역 분석)`);

        const analysisPromises = allPages.map(async (pageData) => {
            const { image, pageNumber } = pageData;
            
            try {
                const paragraphs = await extractTextWithCloudVision(image);

                if (!paragraphs || paragraphs.length === 0) {
                    console.warn(`Skipping page ${pageNumber} due to insufficient text from OCR.`);
                    return []; 
                }
                
                const img = new Image();
                img.src = image;
                await new Promise(resolve => { img.onload = resolve; });

                const problemsWithBbox = await structureTextIntoProblems(paragraphs, img.naturalWidth, img.naturalHeight);
                
                let mathProblems;
                try {
                    setStatusMessage(`페이지 ${pageNumber}의 ${problemsWithBbox.length}개 텍스트 영역에서 수학 문제 일괄 필터링...`);
                    mathProblems = await filterMathProblemsBatch(problemsWithBbox);
                } catch (filterError) {
                    if (filterError instanceof Error && filterError.message.includes("filterMathProblemsBatch")) {
                        console.warn("`filterMathProblemsBatch` 프롬프트 로딩 실패. 필터링을 건너뛰고 모든 문제 후보를 진행합니다. 정확도를 높이려면 Firestore 'prompts' 컬렉션에 `filterMathProblemsBatch` 문서를 추가하세요.");
                        setStatusMessage(`경고: 수학 문제 필터링 실패. 감지된 모든 텍스트 영역을 문제로 간주하고 진행합니다.`);
                        mathProblems = problemsWithBbox; // FALLBACK: Assume all candidates are math problems
                    } else {
                        // For other errors (e.g., API quota), re-throw them.
                        throw filterError;
                    }
                }

                return mathProblems.map(p => ({
                    pageNumber: pageNumber,
                    problemText: p.problemText,
                    pageImage: image,
                    bbox: p.bbox,
                }));

            } catch (error) {
                // This outer catch will now handle errors from extractTextWithCloudVision, structureTextIntoProblems,
                // or any non-fallback errors from filterMathProblemsBatch.
                console.error(`Error analyzing page ${pageNumber}:`, error);
                if (error instanceof Error && error.message.includes('핵심 AI 지침')) {
                    // Propagate critical prompt errors that don't have a fallback
                    throw error; 
                }
                // For other errors, return an empty array to not break the whole process
                return [];
            }
        });

        const nestedProblems = await Promise.all(analysisPromises);
        
        const finalProblems = nestedProblems.flat();
        
        return finalProblems;
    }

    public async createInitialExplanations(
        analyzedProblems: AnalyzedProblem[],
        setStatusMessage: (message: string) => void
    ): Promise<Explanation[]> {
        const totalProblems = analyzedProblems.length;
    
        // First, sort by physical position to have a deterministic fallback order
        const sortedByPosition = [...analyzedProblems].sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) {
                return a.pageNumber - b.pageNumber;
            }
            return a.bbox.y_min - b.bbox.y_min;
        });
    
        // Assign problem numbers by parsing text, with a fallback for un-numbered problems
        const problemsWithNumbers = sortedByPosition.map((problem, index) => ({
            ...problem,
            // If parsing fails, assign a high number to push it to the end, preserving physical order among them
            problemNumber: parseProblemNumberFromText(problem.problemText) ?? (1000 + index),
        }));
    
        setStatusMessage(`분석된 ${totalProblems}개의 문제 이미지를 잘라내는 중...`);
    
        const explanationPromises = problemsWithNumbers.map(async (problem) => {
            const croppedImage = await cropImage(problem.pageImage, problem.bbox);
            
            const placeholder: Explanation = {
                id: Date.now() + Math.random(),
                markdown: `해설 생성 대기 중...`, // This will be updated after sorting
                isLoading: true,
                isError: false,
                pageNumber: problem.pageNumber,
                problemNumber: problem.problemNumber,
                problemImage: croppedImage,
                originalProblemText: problem.problemText,
            };
            return placeholder;
        });
    
        const initialExplanations = await Promise.all(explanationPromises);
        
        // Sort by the newly assigned problemNumber to set correct loading message order
        initialExplanations
            .sort((a, b) => a.problemNumber - b.problemNumber)
            .forEach((exp, index) => {
                exp.markdown = `해설 생성 대기 중... (${index + 1}/${totalProblems})`;
            });
    
        return initialExplanations;
    }

    async generateExplanations(
        initialExplanations: Explanation[],
        guidelines: string,
        explanationMode: ExplanationMode,
        callbacks: ProcessingCallbacks,
        signal: AbortSignal
    ): Promise<{ refundCount: number }> {
        let completedCount = 0;
        let refundCount = 0;
    
        const CONCURRENT_LIMIT = 5;
        const DELAY_BETWEEN_BATCHES = 2000;

        callbacks.setStatusMessage(`${initialExplanations.length}개의 해설 생성을 병렬로 시작합니다...`);

        for (let i = 0; i < initialExplanations.length; i += CONCURRENT_LIMIT) {
            if (signal.aborted) {
                console.log("Cancellation detected before starting batch.");
                break;
            }
            
            const batchPlaceholders = initialExplanations.slice(i, i + CONCURRENT_LIMIT);

            callbacks.setStatusMessage(`해설 생성 중 (${i + batchPlaceholders.length} / ${initialExplanations.length})...`);

            const batchPromises = batchPlaceholders.map((placeholder) => {
                return (async () => {
                    if (signal.aborted) return;

                    try {
                        callbacks.onUpdateExplanation({ ...placeholder, markdown: `[${placeholder.pageNumber}페이지 문제 ${placeholder.problemNumber}] AI 해설 생성 중...` });
                        const rawMarkdown = await generateExplanation(placeholder.originalProblemText, guidelines, explanationMode);
                        
                        const failureKeywords = ["풀이를 제공할 수 없", "해설을 생성할 수 없", "풀 수 없", "답변할 수 없"];
                        if (!rawMarkdown || failureKeywords.some(keyword => rawMarkdown.includes(keyword))) {
                            throw new Error("AI가 이 문제에 대한 수학적 풀이를 생성하지 못했습니다. 다른 모드를 시도하거나 문제를 확인해주세요."); 
                        }

                        if (signal.aborted) return;

                        if (!rawMarkdown.trim()) {
                            throw new Error("최종 교정 후 해설이 비어있습니다.");
                        }

                        callbacks.onUpdateExplanation({ ...placeholder, markdown: rawMarkdown, isLoading: false, isError: false });
                        completedCount++;

                    } catch (error) {
                        if (signal.aborted) return;
                        
                        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

                        // Only count as a refund if the failure was due to the AI's inability to solve,
                        // not a network or API error.
                        if (errorMessage.includes("수학적 풀이를 생성하지 못했습니다")) {
                            refundCount++;
                        }

                        console.error(`Error processing problem ID ${placeholder.id}:`, error);
                        callbacks.onUpdateExplanation({ ...placeholder, markdown: errorMessage, isLoading: false, isError: true });
                    }
                })();
            });

            await Promise.all(batchPromises);

            if (i + CONCURRENT_LIMIT < initialExplanations.length && !signal.aborted) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }
        
        return { refundCount };
    }
}

let serviceInstance: ProcessingService | null = null;

export function getProcessingService(): ProcessingService {
    if (!serviceInstance) {
        serviceInstance = new ProcessingService();
    }
    return serviceInstance;
}