// FIX: Import Buffer to resolve TypeScript error in Node.js environment.
import { Buffer } from "buffer";
import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ExplanationMode } from "./types";
import {
    ASK_CAPTAIN_SYSTEM,
    ASK_CAPTAIN_USER_TEMPLATE,
    DETECT_PROBLEMS_VISION,
    GENERATE_STRUCTURED_EXPLANATIONS_BATCH,
    GENERATE_VARIATION_FROM_IDEA,
    GENERATE_VARIATION_IDEAS,
    GENERATE_VARIATION_NUMBERS_ONLY,
    SYSTEM_INSTRUCTION,
    SIMPLE_SYSTEM_INSTRUCTION
} from "./prompts";


// [배포 설정 오류 수정] setGlobalOptions를 사용하여 모든 함수에 대한 전역 설정을 명시적으로 정의합니다.
// 이를 통해 배포 시 설정이 누락되거나 잘못 적용되는 문제를 방지하고 일관성을 확보합니다.
functions.setGlobalOptions({
    region: 'asia-northeast3', // 배포 지역을 서울로 고정
    minInstances: 1,           // 콜드 스타트 방지를 위한 최소 인스턴스
    maxInstances: 100,         // 최대 동시 실행 인스턴스
    timeoutSeconds: 600,       // 타임아웃 10분
});


// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * Safely parses a JSON response string from the Gemini API.
 * It handles cases where the response is empty, not valid JSON, or wrapped in markdown code blocks.
 * @param {string | undefined} responseText - The raw text from the AI response.
 * @param {string} type - The name of the calling function type for better error logging.
 * @returns {any} The parsed JSON object.
 * @throws {functions.https.HttpsError} If parsing fails or the response is empty.
 */
