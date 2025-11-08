
import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ExplanationMode, Bbox } from '../types';
import { getPrompt } from './promptService';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface StructuredExplanation {
    explanation: string;
    coreConcepts: string[];
    difficulty: number;
}

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

/**
 * Analyzes a full page image using a multimodal AI to detect all math problems.
 * This single call replaces the previous multi-step process (OCR -> Text Grouping -> Filtering).
 * @param base64Image The base64 encoded image data string of the entire page.
 * @returns A promise that resolves to an array of objects, each containing a problem's extracted text and its normalized bounding box.
 */
export const detectMathProblemsFromImage = async (
    base64Image: string
): Promise<{ problemBody: string; problemType: '객관식' | '주관식'; choices?: string; bbox: Bbox }[]> => {
    try {
        // Fetch the specialized prompt from Firestore for problem detection with strict LaTeX rules.
        const prompt = await getPrompt('detectProblemsWithLatex');
        
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image.split(',')[1] || base64Image,
            },
        };

        const responseSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    bbox: {
                        type: Type.OBJECT,
                        properties: {
                            x_min: { type: Type.NUMBER, description: "Normalized x-coordinate of the top-left corner (0 to 1)." },
                            y_min: { type: Type.NUMBER, description: "Normalized y-coordinate of the top-left corner (0 to 1)." },
                            x_max: { type: Type.NUMBER, description: "Normalized x-coordinate of the bottom-right corner (0 to 1)." },
                            y_max: { type: Type.NUMBER, description: "Normalized y-coordinate of the bottom-right corner (0 to 1)." },
                        },
                        required: ["x_min", "y_min", "x_max", "y_max"],
                    },
                    problemType: { 
                        type: Type.STRING, 
                        enum: ['객관식', '주관식'],
                        description: "The type of the problem."
                    },
                    problemBody: {
                        type: Type.STRING,
                        description: "The main question text, excluding multiple-choice options, with all math expressions wrapped in LaTeX delimiters ($...$)."
                    },
                    choices: {
                        type: Type.STRING,
                        description: "The multiple-choice options as a single string, with math in LaTeX. Null if not applicable."
                    }
                },
                required: ["bbox", "problemType", "problemBody"],
            },
        };

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: 'gemini-2.5-flash', // This model is multimodal
                contents: [{ parts: [ { text: prompt }, imagePart ] }],
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
            console.warn("Vision AI returned an empty response for problem detection.");
            return []; // Return empty array if no problems are found or response is empty
        }
        
        const detectedProblems = JSON.parse(jsonText);
        
        return detectedProblems;

    } catch (error) {
        console.error("Error detecting math problems from image with Vision AI:", error);
        // Let the higher-level service handle the error display
        throw new Error(`해적 AI Vision 모델이 문제 영역을 분석하는 데 실패했습니다. ${error instanceof Error ? error.message : ''}`);
    }
};

const EXPLANATION_SEPARATOR = "|||---EXPLANATION_SEPARATOR---|||";

/**
 * Generates explanations for a batch of problems in a single API call for high efficiency.
 * It now requests and returns a structured object including core concepts and difficulty.
 * @param problemTexts An array of original problem texts.
 * @param guidelines The master guidelines for the AI persona.
 * @param explanationMode The mode ('fast', 'dajeong', 'quality') to determine model and config.
 * @returns A promise that resolves to an array of structured explanation objects.
 */
export const generateExplanationsBatch = async (
    problemTexts: string[],
    guidelines: string,
    explanationMode: ExplanationMode
): Promise<(StructuredExplanation | null)[]> => {
    if (problemTexts.length === 0) {
        return [];
    }

    try {
        const systemInstruction = await getPrompt('systemInstruction');
        // NOTE: A new prompt 'generateStructuredExplanationsBatch' must exist in Firestore.
        const generationPromptTemplate = await getPrompt('generateStructuredExplanationsBatch');
        
        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;

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

        const problemsString = problemTexts
            .map((text, index) => `[문제 ${index + 1} START]\n${text}\n[문제 ${index + 1} END]`)
            .join('\n\n');

        const generationPromptText = generationPromptTemplate
            .replace('{{problemCount}}', String(problemTexts.length))
            .replace('{{problemTexts}}', problemsString);

        const responseSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    explanation: {
                        type: Type.STRING,
                        description: "The detailed step-by-step explanation for the problem."
                    },
                    coreConcepts: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "A list of 1 to 3 core mathematical concepts or keywords."
                    },
                    difficulty: {
                        type: Type.INTEGER,
                        description: "Difficulty on a scale of 1 (easy) to 5 (very hard)."
                    }
                },
                required: ["explanation", "coreConcepts", "difficulty"]
            }
        };
        
        const response = await makeApiCallWithRetry(() => 
            ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: generationPromptText }] }],
                config: {
                    ...modelConfig,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                },
            })
        );
        
        let jsonText = response.text?.trim();

        if (!jsonText) {
            console.error('해적 AI가 일괄 해설 생성에서 빈 응답을 반환했습니다.');
            throw new Error("AI가 빈 응답을 반환했습니다. (일괄 처리)");
        }
        
        const jsonMatch = jsonText.match(/```(json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[2]) {
            jsonText = jsonMatch[2].trim();
        }

        try {
            const explanations = JSON.parse(jsonText) as (StructuredExplanation | null)[];

            if (explanations.length !== problemTexts.length) {
                console.warn(`일괄 해설 생성 불일치: 요청 ${problemTexts.length}개, 응답 ${explanations.length}개. AI 응답:\n`, jsonText);
                throw new Error(`AI 응답 오류: 요청된 문제 수(${problemTexts.length})와 생성된 해설 수(${explanations.length})가 일치하지 않습니다.`);
            }
            
            return explanations;
        } catch (parseError) {
            console.error("JSON 파싱 실패:", parseError);
            console.error("파싱 전 원본 AI 응답:", jsonText);
            throw new Error(`AI 응답을 처리하는 중 오류가 발생했습니다. AI가 반환한 데이터 형식이 올바르지 않을 수 있습니다. (오류: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'})`);
        }

    } catch (error) {
        console.error("일괄 해설 생성 중 오류 발생 (해적 AI):", error);
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('quota')) throw new Error("API 사용량 할당량을 초과했습니다.");
            if (msg.includes('429') || msg.includes('resource_exhausted')) throw new Error("API 요청 속도 제한을 초과했습니다.");
            if (msg.includes('503') || msg.includes('unavailable')) throw new Error("AI 모델이 현재 과부하 상태입니다.");
            throw error; // Re-throw other errors
        }
        throw new Error("AI 일괄 해설 생성에 실패했습니다. API 키 또는 네트워크 연결을 확인해주세요.");
    }
};

