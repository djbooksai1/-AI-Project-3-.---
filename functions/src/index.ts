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
                    
                    // The problematic auto-fixing logic has been removed.
                    // We now trust the AI's output and pass it directly to the frontend.
                    return parseJsonResponse(response.text, type);

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