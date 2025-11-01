import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ExtractedProblem, ExplanationMode } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const systemInstruction = `당신은 두 명의 전문가로 구성된 AI 팀입니다.
1.  **'풀이전문가'**: 냉철하고 정확한 수학자 AI. 그의 유일한 임무는 주어진 문제에 대해 수학적 오류가 없는 가장 효율적이고 완벽한 풀이를 찾아내는 것입니다. 그는 어떠한 설명도 하지 않고 오직 최종 풀이 과정과 답만 계산합니다.
2.  **'해설전문가'**: 친절하고 체계적인 교육자 AI. 그의 유일한 임무는 '풀이전문가'로부터 전달받은 완벽한 풀이를 기반으로, 제공된 '[다정북스 해설자 행동 강령]'의 모든 규칙을 한 글자도 빠짐없이, 100% 기계적으로 적용하여 최종 해설을 작성하는 것입니다.
당신들 팀의 최종 목표는, 이 협업을 통해 수학적으로 완벽하고, 주어진 강령을 완벽하게 준수하는 최고의 해설을 단 한 번에 생성하는 것입니다.`;

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
 * [RE-IMPLEMENTED & ENHANCED] Extracts problem bounding boxes from a pre-processed page image using Gemini.
 * This is the new, high-accuracy server-side recognition step.
 * @param pageImageBase64 The base64 encoded, pre-processed (resized, B&W) image of a full page.
 * @returns A promise that resolves to an array of ExtractedProblem objects.
 */
export const extractProblemsFromPage = async (pageImageBase64: string): Promise<ExtractedProblem[]> => {
    try {
        const model = 'gemini-2.5-flash';

        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: pageImageBase64.split(',')[1],
            },
        };

        const systemInstruction = `당신은 대한민국 최고의 문제 인식 전문가입니다. 당신의 유일한 임무는 주어진 시험지 이미지에서 각각의 '문제' 영역을 정확하게 찾아내고, 그 위치를 정규화된 좌표(0.0 ~ 1.0)로 반환하는 것입니다.`;
        
        const prompt = `주어진 시험지 이미지에서 모든 수학 문제의 경계 상자(bounding box)를 찾아주세요.

**[매우 중요한 지시사항]**
- **정의:** '문제'란 문제 번호, 지문, 보기, 배점 등을 모두 포함하는 하나의 완전한 사각형 영역을 의미합니다.
- **정확성:** 각 문제의 영역을 단 하나의 픽셀도 벗어나거나 부족하지 않게 완벽하게 감싸는 가장 작은 사각형을 찾아야 합니다.
- **분리:** 두 문제가 붙어 있더라도, 각각을 별개의 문제 영역으로 명확히 구분해야 합니다.
- **제외:** 페이지 번호, 시험지 제목, 머리글/바닥글, 단을 나누는 세로줄 등 문제와 직접 관련 없는 요소는 결과에 포함시키지 마십시오.
- **출력 형식:** 결과는 반드시 주어진 JSON 스키마를 따라야 합니다. 다른 설명이나 주석은 절대 포함해서는 안 됩니다. 만약 이미지에서 어떤 문제도 찾을 수 없다면, 빈 배열 '[]'을 반환하십시오.`;

        const problemSchema = {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING, enum: ['객관식', '주관식'], description: "문제 유형. 현재는 '주관식'으로 고정합니다." },
                lines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "문제 텍스트 줄들. 현재는 빈 배열로 고정합니다." },
                bbox: {
                    type: Type.OBJECT,
                    description: "문제 영역의 정규화된 경계 상자 좌표.",
                    properties: {
                        x_min: { type: Type.NUMBER, description: "왼쪽 위 x 좌표 (0.0 ~ 1.0)" },
                        y_min: { type: Type.NUMBER, description: "왼쪽 위 y 좌표 (0.0 ~ 1.0)" },
                        x_max: { type: Type.NUMBER, description: "오른쪽 아래 x 좌표 (0.0 ~ 1.0)" },
                        y_max: { type: Type.NUMBER, description: "오른쪽 아래 y 좌표 (0.0 ~ 1.0)" },
                    },
                    required: ["x_min", "y_min", "x_max", "y_max"]
                }
            },
            required: ["type", "lines", "bbox"]
        };

        const responseSchema = {
            type: Type.ARRAY,
            items: problemSchema
        };

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: model,
                contents: [{ parts: [imagePart, { text: prompt }] }],
                config: {
                    systemInstruction,
                    safetySettings,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.0,
                },
            })
        );
        
        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("문제 영역 인식 중 AI가 빈 응답을 반환했습니다.");
        }
        
        const problems = JSON.parse(jsonText);
        // Add a simple validation
        if (!Array.isArray(problems)) {
            throw new Error("AI가 반환한 문제 영역 데이터가 올바른 배열 형식이 아닙니다.");
        }

        return problems as ExtractedProblem[];

    } catch (error) {
        console.error("Error extracting problems from page:", error);
        throw new Error("페이지에서 문제 영역을 추출하는 데 실패했습니다. AI 응답 형식을 확인해주세요.");
    }
};

