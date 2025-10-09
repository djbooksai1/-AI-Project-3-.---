import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MAX_CORRECTION_ATTEMPTS = 3; // 초기 생성 후 최대 3번의 자동 수정 시도

// Helper function to make API calls with retry logic for retriable errors
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
                errorMessage.includes('429') || // Rate limit
                errorMessage.includes('resource_exhausted') || // Rate limit
                errorMessage.includes('503') || // Model overloaded
                errorMessage.includes('unavailable'); // Model overloaded

            // Do not retry on quota errors, as they are not temporary.
            if (errorMessage.includes('quota')) {
                 throw error;
            }

            if (isRetriableError && attempt < maxRetries) {
                console.warn(`API call failed with retriable error. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                attempt++;
            } else {
                throw error; // For non-retriable errors or after all retries failed, rethrow the error
            }
        }
    }
    // This line should not be reachable, but is here for type safety
    throw new Error("API call failed after multiple retries.");
}

export const generateExplanation = async (
    pageImageBase64: string,
    guidelines: string,
    isRetry: boolean
): Promise<string> => {
    try {
        // FIX: Changed model to 'gemini-2.5-flash' as per the coding guidelines.
        const model = 'gemini-2.5-flash'; // 해설 품질을 위해 고성능 모델 사용
        let currentMarkdown = '';

        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: pageImageBase64.split(',')[1],
            },
        };

        // Step 1: Initial Generation
        const generationPromptText = `당신은 최고의 수학, 과학 문제 해설 전문가입니다. 다음 이미지에 있는 문제에 대해, 아래 "해설 강령"에 명시된 모든 규칙을 **단 하나의 예외도 없이 100% 완벽하게** 준수하여 상세하고 명확한 해설을 Markdown 형식으로 작성해주세요.

**[가장 중요한 규칙] LaTeX 렌더링 오류를 방지하기 위해, 모든 LaTeX 문법의 수식, 변수, 기호는 반드시 '$' 기호로 감싸야 합니다. 이 규칙은 절대적으로 지켜져야 합니다.**
- **올바른 예시:** 시그마의 합은 $\\sum_{k=1}^{5} a_k = 5$ 입니다.
- **잘못된 예시:** 시그마의 합은 \\sum_{k=1}^{5} a_k = 5 입니다. ($ 기호 누락)

당신이 생성한 해설은 별도의 검증 시스템을 통해 "해설 강령" 준수 여부를 평가받게 됩니다. 만약 강령을 지키지 않은 부분이 발견되면, 당신의 결과물은 폐기되고 재작업을 요청받게 됩니다. 최고의 결과물을 만들어주세요.

---
해설 강령:
${guidelines}
${isRetry ? "\n\n이전 해설에 오류가 있었으므로, 내용을 세 번 이상 신중하게 검토하여 더욱 정확하고 완벽한 해설을 작성해주세요." : ""}
---

문제에 대한 해설만 제공하고, 다른 부가적인 설명은 추가하지 마세요.`;

        const textPart = { text: generationPromptText };
        
        const initialResponse = await makeApiCallWithRetry(() => 
            ai.models.generateContent({
                model: model,
                contents: { parts: [imagePart, textPart] },
            })
        );
        currentMarkdown = initialResponse.text;
        
        // Loop for verification and correction
        for (let i = 0; i < MAX_CORRECTION_ATTEMPTS; i++) {
            // Step 2: Verification
            const verificationPrompt = `당신은 AI가 생성한 문제 해설을 평가하는 꼼꼼한 검수관입니다.
주어진 "해설 강령"과 AI가 생성한 "해설 내용"을 비교하여, "해설 내용"이 강령의 모든 규칙을 100% 완벽하게 준수했는지 확인해주세요.

**[가장 중요한 검증 규칙] 모든 LaTeX 문법의 수식, 변수, 기호가 '$' 기호로 감싸져 있는지 반드시 확인해야 합니다. '$' 기호가 누락된 LaTeX 코드가 있다면, 이는 중대한 오류로 간주하고 'isCompliant'를 false로 설정해야 합니다.**

**오류 예시:** 텍스트에 '... 계산하면 4^{1+\\sqrt{2}} \\times ...' 와 같이 '$' 기호 없이 수학식이 포함된 경우, 이것은 **명백한 오류**입니다. 올바른 형식은 '... 계산하면 $4^{1+\\sqrt{2}} \\times$ ...' 입니다. 텍스트 전체를 샅샅이 검토하여 단 하나의 예외도 찾아내야 합니다.

---
해설 강령:
${guidelines}
---

---
AI가 생성한 해설 내용:
${currentMarkdown}
---

검수 후, 아래 JSON 형식에 따라 답변해주세요.
- \`isCompliant\`: "해설 내용"이 "해설 강령"을 완벽하게 준수하면 true, 하나라도 어긋나는 부분이 있다면 false로 설정해주세요.
- \`issues\`: \`isCompliant\`가 false일 경우, 어떤 규칙을 어떻게 위반했는지 구체적인 목록을 작성해주세요. 준수했다면 빈 배열로 남겨주세요.
`;

            const verificationResponse = await makeApiCallWithRetry(() => 
                ai.models.generateContent({
                    model: model,
                    contents: verificationPrompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                isCompliant: { type: Type.BOOLEAN, description: "해설이 강령을 준수하는지 여부" },
                                issues: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "준수하지 않을 경우, 문제점 목록"
                                }
                            },
                            required: ["isCompliant", "issues"]
                        }
                    }
                })
            );

            let verificationResult;
            try {
                verificationResult = JSON.parse(verificationResponse.text);
            } catch (e) {
                 console.error("Failed to parse verification JSON:", verificationResponse.text);
                 // JSON 파싱 실패 시, 검증이 어렵다고 판단하여 현재까지의 결과물로 중단
                 break;
            }
            
            if (verificationResult.isCompliant) {
                // 강령을 완벽히 준수했다면, 루프를 종료하고 현재 해설을 반환
                return currentMarkdown;
            }

            // Step 3: Correction
            const correctionPrompt = `이전에 생성한 아래 "해설 내용"은 "해설 강령"을 준수하지 못했습니다.
"발견된 문제점"을 참고하여 "해설 강령"의 모든 규칙을 100% 완벽하게 준수하는 새로운 해설을 작성해주세요.
문제의 원본 이미지를 다시 참고하여 정확한 해설을 제공해야 합니다.

**[가장 중요한 수정 규칙] LaTeX 렌더링 오류를 방지하기 위해, 수정된 최종 해설에서는 모든 LaTeX 문법의 수식, 변수, 기호가 반드시 '$' 기호로 감싸져 있어야 합니다.**

**수정 예시:** 수정 전 해설에 '...계산하면 4^{1+\\sqrt{2}} \\times ...' 와 같이 '$'가 누락된 부분이 있었다면, 수정 후에는 반드시 '...계산하면 $4^{1+\\sqrt{2}} \\times$ ...' 와 같이 수정되어야 합니다. 단 하나의 예외도 허용되지 않습니다.
- 특히 "발견된 문제점"에 '$' 기호 누락이 언급되었다면, 이 부분을 반드시 수정해야 합니다.

---
해설 강령:
${guidelines}
---

---
수정 전 해설 내용:
${currentMarkdown}
---

---
발견된 문제점:
- ${verificationResult.issues.join('\n- ')}
---

오직 수정된 최종 해설만 Markdown 형식으로 응답해주세요. 다른 부가적인 설명은 절대 추가하지 마세요.`;

            const correctionTextPart = { text: correctionPrompt };
            const correctionResponse = await makeApiCallWithRetry(() => 
                ai.models.generateContent({
                    model: model,
                    contents: { parts: [imagePart, correctionTextPart] }
                })
            );

            currentMarkdown = correctionResponse.text;
        }

        // 최대 시도 후에도 완벽하지 않을 수 있지만, 마지막으로 생성된 결과물을 반환
        return currentMarkdown;

    } catch (error) {
        console.error("Error generating explanation from Gemini:", error);
        if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
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