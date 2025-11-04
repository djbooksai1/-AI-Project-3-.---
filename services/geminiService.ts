import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ExplanationMode, Bbox } from '../types';
import { getPrompt } from './promptService';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function makeApiCallWithRetry(
    apiCall: () => Promise<GenerateContentResponse>, 
    maxRetries = 3, 
    initialDelay = 2000
): Promise<GenerateContentResponse> {
    let attempt = 0;
    let delay = initialDelay;

    while (attempt <= maxRetries) {
        try {
            return await apiCall();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
            const isRetriableError = 
                errorMessage.includes('429') || 
                errorMessage.includes('resource_exhausted') ||
                errorMessage.includes('503') ||
                errorMessage.includes('unavailable');

            if (errorMessage.includes('quota')) {
                 throw error;
            }

            if (isRetriableError && attempt < maxRetries) {
                console.warn(`API call failed with retriable error. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; 
                attempt++;
            } else {
                throw error; 
            }
        }
    }
    throw new Error("API call failed after multiple retries.");
}

const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

type ParagraphWithBbox = {
    text: string;
    boundingBox: { vertices: { x: number; y: number }[] };
};


/**
 * Extracts paragraphs and their bounding boxes from a base64 image using Cloud Vision API.
 * This provides the necessary coordinate data for precise problem cropping.
 * @param base64Image The base64 encoded image data string.
 * @returns A promise resolving to an array of paragraphs with their text and bounding box vertices.
 */
export const extractTextWithCloudVision = async (base64Image: string): Promise<ParagraphWithBbox[] | null> => {
    const CLOUD_VISION_API_KEY = "AIzaSyAGs15VhXSxx4G8x2RoYm9Kv9aAtM__cEA";
    const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${CLOUD_VISION_API_KEY}`;
    
    const pureBase64 = base64Image.split(',')[1] || base64Image;

    const requestBody = {
        requests: [{
            image: { content: pureBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { "languageHints": ["ko", "en"] }
        }],
    };

    try {
        const response = await fetch(VISION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
            const errorDetails = data.error?.message || `HTTP error! status: ${response.status}`;
            throw new Error(`해적 AI 이미지 분석 API 호출 실패: ${errorDetails}. API Key에 'Cloud Vision API' 권한이 부여되었는지, 그리고 결제가 활성화되었는지 확인해주세요.`);
        }
        
        const page = data.responses?.[0]?.fullTextAnnotation?.pages?.[0];
        if (!page || !page.blocks) {
            return null;
        }

        const extractedParagraphs: ParagraphWithBbox[] = [];
        page.blocks.forEach((block: any) => {
            block.paragraphs.forEach((paragraph: any) => {
                const paragraphText = paragraph.words.map((word: any) => 
                    word.symbols.map((symbol: any) => symbol.text).join('')
                ).join(' ');
                
                extractedParagraphs.push({
                    text: paragraphText.trim(),
                    boundingBox: paragraph.boundingBox,
                });
            });
        });

        return extractedParagraphs.length > 0 ? extractedParagraphs : null;

    } catch (error) {
        console.error('Failed to call 해적 AI 이미지 분석 API:', error);
        if (error instanceof Error && error.message.startsWith('해적 AI 이미지 분석 API')) {
            throw error;
        }
        throw new Error("해적 AI 이미지 분석 API를 호출하는 중 네트워크 오류가 발생했습니다.");
    }
};

/**
 * Stage 1 of Hybrid Analysis: A fast, rule-based heuristic grouping of paragraphs.
 * This function acts as a 'scout' to quickly identify probable problem boundaries.
 * @param paragraphs The array of paragraphs with their text from Cloud Vision.
 * @returns An array of arrays, where each inner array contains the indices of paragraphs for a potential problem.
 */
function heuristicProblemGrouping(paragraphs: ParagraphWithBbox[]): number[][] {
    const groups: number[][] = [];
    if (paragraphs.length === 0) return groups;

    let currentGroup: number[] = [];
    
    // Regex to find typical problem starters (e.g., "1.", "21.", "[3]")
    const problemStartRegex = /^(?:\[\d{1,2}\]|\d{1,2}\.)/;

    paragraphs.forEach((p, index) => {
        // If the text starts with a pattern, it's likely a new problem.
        if (problemStartRegex.test(p.text.trim())) {
            // If the current group is not empty, push it to the list of groups.
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            // Start a new group.
            currentGroup = [index];
        } else {
            // If it's not a starter, add it to the current group if it has started.
            if (currentGroup.length > 0) {
                currentGroup.push(index);
            }
        }
    });

    // Add the last group if it exists.
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

/**
 * Takes paragraphs with coordinate data and uses a 2-stage hybrid approach to group them.
 * Stage 1: Fast heuristic grouping. Stage 2: AI verification and correction.
 * @param paragraphs The array of paragraphs with bounding box data from Cloud Vision.
 * @param imageWidth The width of the original source image.
 * @param imageHeight The height of the original source image.
 * @returns A promise that resolves to an array of objects, each containing a problem's text and its normalized bounding box.
 */
export const structureTextIntoProblems = async (
    paragraphs: ParagraphWithBbox[],
    imageWidth: number,
    imageHeight: number
): Promise<{ problemText: string; bbox: Bbox }[]> => {
    try {
        const heuristicGroups = heuristicProblemGrouping(paragraphs);
        const promptTemplate = await getPrompt('structureText');

        const prompt = promptTemplate
            .replace('{{paragraphs}}', paragraphs.map((p, i) => {
                const verticesString = p.boundingBox.vertices.map(v => `(${v.x || 0}, ${v.y || 0})`).join(', ');
                return `[${i}] [${verticesString}] "${p.text}"`;
            }).join('\n'))
            .replace('{{heuristicGroups}}', JSON.stringify(heuristicGroups));

        const responseSchema = {
            type: Type.ARRAY,
            items: { 
                type: Type.ARRAY,
                description: "An array of paragraph indices belonging to one problem.",
                items: { type: Type.INTEGER }
            }
        };

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    safetySettings,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.0,
                },
            })
        );

        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("AI returned an empty response while structuring problems.");
        }
        
        const problemIndices = JSON.parse(jsonText) as number[][];
        
        return problemIndices.map(indices => {
            const problemParagraphs = indices.map(i => paragraphs[i]);
            const problemText = problemParagraphs.map(p => p.text).join('\n');
            
            let x_min = imageWidth, y_min = imageHeight, x_max = 0, y_max = 0;
            problemParagraphs.forEach(p => {
                p.boundingBox.vertices.forEach(v => {
                    x_min = Math.min(x_min, v.x || 0);
                    y_min = Math.min(y_min, v.y || 0);
                    x_max = Math.max(x_max, v.x || 0);
                    y_max = Math.max(y_max, v.y || 0);
                });
            });

            const bbox: Bbox = {
                x_min: x_min / imageWidth,
                y_min: y_min / imageHeight,
                x_max: x_max / imageWidth,
                y_max: y_max / imageHeight,
            };

            return { problemText, bbox };
        });

    } catch (error) {
        console.error("Error structuring text into problems:", error);
        // Propagate the original error to allow higher-level components
        // to catch specific errors (like prompt loading failures).
        throw error;
    }
};

type ProblemCandidate = { problemText: string; bbox: Bbox };

/**
 * Filters a batch of problem candidates to identify which are math problems using a single AI call.
 * @param problemCandidates An array of problem candidate objects.
 * @returns A promise that resolves to an array of candidates that were identified as math problems.
 */
export const filterMathProblemsBatch = async (
    problemCandidates: ProblemCandidate[]
): Promise<ProblemCandidate[]> => {
    if (problemCandidates.length === 0) {
        return [];
    }

    try {
        const promptTemplate = await getPrompt('filterMathProblemsBatch'); // Assuming this prompt exists in Firestore
        
        const problemsString = problemCandidates
            .map((p, index) => `[문제 ${index}]\n${p.problemText}`)
            .join('\n\n---\n\n');
        
        const prompt = promptTemplate.replace('{{problemTexts}}', problemsString);

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                math_problem_indices: {
                    type: Type.ARRAY,
                    description: "An array of indices corresponding to the problems that are mathematical.",
                    items: { type: Type.INTEGER }
                }
            },
            required: ['math_problem_indices']
        };

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    safetySettings,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.0,
                },
            })
        );
        
        const jsonText = response.text?.trim();
        if (!jsonText) {
            console.warn("Batch math problem filter returned empty response. Assuming no math problems.");
            return [];
        }
        
        const result = JSON.parse(jsonText) as { math_problem_indices: number[] };
        const mathIndices = new Set(result.math_problem_indices);
        
        return problemCandidates.filter((_, index) => mathIndices.has(index));

    } catch (error) {
        console.error("Error in filterMathProblemsBatch:", error);
        throw error;
    }
};