/**
 * [NEW] Extracts text from a single, cropped problem image with high precision.
 * This is the "fine" step in the Coarse-to-Fine recognition process.
 * @param problemImageBase64 The base64 encoded image of a single cropped problem.
 * @returns A promise that resolves to the accurately transcribed text.
 */
export const extractTextFromProblemImage = async (problemImageBase64: string): Promise<string> => {
    try {
        const model = 'gemini-2.5-flash';
        
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: problemImageBase64.split(',')[1],
            },
        };

        const systemInstruction = `당신은 수학 공식과 텍스트를 매우 정밀하게 인식하는 OCR(광학 문자 인식) 엔진입니다. 당신의 유일한 임무는 주어진 이미지의 모든 텍스트를 한 글자도 틀리지 않고 정확하게 텍스트로 변환하는 것입니다.`;
        const prompt = `주어진 수학 문제 이미지의 모든 텍스트를 정확하게 판독하십시오.

**[매우 중요한 지시사항]**
- **최고 정밀도:** 지수($x^2$), 로그의 밑($\\log_2 x$), 시그마의 위아래 첨자($\\sum_{k=1}^{n}$), 분수($\\frac{a}{b}$)와 같이 작거나 복잡한 수식을 인식하는 데 모든 능력을 집중하십시오.
- **순수 텍스트 출력:** 다른 설명, 주석, 포맷팅 없이 오직 인식된 텍스트만 출력해야 합니다.
- **[예외 처리]** 만약 이미지에서 어떤 텍스트도 명확하게 인식할 수 없다면, 다른 어떤 설명도 없이 오직 "NO_TEXT_FOUND" 라는 단어만 응답으로 반환하십시오.`;

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model: model,
                contents: [{ parts: [imagePart, { text: prompt }] }],
                config: {
                    systemInstruction,
                    safetySettings: safetySettings,
                    temperature: 0.0,
                },
            }),
            3, 
            1000
        );

        const extractedText = response.text?.trim();
        
        if (!extractedText || extractedText === 'NO_TEXT_FOUND') {
            const finishReason = response.candidates?.[0]?.finishReason;
            const safetyRatings = response.candidates?.[0]?.safetyRatings;
            console.error('Precision reading returned empty or no-text response.', { finishReason, safetyRatings });

            let userMessage = "정밀 판독 중 AI가 빈 응답을 반환했습니다. 이는 문제 영역이 비어있거나, 모델의 안전 설정에 의해 차단되었을 수 있습니다.";
            if (extractedText === 'NO_TEXT_FOUND') {
                userMessage = "정밀 판독 결과, AI가 해당 영역에서 텍스트를 찾지 못했습니다. 원본 텍스트로 대체합니다.";
            } else if (finishReason && finishReason !== 'STOP') {
                userMessage += ` (종료 사유: ${finishReason})`;
            } else if (safetyRatings) {
                 const blockedRating = safetyRatings.find(r => r.blocked);
                 if (blockedRating) {
                    userMessage += ` (차단 사유: ${blockedRating.category})`;
                 }
            }
            throw new Error(userMessage);
        }
        
        return extractedText;

    } catch (error) {
        console.error("Error extracting text from problem image:", error);
        throw new Error("문제 이미지에서 텍스트를 정밀하게 추출하는 데 실패했습니다.");
    }
};


export const findMissingProblem = async (
    pageImageBase64: string,
    missingProblemNumber: number,
    previousProblemBbox: ExtractedProblem['bbox'],
    nextProblemBbox: ExtractedProblem['bbox']
): Promise<ExtractedProblem | null> => {
    // This function relied on the now-removed problem extraction schema and logic.
    // For now, it will return null. A client-side alternative could be implemented if needed.
    console.warn("`findMissingProblem` is not supported in the new client-side recognition flow.");
    return null;
};


