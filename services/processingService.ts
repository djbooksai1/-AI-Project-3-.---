import { getPdfDocument, renderPdfPageToImage } from './pdfService';
import { 
    generateExplanationsBatch,
    detectMathProblemsFromImage,
    postProcessMarkdown,
} from './geminiService';
import { fileToBase64, isPdfFile } from './fileService';
import { Explanation, ExplanationMode, Bbox, UserSelection, AnalyzedProblem } from '../types';
import { db } from '../firebaseConfig';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

interface ProcessingCallbacks {
    setStatusMessage: (message: string) => void;
    onUpdateExplanation: (updatedExplanation: Explanation) => void;
}

type PageImage = { image: string; pageNumber: number };

export const cropImage = (base64Image: string, bbox: Bbox): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));

            const x_min = Math.max(0, bbox.x_min);
            const y_min = Math.max(0, bbox.y_min);
            const x_max = Math.min(1, bbox.x_max);
            const y_max = Math.min(1, bbox.y_max);

            const sx = x_min * img.naturalWidth;
            const sy = y_min * img.naturalHeight;
            const sWidth = (x_max - x_min) * img.naturalWidth;
            const sHeight = (y_max - y_min) * img.naturalHeight;
            
            if (sWidth <= 0 || sHeight <= 0) {
                canvas.width = 1;
                canvas.height = 1;
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, 1, 1);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
                return;
            }

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
    const problemStartRegex = /^(?:\[\s*(\d{1,4})\s*\]|(\d{1,4})(?:\.|번))/;
    const match = text.trim().match(problemStartRegex);
    return match ? parseInt(match[1] || match[2], 10) : null;
};

