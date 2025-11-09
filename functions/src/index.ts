

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ExplanationMode } from "./types";

// NOTE: We are intentionally NOT importing 'canvas' or 'pdfjs-dist' at the top level.
// They will be loaded dynamically inside the 'processPdf' case to avoid deployment errors.

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Use an in-memory cache for prompts to reduce Firestore reads.
const promptCache = new Map<string, string>();

/**
 * Fetches a prompt from Firestore.
 * @param {string} promptName - The name of the prompt document.
 * @returns {Promise<string>} The content of the prompt.
 */
const getPrompt = async (promptName: string): Promise<string> => {
    if (promptCache.has(promptName)) {
        return promptCache.get(promptName)!;
    }
    try {
        const promptDocRef = db.collection('prompts').doc(promptName);
        const docSnap = await promptDocRef.get();
        if (docSnap.exists) {
            const content = docSnap.data()?.content;
            if (typeof content === 'string' && content.trim() !== '') {
                promptCache.set(promptName, content);
                return content;
            }
            throw new Error(`Prompt '${promptName}' content is empty or not a string.`);
        } else {
            throw new Error(`Prompt document '${promptName}' does not exist in Firestore.`);
        }
    } catch (error) {
        console.error(`CRITICAL: Error fetching prompt '${promptName}':`, error);
        throw new functions.https.HttpsError("internal", `Failed to load critical AI instruction ('${promptName}').`);
    }
};

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
        throw new functions.https.HttpsError("not-found", `AI returned an empty response for ${type}.`);
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
        throw new functions.https.HttpsError("internal", `AI returned invalid data that could not be processed (was not valid JSON). Please check the function logs for the raw response from the AI.`);
    }
};

export const callGemini = functions.https.onCall({ secrets: ["GEMINI_SECRET_KEY"], region: 'asia-northeast3', memory: '1GiB' }, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to use this service.");
    }

    const apiKey = process.env.GEMINI_SECRET_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_SECRET_KEY secret is not defined in the function's environment. This is a configuration error.");
        throw new functions.https.HttpsError("internal", "The AI service is not configured correctly on the server. Please contact the administrator.");
    }
    
    const { type, payload } = request.data;
    
    try {
        // Initialize the AI client here, as it's used by multiple cases.
        const ai = new GoogleGenAI({ apiKey });

        switch (type) {
            case 'processPdf': {
                // FIX: Lazy-load native modules ONLY when this specific function is called.
                // This prevents the Firebase deployment analyzer from failing.
                // FIX: Replace require with dynamic import() to resolve TypeScript type errors.
                const Canvas = await import("canvas");
                // FIX: Replace require with dynamic import() to resolve TypeScript type errors.
                const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");

                const { filePath } = payload;
                if (!filePath) {
                    throw new functions.https.HttpsError("invalid-argument", "A valid file path is required.");
                }

                const [fileBuffer] = await bucket.file(filePath).download();
                const typedarray = new Uint8Array(fileBuffer);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                const pageImages = [];

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const scale = 3.0;
                    const viewport = page.getViewport({ scale });
                    const canvas = Canvas.createCanvas(viewport.width, viewport.height);
                    const context = canvas.getContext('2d');
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport,
                        canvasFactory: {
                            create: (width: number, height: number) => {
                                const canvas = Canvas.createCanvas(width, height);
                                return {
                                    canvas,
                                    context: canvas.getContext('2d'),
                                    destroy: () => {},
                                };
                            },
                            reset: (obj: any, width: number, height: number) => {
                                obj.canvas.width = width;
                                obj.canvas.height = height;
                            },
                            destroy: (obj: any) => {
                                obj.canvas.width = 0;
                                obj.canvas.height = 0;
                                obj.canvas = null;
                                obj.context = null;
                            },
                        } as any, // Type assertion to satisfy pdfjs-dist
                    };

                    await page.render(renderContext).promise;
                    pageImages.push({
                        image: canvas.toDataURL('image/jpeg', 0.95),
                        pageNumber: i
                    });
                    page.cleanup();
                }
                if (pdf && pdf.destroy) {
                    await pdf.destroy();
                }

                return pageImages;
            }
            case 'detectMathProblemsFromImage': {
                const { base64Image } = payload;
                if (!base64Image) {
                    throw new functions.https.HttpsError("invalid-argument", "A valid base64 image string is required.");
                }
                
                const imageB64Data = base64Image.split(',')[1] || base64Image;

                const prompt = await getPrompt('detectProblemsVision');
                const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageB64Data } };
                const responseSchema = {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
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
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: [{ parts: [ { text: prompt }, imagePart ] }],
                    config: { safetySettings, responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.0, },
                });
                const parsedData = parseJsonResponse(response.text, type);

                // [보안 수정] AI가 반환한 bbox 좌표를 검증하고 보정합니다.
                // 이는 프론트엔드로 유효하지 않은 데이터가 전송되는 것을 방지하는 핵심 안전장치입니다.
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
            }

            case 'generateExplanationsBatch': {
                const { problemTexts, guidelines, explanationMode } = payload;
                if (!problemTexts || !Array.isArray(problemTexts) || problemTexts.length === 0) return [];

                const systemInstruction = await getPrompt('systemInstruction');
                const generationPromptTemplate = await getPrompt('generateStructuredExplanationsBatch');
                const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;
                
                const modelConfig: any = { systemInstruction: fullSystemInstruction, safetySettings, temperature: 0.0 };
                let model: string;

                switch(explanationMode as ExplanationMode) {
                    case 'fast':
                        model = 'gemini-2.5-flash';
                        modelConfig.thinkingConfig = { thinkingBudget: 0 };
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
                const generationPromptText = generationPromptTemplate.replace('{{problemCount}}', String(problemTexts.length)).replace('{{problemTexts}}', problemsString);
                
                const responseSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { explanation: { type: Type.STRING }, coreConcepts: { type: Type.ARRAY, items: { type: Type.STRING } }, difficulty: { type: Type.INTEGER } }, required: ["explanation", "coreConcepts", "difficulty"] } };

                const response = await ai.models.generateContent({
                    model, contents: [{ parts: [{ text: generationPromptText }] }],
                    config: { ...modelConfig, responseMimeType: "application/json", responseSchema },
                });
                
                return parseJsonResponse(response.text, type);
            }

            case 'askCaptainAboutLine': {
                 const { problemText, fullExplanation, selectedLine, userQuestion } = payload;
                 const systemInstruction =