export const generateExplanation = async (
    problemText: string,
    guidelines: string,
    explanationMode: ExplanationMode
): Promise<string> => {
    try {
        let model: string;

        const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;

        const config: {
            systemInstruction: string;
            safetySettings: typeof safetySettings;
            temperature: number;
            thinkingConfig?: { thinkingBudget: number };
        } = { 
            systemInstruction: fullSystemInstruction,
            safetySettings: safetySettings,
            temperature: 0.0,
        };

        switch(explanationMode) {
            case 'fast':
                model = 'gemini-2.5-flash';
                break;
            case 'quality':
                model = 'gemini-2.5-pro';
                config.thinkingConfig = { thinkingBudget: 32768 };
                break;
            case 'dajeong':
            default:
                model = 'gemini-2.5-pro';
                break;
        }

        const generationPromptText = `[팀 미션]
1.  **'풀이전문가'**: 먼저, 아래 [문제 텍스트]를 분석하여 가장 정확하고 논리적인 풀이법을 찾아내십시오.
2.  **'해설전문가'**: 그 다음, '풀이전문가'의 완벽한 풀이를 바탕으로, 제공된 행동 강령의 모든 규칙을 적용하여 최종 해설을 Markdown 형식으로 작성하십시오.

[문제 텍스트]
\`\`\`
${problemText}
\`\`\`

최종 답변 전체는 반드시 '해설전문가'가 작성한 결과물이어야 하며, 하나의 markdown 코드 블록으로 감싸서 제공해야 합니다.`;
        
        const textPart = { text: generationPromptText };
        
        const response = await makeApiCallWithRetry(() => 
            ai.models.generateContent({
                model: model,
                contents: [{ parts: [textPart] }],
                config: config,
            })
        );
        
        const text = response.text;

        if (!text || text.trim() === '') {
            const finishReason = response.candidates?.[0]?.finishReason;
            const safetyRatings = response.candidates?.[0]?.safetyRatings;
            console.error('Gemini returned an empty response.', { finishReason, safetyRatings });
            
            let userMessage = "AI가 빈 응답을 반환했습니다. 모델이 콘텐츠를 생성하지 못했거나 안전 설정에 의해 차단되었을 수 있습니다.";
            if (finishReason && finishReason !== 'STOP') {
                userMessage += ` (종료 사유: ${finishReason})`;
            } else if (safetyRatings) {
                 const blockedRating = safetyRatings.find(r => r.blocked);
                 if (blockedRating) {
                    userMessage += ` (차단 사유: ${blockedRating.category})`;
                 }
            }
            throw new Error(userMessage);
        }
        
        return text;

    } catch (error) {
        console.error("Error generating explanation from Gemini:", error);
        if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
             if (errorMessage.includes('ai가 빈 응답을 반환했습니다')) {
                throw new Error("AI가 빈 응답을 반환했습니다. 모델이 콘텐츠를 생성하지 못했거나 안전 설정에 의해 차단되었을 수 있습니다.");
            }
            if (errorMessage.includes('quota')) {
                 throw new Error("Gemini API 사용량 할당량(Quota)을 초과했습니다. Google AI Studio에서 사용량을 확인하고 요금제를 업그레이드하거나, 할당량이 초기화될 때까지 기다려주세요.");
            }
            if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted')) {
                throw new Error("API 요청 속도 제한(Rate Limit)을 초과했습니다. 잠시 후 다시 시도해주세요.");
            }
            if (errorMessage.includes('503') || errorMessage.includes('unavailable')) {
                throw new Error("AI 모델이 현재 과부하 상태입니다. 잠시 후 다시 시도해주세요.");
            }
        }
        throw new Error("AI 해설을 생성하는 데 실패했습니다. API 키 또는 네트워크 연결을 확인해주세요.");
    }
};