const simpleHash = (s: string): string => {
    let hash = 0;
    if (s.length === 0) return "0";
    for (let i = 0; i < s.length; i++) {
        const char = s.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    // Convert to a positive hex string to avoid negative signs.
    return (hash >>> 0).toString(16);
};


export async function getAllPageImages(files: File[], setStatusMessage: (message: string) => void): Promise<PageImage[]> {
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

export async function analyzePage(pageData: PageImage): Promise<AnalyzedProblem[]> {
    try {
        const detectedProblems = await detectMathProblemsFromImage(pageData.image);
        return detectedProblems.map(p => ({
            ...p,
            pageNumber: pageData.pageNumber,
            pageImage: pageData.image,
        }));
    } catch (error) {
        console.error(`Error analyzing page ${pageData.pageNumber} with Vision AI:`, error);
        throw new Error("파도가 거셉니다! 문제 다시쓰기 버튼을 눌러주세요");
    }
}

export async function createInitialExplanations(analyzedProblems: AnalyzedProblem[], totalProblemCount: number, alreadyFound: number): Promise<Explanation[]> {
    const sortedByPosition = [...analyzedProblems].sort((a, b) => a.bbox.y_min - b.bbox.y_min);
    
    const initialExplanations = sortedByPosition.map((problem, index) => {
        const originalProblemText = problem.problemBody + (problem.choices ? `\n${problem.choices}` : '');
        const problemNumberFromAI = problem.problemNumber ? parseInt(problem.problemNumber.replace(/[^0-9]/g, ''), 10) : null;
        const finalProblemNumber = problemNumberFromAI ?? parseProblemNumberFromText(problem.problemBody) ?? (1000 + index);

        return {
            id: Date.now() + Math.random(),
            markdown: ``,
            isLoading: true,
            isError: false,
            pageNumber: problem.pageNumber,
            problemNumber: finalProblemNumber,
            problemImage: problem.pageImage, 
            originalProblemText: originalProblemText,
            problemBody: problem.problemBody,
            problemType: problem.problemType,
            choices: problem.choices,
            variationProblem: undefined,
            bbox: problem.bbox,
        };
    });

    initialExplanations
        .sort((a, b) => a.problemNumber - b.problemNumber)
        .forEach((exp, index) => {
            exp.markdown = `해설 생성 대기 중... (${alreadyFound + index + 1}/${totalProblemCount})`;
        });

    return initialExplanations;
}

export async function createExplanationsFromUserSelections(
    selections: UserSelection[],
    allPageImages: PageImage[],
): Promise<Explanation[]> {
    const explanationPromises = selections.map(async (selection, index) => {
        const page = allPageImages.find(p => p.pageNumber === selection.pageNumber);
        if (!page) throw new Error(`Page ${selection.pageNumber} not found for selection.`);

        const croppedImage = await cropImage(page.image, selection.bbox);
        const detectedProblems = await detectMathProblemsFromImage(croppedImage);
        
        const problem = detectedProblems[0] || {
            problemBody: "문제 텍스트 인식 실패",
            problemType: '주관식',
            choices: undefined,
            problemNumber: undefined,
            bbox: { x_min: 0, y_min: 0, x_max: 1, y_max: 1 }
        };

        const originalProblemText = problem.problemBody + (problem.choices ? `\n${problem.choices}` : '');
        const problemNumberFromAI = problem.problemNumber ? parseInt(problem.problemNumber.replace(/[^0-9]/g, ''), 10) : null;
        
        return {
            id: Date.now() + Math.random(),
            markdown: `해설 생성 대기 중... (${index + 1}/${selections.length})`,
            isLoading: true,
            isError: false,
            pageNumber: selection.pageNumber,
            problemNumber: problemNumberFromAI ?? parseProblemNumberFromText(problem.problemBody) ?? (1000 + index),
            problemImage: croppedImage,
            originalProblemText: originalProblemText,
            problemBody: problem.problemBody,
            problemType: problem.problemType,
            choices: problem.choices,
            variationProblem: undefined,
            bbox: selection.bbox, 
        };
    });
    return Promise.all(explanationPromises);
}

async function logGenerationFailure(explanation: Explanation, failureReason: string) {
    try {
        await addDoc(collection(db, "failedGenerations"), {
            timestamp: serverTimestamp(),
            originalProblemText: explanation.originalProblemText,
            problemImage: explanation.problemImage,
            failureReason,
        });
    } catch (error) {
        console.error("Failed to log generation failure to Firestore:", error);
    }
}


export async function generateExplanations(
    initialExplanations: Explanation[],
    explanationMode: ExplanationMode,
    useDajeongGuidelines: boolean,
    callbacks: ProcessingCallbacks,
    signal: AbortSignal
): Promise<void> {
    const failureKeywords = ["풀이를 제공할 수 없", "해설을 생성할 수 없", "풀 수 없", "답변할 수 없"];
    const explanationsToGenerate: Explanation[] = [];

    // Step 1: Check cache for all problems
    for (const [index, exp] of initialExplanations.entries()) {
        if (signal.aborted) return;
        callbacks.setStatusMessage(`캐시 확인 중... (${index + 1}/${initialExplanations.length})`);
        const hash = simpleHash(exp.problemImage);
        const cacheRef = doc(db, 'goldenSet', hash);
        const cacheSnap = await getDoc(cacheRef);

        if (cacheSnap.exists()) {
            const data = cacheSnap.data();
            callbacks.onUpdateExplanation({
                ...exp,
                markdown: data.markdown,
                coreConcepts: data.coreConcepts,
                difficulty: data.difficulty,
                variationProblem: data.variationProblem,
                isLoading: false,
                isGolden: true,
            });
        } else {
            explanationsToGenerate.push(exp);
        }
    }

    if (signal.aborted || explanationsToGenerate.length === 0) {
        return;
    }

    // Step 2: Process remaining explanations with controlled parallelism (Worker Pool)
    callbacks.setStatusMessage(`${explanationsToGenerate.length}개 해설 생성 중... (최대 3개 동시 처리)`);

    const CONCURRENCY_LIMIT = 3;
    const tasks = [...explanationsToGenerate]; // Create a mutable copy of tasks to act as a queue
    let generatedCount = 0;

    const worker = async () => {
        while (tasks.length > 0) {
            if (signal.aborted) return;

            const exp = tasks.shift(); // Get a task from the queue
            if (!exp) continue;

            generatedCount++;
            callbacks.onUpdateExplanation({
                ...exp,
                markdown: `해설 생성 중... (${generatedCount}/${explanationsToGenerate.length})`
            });

            try {
                const results = await generateExplanationsBatch([exp.originalProblemText], explanationMode, useDajeongGuidelines);
                const singleResult = results?.[0];

                if (signal.aborted) return;

                if (singleResult) {
                    const processedMarkdown = postProcessMarkdown(singleResult.explanation);
                    if (!processedMarkdown || failureKeywords.some(keyword => processedMarkdown.includes(keyword))) {
                         const errorMessage = "파도가 거셉니다! 해설 다시쓰기 버튼을 눌러주세요";
                         callbacks.onUpdateExplanation({ ...exp, markdown: errorMessage, isLoading: false, isError: true });
                         await logGenerationFailure(exp, processedMarkdown || "AI returned empty explanation.");
                    } else {
                        const updated: Explanation = { ...exp, markdown: processedMarkdown, coreConcepts: singleResult.coreConcepts, difficulty: singleResult.difficulty, isLoading: false, variationProblem: undefined };
                        callbacks.onUpdateExplanation(updated);
                    }
                } else {
                    const errorMessage = "파도가 거셉니다! 해설 다시쓰기 버튼을 눌러주세요";
                    callbacks.onUpdateExplanation({ ...exp, markdown: errorMessage, isLoading: false, isError: true });
                    await logGenerationFailure(exp, "AI returned null or an empty array for a single problem batch.");
                }
            } catch (reason) {
                if (signal.aborted) return;
                const errorMessage = "파도가 거셉니다! 해설 다시쓰기 버튼을 눌러주세요";
                callbacks.onUpdateExplanation({ ...exp, markdown: errorMessage, isLoading: false, isError: true });
                await logGenerationFailure(exp, `Generation failed for problem: ${reason instanceof Error ? reason.message : 'Unknown error'}`);
            }
        }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(() => worker());
    await Promise.all(workers);
}