export const postProcessMarkdown = (markdown: string): string => {
    let processed = markdown.trim();
    
    // The AI sometimes helpfully wraps the entire explanation in a markdown code block.
    // This removes the fences (e.g., ```json, ```markdown, ```) to prevent rendering issues,
    // allowing MathJax and the markdown parser to process the content correctly.
    // This regex handles optional language specifiers and surrounding whitespace.
    processed = processed.replace(/^```(?:\w+\s*)?\n?([\s\S]*?)\n?```$/, '$1').trim();
    
    // Remove "expert" prefixes like '해설전문가:' or '풀이:'
    processed = processed.replace(/^(해설|풀이)전문가:\s*/, '');

    // Remove leading 'markdown' keyword if present. This is a common AI artifact.
    processed = processed.replace(/^markdown\s*/i, '');

    return processed.trim();
};

export const generateVariationNumbersOnly = async (
    baseProblemText: string,
    guidelines: string
): Promise<{ problem: string; explanation: string; }> => {
    try {
        const systemInstruction = await getPrompt('systemInstruction');
        const promptTemplate = await getPrompt('generateVariationNumbersOnly');
        
        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;

        const prompt = promptTemplate.replace('{{baseProblemText}}', baseProblemText);

        const variationSchema = {
            type: Type.OBJECT, properties: { problem: { type: Type.STRING }, explanation: { type: Type.STRING }}, required: ["problem", "explanation"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: fullSystemInstruction, 
                safetySettings,
                responseMimeType: "application/json", 
                responseSchema: variationSchema, 
                temperature: 0.5
            },
        });

        const jsonText = response.text?.trim();
        if (!jsonText) throw new Error("AI returned an empty response for variation problem.");
        
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("Error generating variation problem (numbers only):", error);
        return Promise.reject(error);
    }
};

export const generateVariationIdeas = async (
    baseProblemText: string,
    guidelines: string
): Promise<string[]> => {
    try {
        const systemInstruction = await getPrompt('systemInstruction');
        const promptTemplate = await getPrompt('generateVariationIdeaOnly');
        
        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;
        const prompt = promptTemplate.replace('{{baseProblemText}}', baseProblemText);

        const ideasSchema = {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 3 creative ideas for a variation problem, each under 50 characters."
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: fullSystemInstruction,
                safetySettings,
                responseMimeType: "application/json",
                responseSchema: ideasSchema,
                temperature: 0.7
            },
        });

        const jsonText = response.text?.trim();
        if (!jsonText) throw new Error("AI returned an empty response for variation ideas.");
        
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error generating variation ideas:", error);
        throw error;
    }
};


export const generateVariationFromIdea = async (
    baseProblemText: string,
    selectedIdea: string,
    guidelines: string
): Promise<{ problem: string; explanation: string; }> => {
    try {
        const systemInstruction = await getPrompt('systemInstruction');
        const promptTemplate = await getPrompt('variationIdeaEnhancer');

        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;
        const prompt = promptTemplate
            .replace('{{baseProblemText}}', baseProblemText)
            .replace('{{selectedIdea}}', selectedIdea);

        const variationSchema = {
            type: Type.OBJECT, properties: { problem: { type: Type.STRING }, explanation: { type: Type.STRING }}, required: ["problem", "explanation"]
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: fullSystemInstruction,
                safetySettings,
                responseMimeType: "application/json",
                responseSchema: variationSchema,
                temperature: 0.5
            },
        });

        const jsonText = response.text?.trim();
        if (!jsonText) throw new Error("AI returned an empty response for variation problem from idea.");
        
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error generating variation from idea:", error);
        throw error;
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

/**
 * Wraps multi-equation blocks in an 'aligned' environment for proper line breaking.
 */
export const formatMathEquations = (markdown: string): string => {
    // Find all display math blocks ($$ ... $$)
    return markdown.replace(/\$\$([\s\S]+?)\$\$/g, (match, content) => {
        // Heuristics:
        // 1. Check for more than one '=' sign, suggesting a chain of equations.
        // 2. Check if it's NOT already using an environment like align, aligned, gather, etc.
        const hasMultipleEquals = (content.match(/=/g) || []).length > 1;
        const hasExistingEnvironment = /\\begin\{([a-zA-Z]*\*?)\}/.test(content);

        if (hasMultipleEquals && !hasExistingEnvironment) {
            // Wrap the content in an `aligned` environment.
            // This allows MathJax to handle automatic line breaking and alignment.
            return `$$ \\begin{aligned} ${content.trim()} \\end{aligned} $$`;
        }

        // Return the original match if conditions are not met
        return match;
    });
};