export const verifyAndCorrectExplanation = async (markdownExplanation: string): Promise<string> => {
    const systemInstruction = `당신은 LaTeX 구문 교정 전문가입니다. 당신의 유일한 임무는 주어진 Markdown 텍스트에서 깨진 LaTeX 수식을 찾아 유효한 구문으로 수정하는 것입니다. 수학적 내용, 논리, 문장 구조는 절대로 변경해서는 안 됩니다.`;
    const prompt = `
다음 [해설 텍스트]에 포함된 LaTeX 수식의 구문 오류를 검사하고 수정하십시오.

[수정 규칙]
1.  **내용 불변:** 수학적 의미, 숫자, 변수, 논리적 흐름, 한국어 문장은 절대로 변경하지 마십시오.
2.  **구분 기호($) 확인:** 모든 인라인 수식은 한 쌍의 '$'로, 블록 수식은 두 쌍의 '$$'로 감싸여 있는지 확인하고 누락된 경우 추가하십시오.
3.  **명령어 및 괄호:** '\\frac', '\\sqrt' 등 명령어의 철자가 맞는지, '{'와 '}' 괄호의 쌍이 맞는지 확인하고 수정하십시오.
4.  **기타 구문 오류:** 그 외 모든 LaTeX 표준 구문 오류를 수정하십시오.

[해설 텍스트]
\`\`\`markdown
${markdownExplanation}
\`\`\`

오직 수정된 최종 텍스트만 출력하십시오. 다른 설명은 필요 없습니다.
`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction,
                safetySettings,
                temperature: 0.0
            },
        });
        const correctedText = response.text?.trim();
        if (!correctedText) {
            const finishReason = response?.candidates?.[0]?.finishReason;
            const safetyRatings = response?.candidates?.[0]?.safetyRatings;
            console.warn("Explanation verification/correction failed to return text.", { finishReason, safetyRatings });
            return markdownExplanation;
        }
        return correctedText;
    } catch (error) {
        console.error("Error during explanation verification/correction. Returning original text.", error);
        return markdownExplanation;
    }
};