const parseJsonResponse = (responseText: string | undefined, type: string): any => {
    if (!responseText || responseText.trim() === '') {
        console.error(`AI returned an empty or null response for type: ${type}.`);
        throw new functions.https.HttpsError("not-found", `AI가 빈 응답을 반환했습니다 (${type}).`);
    }

    let jsonText = responseText.trim();
    
    // Gemini sometimes wraps JSON in markdown backticks, so we strip them.
    const jsonMatch = jsonText.match(/```(json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[2]) {
        jsonText = jsonMatch[2].trim();
    }

    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error(`Failed to parse JSON response from Gemini for type: ${type}. Raw text received:`, jsonText);
        // Provide a more descriptive error to the client.
        throw new functions.https.HttpsError("internal", `AI가 유효하지 않은 형식의 데이터를 반환했습니다 (JSON 파싱 실패). 함수 로그에서 원본 AI 응답을 확인해주세요.`);
    }
};

/**
 * Forces the AI's output to use the plain Korean speech level ('평어체') by replacing common
 * formal/honorific endings ('경어체'). This acts as a safeguard when 'useDajeongGuidelines' is active.
 * @param {string} text - The explanation text from the AI.
 * @returns {string} The processed text with formal endings converted to plain endings.
 */
const postProcessTone = (text: string): string => {
    if (!text) return "";
    let processedText = text;

    // A list of common formal endings and their plain equivalents.
    // The 'g' flag ensures all occurrences are replaced.
    const replacements = [
        // ~했습니다 / ~였습니다 -> ~했다 / ~였다 (Past tense)
        { from: /했습니다/g, to: '했다' },
        { from: /였습니다/g, to: '였다' },
        
        // ~습니다 / ~ㅂ니다 forms
        { from: /있습니다/g, to: '있다' },
        { from: /없습니다/g, to: '없다' },
        { from: /같습니다/g, to: '같다' },
        { from: /됩니다/g, to: '된다' },
        { from: /합니다/g, to: '한다' },
        { from: /입니다/g, to: '이다' },
        { from: /줍니다/g, to: '준다' },
        { from: /받습니다/g, to: '받는다' },
        { from: /봅니다/g, to: '본다' },
        { from: /않습니다/g, to: '않는다' },
        { from: /모릅니다/g, to: '모른다' },
        { from: /압니다/g, to: '안다' },
        { from: /구합니다/g, to: '구한다' },
        
        // Adjective forms (~하다)
        { from: /필요합니다/g, to: '필요하다' },
        { from: /가능합니다/g, to: '가능하다' },
        { from: /중요합니다/g, to: '중요하다' },

        // Common phrases with '수 있습니다'
        { from: /알 수 있습니다/g, to: '알 수 있다' },
        { from: /할 수 있습니다/g, to: '할 수 있다' },
        { from: /풀 수 있습니다/g, to: '풀 수 있다' },
        { from: /구할 수 있습니다/g, to: '구할 수 있다' },
        { from: /나타낼 수 있습니다/g, to: '나타낼 수 있다' },
    ];

    for (const rule of replacements) {
        processedText = processedText.replace(rule.from, rule.to);
    }

    return processedText;
};

/**
 * A post-processing function to validate and attempt to fix common LaTeX errors
 * in the AI's generated markdown to prevent MathJax rendering failures.
 * This acts as a "server-side validation" step.
 * @param {string} markdown - The raw markdown from the AI.
 * @returns {string} The processed markdown with fixes applied.
 */
const validateAndFixLatex = (markdown: string): string => {
    if (!markdown) return "";
    let fixed = markdown;

    // Rule 1: Fix common command misspellings or typos.
    const corrections = [
        { from: /\\imes/g, to: '\\times' },
        { from: /\\le\s/g, to: '\\leq ' },
        { from: /\\ge\s/g, to: '\\geq ' },
        { from: /\\cdott/g, to: '\\cdot' },
        { from: /\\cdpt/g, to: '\\cdot' },
        { from: /\\ldot/g, to: '\\cdot' },
    ];

    corrections.forEach(rule => {
        fixed = fixed.replace(rule.from, rule.to);
    });

    // Rule 2: Attempt to fix unmatched braces for \frac, a very common error source.
    // This regex looks for a \frac{...} group that isn't immediately followed by another {...} group.
    fixed = fixed.replace(/(\\frac\{[^{}]*\})(?!\{)/g, '$1{}');

    return fixed;
};


export const callGemini = functions.https.onCall({ 
    secrets: ["GEMINI_SECRET_KEY"], 
    memory: '2GiB', // AI 호출은 메모리를 많이 사용하므로 2GiB로 설정
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "이 서비스를 이용하려면 로그인이 필요합니다.");
    }

    const apiKey = process.env.GEMINI_SECRET_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_SECRET_KEY secret is not defined in the function's environment. This is a configuration error.");
        throw new functions.https.HttpsError("internal", "AI 서비스가 서버에 올바르게 설정되지 않았습니다. 관리자에게 문의하세요.");
    }
    
    const { type, payload } = request.data;
    
    try {
        // Initialize the AI client here, as it's used by multiple cases.
        const ai = new GoogleGenAI({ apiKey });

        switch (type) {
            case 'detectMathProblemsFromImage': {
                const { base64Image } = payload;
                if (!base64Image) {
                    throw new functions.https.HttpsError("invalid-argument", "유효한 base64 이미지 문자열이 필요합니다.");
                }
                
                const imageB64Data = base64Image.split(',')[1] || base64Image;
                
                const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageB64Data } };
                const responseSchema = {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            problemNumber: { type: Type.STRING },
                            bbox: {
                                type: Type.OBJECT,
                                properties: { x_min: { type: Type.NUMBER }, y_min: { type: Type.NUMBER }, x_max: { type: Type.NUMBER }, y_max: { type: Type.NUMBER } },
                                required: ["x_min", "y_min", "x_max", "y_max"],
                            },
                            problemType: { type: Type.STRING, enum: ['객관식', '주관식'] },
                            problemBody: { type: Type.STRING },
                            choices: { type: Type.STRING }
                        },
                        required: ["bbox", "problemType", "problemBody"],
                    },
                };

                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-pro',
                        contents: [{ parts: [ { text: DETECT_PROBLEMS_VISION }, imagePart ] }],
                        config: { safetySettings, responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.0, },
                    });
                    const parsedData = parseJsonResponse(response.text, type);

                    if (Array.isArray(parsedData)) {
                        parsedData.forEach(problem => {
                            if (problem && problem.bbox) {
                                problem.bbox.x_min = Math.max(0, Math.min(1, problem.bbox.x_min));
                                problem.bbox.y_min = Math.max(0, Math.min(1, problem.bbox.y_min));
                                problem.bbox.x_max = Math.max(0, Math.min(1, problem.bbox.x_max));
                                problem.bbox.y_max = Math.max(0, Math.min(1, problem.bbox.y_max));
                            }
                        });
                    }
                
                    return parsedData;
                } catch(sdkError: any) {
                    functions.logger.error(`Gemini SDK error in ${type}`, { errorMessage: sdkError.message });
                    const userMessage = `AI 이미지 분석 서비스에서 오류가 발생했습니다. (오류: ${sdkError.message})`;
                    throw new functions.https.HttpsError("unavailable", userMessage);
                }
            }

            case 'generateExplanationsBatch': {
                const { problemTexts, explanationMode, useDajeongGuidelines } = payload;
                if (!problemTexts || !Array.isArray(problemTexts) || problemTexts.length === 0) return [];
                
                const fullSystemInstruction = useDajeongGuidelines === false ? SIMPLE_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION;
                
                const modelConfig: any = { systemInstruction: fullSystemInstruction, safetySettings, temperature: 0.0 };
                let model: string;

                switch(explanationMode as ExplanationMode) {
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

                const problemsString = problemTexts.map((text: string, index: number) => `[문제 ${index + 1} START]\n${text}\n[문제 ${index + 1} END]`).join('\n\n');
                const generationPromptText = GENERATE_STRUCTURED_EXPLANATIONS_BATCH.replace('{{problemCount}}', String(problemTexts.length)).replace('{{problemTexts}}', problemsString);
                
                const responseSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { explanation: { type: Type.STRING }, coreConcepts: { type: Type.ARRAY, items: { type: Type.STRING } }, difficulty: { type: Type.INTEGER } }, required: ["explanation", "coreConcepts", "difficulty"] } };

                try {
                    const response = await ai.models.generateContent({
                        model, contents: generationPromptText,
                        config: { ...modelConfig, responseMimeType: "application/json", responseSchema },
                    });
                    
                    const parsedData = parseJsonResponse(response.text, type);
                    
                    if (Array.isArray(parsedData)) {
                        for (const item of parsedData) {
                            if (item && typeof item.explanation === 'string') {
                                // First, fix any structural LaTeX errors.
                                item.explanation = validateAndFixLatex(item.explanation);

                                // Then, if Dajeong guidelines are active, enforce the tone.
                                if (useDajeongGuidelines) {
                                    item.explanation = postProcessTone(item.explanation);
                                }
                            }
                        }
                    }

                    return parsedData;

                } catch(sdkError: any) {
                    functions.logger.error(`Gemini SDK error in ${type}`, { errorMessage: sdkError.message, problemTexts });
                    const userMessage = `AI 해설 생성 서비스에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요. (오류: ${sdkError.message})`;
                    throw new functions.https.HttpsError("unavailable", userMessage);
                }
            }

            case 'askCaptainAboutLine': {
                 const { problemText, fullExplanation, selectedLine, userQuestion } = payload;
                 const systemInstruction = ASK_CAPTAIN_SYSTEM;
                 const prompt = ASK_CAPTAIN_USER_TEMPLATE
                    .replace('{{problem}}', problemText)
                    .replace('{{explanation}}', fullExplanation)
                    .replace('{{line}}', selectedLine)
                    .replace('{{question}}', userQuestion);
                 
                try {
                    const response = await ai.models.generateContent({ 
                        model: 'gemini-2.5-flash', 
                        contents: prompt, 
                        config: { systemInstruction, safetySettings, temperature: 0.2 }
                    });

                    if (!response.text) {
                        throw new functions.https.HttpsError("not-found", "AI가 질문에 대한 답변을 생성하지 못했습니다.");
                    }
                    return response.text;
                } catch(sdkError: any) {
                    functions.logger.error(`Gemini SDK error in ${type}`, { errorMessage: sdkError.message });
                    const userMessage = `선장에게 질문하는 중 오류가 발생했습니다. (오류: ${sdkError.message})`;
                    throw new functions.https.HttpsError("unavailable", userMessage);
                }
            }

            case 'generateVariationNumbersOnly': {
                const { originalProblemText } = payload;
                const fullSystemInstruction = SYSTEM_INSTRUCTION;
                const prompt = GENERATE_VARIATION_NUMBERS_ONLY.replace('{{problemText}}', originalProblemText);
                const responseSchema = { type: Type.OBJECT, properties: { problem: { type: Type.STRING }, explanation: { type: Type.STRING } }, required: ["problem", "explanation"] };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: { systemInstruction: fullSystemInstruction, safetySettings, temperature: 0.5, responseMimeType: "application/json", responseSchema },
                });
                return parseJsonResponse(response.text, type);
            }

            case 'generateVariationIdeas': {
                const { originalProblemText } = payload;
                const fullSystemInstruction = SYSTEM_INSTRUCTION;
                const prompt = GENERATE_VARIATION_IDEAS.replace('{{problemText}}', originalProblemText);
                 const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: { systemInstruction: fullSystemInstruction, safetySettings, temperature: 0.7, responseMimeType: "application/json", responseSchema },
                });
                return parseJsonResponse(response.text, type);
            }

            case 'generateVariationFromIdea': {
                 const { originalProblemText, idea } = payload;
                const fullSystemInstruction = SYSTEM_INSTRUCTION;
                const prompt = GENERATE_VARIATION_FROM_IDEA.replace('{{problemText}}', originalProblemText).replace('{{idea}}', idea);
                 const responseSchema = { type: Type.OBJECT, properties: { problem: { type: Type.STRING }, explanation: { type: Type.STRING } }, required: ["problem", "explanation"] };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: { systemInstruction: fullSystemInstruction, safetySettings, temperature: 0.5, responseMimeType: "application/json", responseSchema },
                });
                return parseJsonResponse(response.text, type);
            }

            default:
                throw new functions.https.HttpsError("invalid-argument", "지정된 함수 유형을 찾을 수 없습니다.");
        }
    } catch (error: any) {
        console.error(`Error in callGemini (type: ${type}):`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        
        let errorMessage = "서버에서 예기치 않은 오류가 발생했습니다.";
        if (error.message) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        functions.logger.error(`Unhandled error in callGemini (type: ${type})`, {
            errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        });

        throw new functions.https.HttpsError("internal", errorMessage);
    }
});

export const updateUserUsage = functions.https.onCall({
    memory: '256MiB', // 사용량 기록은 가벼운 작업이므로 메모리를 적게 할당
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "이 서비스를 이용하려면 로그인이 필요합니다.");
    }

    const { type, count } = request.data;
    const uid = request.auth.uid;

    if (type === 'hwpExport') {
        if (typeof count !== 'number' || count <= 0) {
            throw new functions.https.HttpsError("invalid-argument", "HWP 내보내기 사용량 업데이트를 위해서는 유효한 횟수가 필요합니다.");
        }

        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthlyUsageDocRef = db.collection('users').doc(uid).collection('monthlyUsage').doc(currentMonth);
        const userDocRef = db.collection('users').doc(uid);
        const incrementValue = admin.firestore.FieldValue.increment(count);

        try {
            // Firestore Batch를 사용하여 월별 사용량과 누적 사용량을 원자적으로 업데이트합니다.
            // 이 방식은 여러 요청이 동시에 들어오는 경쟁 상태를 방지하고,
            // 문서가 존재하지 않는 경우에도 오류 없이 안전하게 처리합니다.
            const batch = db.batch();

            // 월별 사용량 업데이트 (문서가 없으면 생성하고, 있으면 증가)
            batch.set(monthlyUsageDocRef, { hwpExports: incrementValue }, { merge: true });
            
            // 누적 사용량 업데이트 (문서/필드가 없으면 생성하고, 있으면 증가)
            batch.set(userDocRef, { cumulativeUsage: { hwpExports: incrementValue } }, { merge: true });

            await batch.commit();

            return { success: true, message: `사용량 업데이트 성공: ${uid}.` };
        } catch (error) {
            console.error(`HWP 사용량 업데이트 실패 (사용자: ${uid}):`, error);
            throw new functions.https.HttpsError("internal", "사용량 기록에 실패했습니다. Firestore 작업 중 오류가 발생했습니다.");
        }
    } else {
        throw new functions.https.HttpsError("invalid-argument", "유효하지 않은 사용량 유형이 지정되었습니다.");
    }
});

export const generateHwp = functions.https.onCall({
    secrets: ["AUTH_SECRET_KEY"],
    memory: '1GiB', // 파일 변환은 메모리를 사용할 수 있으므로 1GiB로 설정
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "이 서비스를 이용하려면 로그인이 필요합니다.");
    }
    
    const { content } = request.data;
    if (!content || typeof content !== 'string') {
        throw new functions.https.HttpsError("invalid-argument", "HWP 파일 생성을 위한 콘텐츠가 필요합니다.");
    }

    const HWP_GENERATOR_URL = "https://hml-generator-service-646620208083.asia-northeast3.run.app/generate";
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY;

    if (!AUTH_SECRET_KEY) {
         console.error("CRITICAL: AUTH_SECRET_KEY secret is not defined.");
         throw new functions.https.HttpsError("internal", "HWP 생성 서비스가 서버에 올바르게 설정되지 않았습니다.");
    }
    
    try {
        const response = await fetch(HWP_GENERATOR_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': AUTH_SECRET_KEY,
            },
            body: JSON.stringify({
                content: content,
                treatAsChar: true,
                textSize: 12,
                equationSize: 9,
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HWP generator service error: ${response.status} ${errorText}`);
            throw new functions.https.HttpsError("internal", `HWP 생성 서버에서 오류가 발생했습니다: ${errorText}`);
        }

        const buffer = await response.arrayBuffer();
        const base64Hwp = Buffer.from(buffer).toString('base64');

        return { base64Hwp };

    } catch (error: any) {
        console.error("Error calling HWP generator service:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "HWP 파일 생성 중 서버 오류가 발생했습니다.");
    }
});
