import { getPdfDocument, renderPdfPageToImage } from './pdfService';
import { 
    generateExplanation, 
    verifyAndCorrectExplanation, 
    extractTextFromProblemImage,
    extractProblemsFromPage 
} from './geminiService';
import { fileToBase64, isPdfFile } from './fileService';
import { Explanation, ExtractedProblem, ExplanationMode, UserSelection } from '../types';

interface ProcessingCallbacks {
    setStatusMessage: (message: string) => void;
    onNewExplanation: (placeholder: Explanation) => void;
    onUpdateExplanation: (updatedExplanation: Explanation) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
}

type PageImage = { image: string; pageNumber: number };

class ProcessingService {
    private problemIdCounter = 0;

    private async cropImageFromBase64(
        base64Image: string,
        bbox: ExtractedProblem['bbox']
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Failed to get canvas context'));

                const sx = bbox.x_min * img.width;
                const sy = bbox.y_min * img.height;
                const sWidth = (bbox.x_max - bbox.x_min) * img.width;
                const sHeight = (bbox.y_max - bbox.y_min) * img.height;
                
                if (sWidth <= 0 || sHeight <= 0) {
                    return reject(new Error('Crop dimensions must be greater than zero.'));
                }

                canvas.width = sWidth;
                canvas.height = sHeight;

                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => reject(new Error('Failed to load image for cropping.'));
            img.src = base64Image;
        });
    }

    private parseProblemNumber = (line: string): number | null => {
        if (!line) return null;
        const match = line.match(/^\D*(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    };
    
    /**
     * [NEW] Pre-processes an image for optimal AI analysis.
     * Resizes to a max width and converts to high-contrast black & white.
     * @param base64Image The original base64 image.
     * @returns A promise that resolves to the pre-processed base64 image (JPEG).
     */
    private async preprocessImageForAI(base64Image: string): Promise<string> {
        const MAX_WIDTH = 1500; // Optimal size for Gemini analysis

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Failed to get canvas context'));

                const scale = Math.min(1, MAX_WIDTH / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                // Draw image and apply filters for high contrast
                ctx.filter = 'grayscale(1) contrast(1.5) brightness(1.1)';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => reject(new Error('Failed to load image for pre-processing.'));
            img.src = base64Image;
        });
    }

    public async analyzeFiles(
        files: File[],
        setStatusMessage: (message: string) => void
    ): Promise<{ pages: PageImage[], initialProblems: Map<number, ExtractedProblem[]> }> {
        const allPages: PageImage[] = [];
        const initialProblems = new Map<number, ExtractedProblem[]>();

        for (const file of files) {
            let pageImages: PageImage[] = [];
            
            if (await isPdfFile(file)) {
                const pdf = await getPdfDocument(file);
                setStatusMessage(`'${file.name}'의 ${pdf.numPages}개 페이지 렌더링 중...`);
                const pageRenderPromises = Array.from({ length: pdf.numPages }, async (_, i) => {
                    const pageNumber = i + 1;
                    const page = await pdf.getPage(pageNumber);
                    const image = await renderPdfPageToImage(page);
                    page.cleanup();
                    return { image, pageNumber };
                });
                pageImages = await Promise.all(pageRenderPromises);
                if (pdf.destroy) await pdf.destroy();
            } else {
                setStatusMessage(`'${file.name}' 이미지 처리 중...`);
                const image = await fileToBase64(file);
                pageImages.push({ image, pageNumber: 1 });
            }
            allPages.push(...pageImages);
        }
        
        const analysisPromises = allPages.map(async ({ image, pageNumber }) => {
            setStatusMessage(`${pageNumber}페이지 AI 분석을 위해 최적화 중...`);
            const optimizedImage = await this.preprocessImageForAI(image);
            
            setStatusMessage(`${pageNumber}페이지에서 문제 위치 분석 중... (Gemini AI)`);
            const coarseProblems = await extractProblemsFromPage(optimizedImage);
            initialProblems.set(pageNumber, coarseProblems);
        });

        await Promise.all(analysisPromises);
        
        return { pages: allPages, initialProblems };
    }


    async generateExplanationsForSelections(
        userSelections: UserSelection[],
        pageImages: PageImage[],
        guidelines: string,
        explanationMode: ExplanationMode,
        callbacks: ProcessingCallbacks
    ): Promise<void> {
        this.problemIdCounter = 0;
        
        const sortedSelections = [...userSelections].sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) {
                return a.pageNumber - b.pageNumber;
            }
            return a.bbox.y_min - b.bbox.y_min;
        });
    
        let problemCounter = 1;
    
        try {
            callbacks.setStatusMessage('문제 카드 생성 중...');

            // Step 1: Create ALL placeholders IMMEDIATELY and synchronously.
            const allPlaceholders: Explanation[] = sortedSelections.map(selection => {
                const problemId = this.problemIdCounter++;
                const currentProblemNumber = problemCounter++;
                const { pageNumber } = selection;

                const placeholder: Explanation = {
                    id: problemId,
                    markdown: `해설 생성 대기 중...`,
                    isSatisfied: false,
                    isLoading: true,
                    isError: false,
                    pageNumber,
                    problemNumber: currentProblemNumber,
                    problemImage: '',
                    originalProblemText: '',
                };
                callbacks.onNewExplanation(placeholder);
                return placeholder;
            });

            if (allPlaceholders.length === 0) {
                callbacks.onComplete();
                return;
            }

            callbacks.setStatusMessage(`${allPlaceholders.length}개의 해설 생성을 시작합니다...`);

            // Step 2: Process all placeholders concurrently
            const processingPromises = sortedSelections.map((selection, index) => {
                const placeholder = allPlaceholders[index];
                
                return (async () => {
                    try {
                        const { pageNumber, bbox } = selection;
                        const pageData = pageImages.find(p => p.pageNumber === pageNumber);
                        if (!pageData) {
                            throw new Error(`페이지 데이터를 찾을 수 없습니다: ${pageNumber}`);
                        }

                        callbacks.onUpdateExplanation({ ...placeholder, markdown: `[${pageNumber}페이지 문제 ${placeholder.problemNumber}] 문제 영역 분석 중...` });
                        const problemImage = await this.cropImageFromBase64(pageData.image, bbox);
                        
                        let accurateProblemText: string;
                        if (selection.initialText && selection.initialText.trim()) {
                            // Mobile flow: use the text from the first scan and skip the second, precise scan.
                            accurateProblemText = selection.initialText;
                        } else {
                            // Desktop flow: perform the high-precision scan on the cropped image.
                            accurateProblemText = await extractTextFromProblemImage(problemImage);
                        }

                        if (!accurateProblemText.trim()) {
                            throw new Error("문제 영역에서 텍스트를 인식하지 못했습니다.");
                        }
                        
                        const updatedPlaceholder = { ...placeholder, problemImage, originalProblemText: accurateProblemText };
                        callbacks.onUpdateExplanation(updatedPlaceholder);

                        callbacks.onUpdateExplanation({ ...updatedPlaceholder, markdown: `[${pageNumber}페이지 문제 ${placeholder.problemNumber}] AI 해설 생성 중...` });
                        const rawMarkdown = await generateExplanation(accurateProblemText, guidelines, explanationMode);
                        
                        callbacks.onUpdateExplanation({ ...updatedPlaceholder, markdown: `[${pageNumber}페이지 문제 ${placeholder.problemNumber}] 생성된 해설 검증 및 교정 중...` });
                        const finalMarkdown = await verifyAndCorrectExplanation(rawMarkdown);

                        if (!finalMarkdown.trim()) {
                            throw new Error("최종 교정 후 해설이 비어있습니다.");
                        }

                        callbacks.onUpdateExplanation({ ...updatedPlaceholder, markdown: finalMarkdown, isLoading: false, isError: false });

                    } catch (error) {
                        console.error(`Error processing problem ID ${placeholder.id}:`, error);
                        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
                        callbacks.onUpdateExplanation({ ...placeholder, markdown: errorMessage, isLoading: false, isError: true });
                    }
                })();
            });

            await Promise.all(processingPromises);

            // Step 3: Complete
            callbacks.onComplete();

        } catch(error) {
            callbacks.onError(error instanceof Error ? error : new Error('알 수 없는 오류가 발생했습니다.'));
        }
    }
}


let serviceInstance: ProcessingService | null = null;

export function getProcessingService(): ProcessingService {
    if (!serviceInstance) {
        serviceInstance = new ProcessingService();
    }
    return serviceInstance;
}