export const generateExplanation = async (
    problemText: string,
    guidelines: string,
    explanationMode: ExplanationMode
): Promise<string> => {
    try {
        const systemInstruction = await getPrompt('systemInstruction');
        const generationPromptTemplate = await getPrompt('generateExplanation');
        
        const formattingInstruction = "매우 중요: 1. 모든 문장은 마침표(.)로 끝나야 합니다. 2. 문장이 끝난 후에는 반드시 줄바꿈을 두 번(엔터 두 번)하여 다음 문장과 명확하게 구분해주세요.";
        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}\n\n[출력 형식 규칙]\n${formattingInstruction}`;

        const modelConfig: {
            systemInstruction: string;
            safetySettings: typeof safetySettings;
            temperature: number;
            thinkingConfig?: { thinkingBudget: number };
        } = { 
            systemInstruction: fullSystemInstruction,
            safetySettings: safetySettings,
            temperature: 0.0,
        };
        
        let model: string;
        switch(explanationMode) {
            case 'fast':
                model = 'gemini-2.5-flash';
                break;
            case 'quality':
                model = 'gemini-2.5-pro';
                modelConfig.thinkingConfig = { thinkingBudget: 32768 };
                break;
            case 'dajeong':
            default:
                model = 'gemini-2.5-pro';
                break;
        }

        const generationPromptText = generationPromptTemplate.replace('{{problemText}}', problemText);
        
        const response = await makeApiCallWithRetry(() => 
            ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: generationPromptText }] }],
                config: modelConfig,
            })
        );
        
        const text = response.text;

        if (!text || text.trim() === '') {
            const finishReason = response.candidates?.[0]?.finishReason;
            const safetyRatings = response.candidates?.[0]?.safetyRatings;
            console.error('해적 AI가 빈 응답을 반환했습니다.', { finishReason, safetyRatings });
            
            let userMessage = "해적 AI가 빈 응답을 반환했습니다.";
            if (finishReason && finishReason !== 'STOP') userMessage += ` (종료 사유: ${finishReason})`;
            throw new Error(userMessage);
        }
        
        return text;

    } catch (error) {
        console.error("Error generating explanation from 해적 AI:", error);
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('quota')) throw new Error("API 사용량 할당량을 초과했습니다.");
            if (msg.includes('429') || msg.includes('resource_exhausted')) throw new Error("API 요청 속도 제한을 초과했습니다.");
            if (msg.includes('503') || msg.includes('unavailable')) throw new Error("AI 모델이 현재 과부하 상태입니다.");
            throw error;
        }
        throw new Error("AI 해설을 생성하는 데 실패했습니다. API 키 또는 네트워크 연결을 확인해주세요.");
    }
};

export const extractCoreIdeas = async (problemText: string): Promise<string[]> => {
    try {
        const systemInstruction = await getPrompt('extractIdeasSystem');
        const promptTemplate = await getPrompt('extractIdeasUser');
        const prompt = promptTemplate.replace('{{problemText}}', problemText);

        const coreIdeasSchema = {
            type: Type.OBJECT,
            properties: {
                ideas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "A list of up to 3 core mathematical ideas."
                }
            },
            required: ['ideas']
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction,
                safetySettings,
                responseMimeType: "application/json",
                responseSchema: coreIdeasSchema,
                temperature: 0.0
            },
        });
        const jsonText = response.text?.trim();
        if (!jsonText) throw new Error("AI returned an empty response.");
        return JSON.parse(jsonText).ideas || [];
    } catch (error) {
        console.error("Error extracting core ideas:", error);
        throw new Error("문제의 핵심 아이디어를 추출하는 데 실패했습니다.");
    }
};


export const generateVariationProblem = async (
    baseProblemText: string,
    guidelines: string,
    variationLevel: 'numeric' | 'form' | 'creative',
    selectedCoreIdea?: string
): Promise<{ problem: string; explanation: string; }> => {
    try {
        const systemInstruction = await getPrompt('systemInstruction');
        const promptTemplate = await getPrompt('generateVariation');
        
        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;

        let levelDescription = '';
        switch (variationLevel) {
            case 'numeric': levelDescription = await getPrompt('variationNumeric'); break;
            case 'form': levelDescription = (await getPrompt('variationForm')).replace('{{selectedCoreIdea}}', selectedCoreIdea || ''); break;
            case 'creative': levelDescription = (await getPrompt('variationCreative')).replace('{{selectedCoreIdea}}', selectedCoreIdea || ''); break;
        }

        const prompt = promptTemplate
            .replace('{{baseProblemText}}', baseProblemText)
            .replace('{{variationLevel}}', variationLevel)
            .replace('{{levelDescription}}', levelDescription)
            .replace('{{coreIdeaInstruction}}', selectedCoreIdea ? `\n- **핵심 아이디어:** 생성될 문제는 반드시 "${selectedCoreIdea}" 개념을 중심으로 구성되어야 합니다.` : '');

        const variationSchema = {
            type: Type.OBJECT, properties: { problem: { type: Type.STRING }, explanation: { type: Type.STRING }}, required: ["problem", "explanation"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: fullSystemInstruction, safetySettings,
                responseMimeType: "application/json", responseSchema: variationSchema, temperature: 0.0 
            },
        });

        const jsonText = response.text?.trim();
        if (!jsonText) throw new Error("AI returned an empty response.");
        
        const result = JSON.parse(jsonText);
        return { problem: result.problem, explanation: result.explanation };

    } catch (error) {
        console.error("Error generating variation problem:", error);
        throw new Error("변형 문제를 생성하는 데 실패했습니다.");
    }
};

export const askCaptainAboutLine = async (
    problemText: string,
    fullExplanation: string,
    selectedLine: string,
    userQuestion: string
): Promise<string> => {
    try {
        const systemInstruction = await getPrompt('askCaptainSystem');
        const promptTemplate = await getPrompt('askCaptainUser');

        const prompt = promptTemplate
            .replace('{{problemText}}', problemText)
            .replace('{{fullExplanation}}', fullExplanation)
            .replace('{{selectedLine}}', selectedLine)
            .replace('{{userQuestion}}', userQuestion);

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: { systemInstruction, safetySettings, temperature: 0.2 },
            })
        );

        const answer = response.text;
        if (!answer || answer.trim() === '') throw new Error("AI 선장이 답변을 생성하지 못했습니다.");
        return answer;

    } catch (error) {
        console.error("Error asking captain:", error);
        if (error instanceof Error) throw error;
        throw new Error("선장에게 질문하는 중 오류가 발생했습니다.");
    }
};