export const extractCoreIdeas = async (problemText: string): Promise<string[]> => {
    const systemInstruction = `당신은 대한민국 고등학생 수준의 수학 문제에서 핵심 아이디어를 추출하는 AI 분석가입니다. 당신의 임무는 주어진 문제의 본질을 꿰뚫어 보고, 문제 해결에 사용되는 가장 중요한 수학적 개념이나 전략을 최대 3개까지 간결한 문장으로 요약하는 것입니다.`;
    const prompt = `
다음 수학 문제 텍스트를 분석하여, 이 문제를 해결하는 데 필요한 핵심 아이디어를 3개 이하로 추출하십시오.

[분석 가이드라인]
1.  **본질 파악:** 단순한 계산 절차보다는 문제의 근본적인 수학적 원리에 집중하십시오. (예: '미분하여 극값을 찾는다' (X) -> '함수의 그래프 개형과 극값의 관계를 이용' (O))
2.  **개념 명시:** 사용되는 주요 정리나 개념의 이름을 명확히 언급하십시오. (예: '사이값 정리', '삼각함수의 덧셈정리', '조건부 확률의 정의')
3.  **간결성:** 각 아이디어는 학생들이 이해하기 쉬운 하나의 완전한 문장으로 요약하십시오.
4.  **개수 제한:** 가장 중요하다고 생각하는 아이디어를 최대 3개까지만 제시하십시오. 3개를 넘지 않도록 하십시오.

[문제 텍스트]
\`\`\`
${problemText}
\`\`\`

결과는 반드시 주어진 JSON 스키마에 따라 아이디어 목록으로 출력해야 합니다.
`;
    const coreIdeasSchema = {
        type: Type.OBJECT,
        properties: {
            ideas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "A list of up to 3 core mathematical ideas found in the problem."
            }
        },
        required: ['ideas']
    };

    try {
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
        if (!jsonText) {
            throw new Error("핵심 아이디어 추출 중 AI가 빈 응답을 반환했습니다.");
        }
        const result = JSON.parse(jsonText);
        return result.ideas || [];
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
    const fullSystemInstruction = `${systemInstruction}\n\n[다정북스 해설자 행동 강령]\n${guidelines}`;

    let levelDescription = '';
    switch (variationLevel) {
        case 'numeric':
            levelDescription = "기반 문제의 수학적 구조와 풀이 방법은 완전히 동일하게 유지하되, 사용되는 숫자, 계수, 또는 상수 값만 변경하여 새로운 문제를 생성합니다. 문제의 난이도는 거의 변하지 않아야 합니다.";
            break;
        case 'form':
            levelDescription = `기반 문제의 핵심 아이디어인 "${selectedCoreIdea}"는 반드시 유지해야 합니다. 하지만 이 아이디어를 표현하는 방식(함수의 형태, 기하학적 설정, 문제 상황 등)을 창의적으로 변경하여 새로운 형태의 문제를 생성합니다. 원본 문제와 풀이의 큰 틀은 비슷하지만, 다른 맥락에 적용하는 능력을 평가해야 합니다.`;
            break;
        case 'creative':
            levelDescription = `기반 문제의 핵심 아이디어인 "${selectedCoreIdea}"에서 영감을 얻되, 여기에 다른 수학적 개념을 융합하여 완전히 새로운 유형의 창작 문제를 생성합니다. 기반 문제와는 다른 풀이 전략이 필요할 수 있으며, 더 높은 수준의 사고력을 요구해야 합니다.`;
            break;
    }

    const prompt = `
당신은 대한민국 고등학생을 위한 최고의 수학 문제 제작 전문가입니다. 주어진 모든 지시사항을 반드시 따라야 합니다.

**1. 기반 문제:**
\`\`\`
${baseProblemText}
\`\`\`

**2. 변형 레벨 및 지시사항:**
- 변형 레벨: ${variationLevel}
- 상세 지시사항: ${levelDescription}
${selectedCoreIdea ? `\n- **핵심 아이디어:** 생성될 문제는 반드시 "${selectedCoreIdea}" 개념을 중심으로 구성되어야 합니다.` : ''}

**3. 해설 생성:**
- 생성된 변형 문제에 대한 해설도 함께 작성해야 합니다.
- 해설은 제공된 '[다정북스 해설자 행동 강령]'의 모든 규칙을 100% 완벽하게 준수하여 작성해야 합니다.

**4. 최종 출력 형식:**
- 다른 설명 없이, 아래와 같은 JSON 형식으로만 출력해야 합니다.
- 모든 수학 수식은 LaTeX를 사용해야 합니다.
`;
    const variationSchema = {
        type: Type.OBJECT,
        properties: {
            problem: {
                type: Type.STRING,
                description: "생성된 변형 문제의 전체 텍스트 (Markdown 형식)."
            },
            explanation: {
                type: Type.STRING,
                description: "생성된 변형 문제에 대한, 해설 강령을 완벽하게 준수한 상세 해설 (Markdown 형식)."
            }
        },
        required: ["problem", "explanation"]
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: fullSystemInstruction,
                safetySettings,
                responseMimeType: "application/json",
                responseSchema: variationSchema,
                temperature: 0.0 
            },
        });

        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("변형 문제 생성 중 AI가 빈 응답을 반환했습니다.");
        }
        const result = JSON.parse(jsonText);
        
        const correctedExplanation = await verifyAndCorrectExplanation(result.explanation);

        return {
            problem: result.problem,
            explanation: correctedExplanation
        };

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
        const model = 'gemini-2.5-flash';
        
        const systemInstruction = `당신은 '선장'이라는 이름의 친절하고 현명한 AI 수학 튜터입니다. 당신의 역할은 학생이 수학 문제 풀이의 특정 부분에 대해 가질 수 있는 질문에 명확하고 간결하게 답변하는 것입니다. 학생의 질문에만 집중하고, 전체 문제를 다시 설명하지 마십시오.`;

        const prompt = `학생이 아래 수학 문제와 전체 해설을 보고 특정 부분에 대해 질문했습니다.

[전체 문제]
---
${problemText}
---

[전체 해설]
---
${fullExplanation}
---

학생이 이해하지 못하는 부분은 다음 문장입니다.
[헷갈리는 문장]
---
${selectedLine}
---

학생의 질문은 다음과 같습니다.
[학생의 질문]
---
${userQuestion}
---

당신의 임무는 학생의 질문에 직접적으로, 그리고 간결하게 답변하는 것입니다. 헷갈리는 문장이 왜 맞는지, 혹은 무엇을 의미하는지 주어진 맥락 안에서 설명해주세요. 당신의 답변은 학생의 혼란을 해소하는 데에만 초점을 맞춰야 합니다.`;

        const response = await makeApiCallWithRetry(() =>
            ai.models.generateContent({
                model,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    systemInstruction,
                    safetySettings,
                    temperature: 0.2,
                },
            })
        );

        const answer = response.text;
        if (!answer || answer.trim() === '') {
            throw new Error("AI 선장이 답변을 생성하지 못했습니다.");
        }
        return answer;

    } catch (error) {
        console.error("Error asking captain:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("선장에게 질문하는 중 오류가 발생했습니다.");
    }
};