import { getFunctions, httpsCallable } from "firebase/functions";
import { ExplanationMode, Bbox } from '../types';

// FIX: 'asia-northeast3' 지역을 명시하여 CORS 오류를 해결합니다.
const functions = getFunctions(undefined, 'asia-northeast3');
// 'callGemini'는 Firebase Functions에 배포된 함수의 이름과 일치해야 합니다.
const callGemini = httpsCallable(functions, 'callGemini');

export interface StructuredExplanation {
    explanation: string;
    coreConcepts: string[];
    difficulty: number;
}

async function makeApiCall(type: string, payload: any): Promise<any> {
    try {
        const result = await callGemini({ type, payload });
        return result.data;
    } catch (error: any) {
        console.error(`Error calling Firebase Function (type: ${type}):`, error);
        // Firebase Functions에서 HttpsError로 보낸 메시지를 UI에 표시하기 위해 다시 throw합니다.
        const errorMessage = error.message || '백엔드 함수 호출 중 알 수 없는 오류가 발생했습니다.';
        // "해적 AI" 키워드를 포함시켜 오류를 올바르게 라우팅합니다.
        throw new Error(`해적 AI 서비스 오류: ${errorMessage}`);
    }
}

export const detectMathProblemsFromImage = async (
    base64Image: string
): Promise<{ problemBody: string; problemType: '객관식' | '주관식'; choices?: string; bbox: Bbox }[]> => {
    return makeApiCall('detectMathProblemsFromImage', { base64Image });
};

export const generateExplanationsBatch = async (
    problemTexts: string[],
    guidelines: string,
    explanationMode: ExplanationMode
): Promise<(StructuredExplanation | null)[]> => {
    return makeApiCall('generateExplanationsBatch', { problemTexts, guidelines, explanationMode });
};

export const askCaptainAboutLine = async (
    problemText: string,
    fullExplanation: string,
    selectedLine: string,
    userQuestion: string
): Promise<string> => {
     return makeApiCall('askCaptainAboutLine', { problemText, fullExplanation, selectedLine, userQuestion });
};

// FIX: Implement and export missing variation generation functions to resolve import errors.
export const generateVariationNumbersOnly = async (
    originalProblemText: string,
    guidelines: string
): Promise<{ problem: string; explanation: string }> => {
    return makeApiCall('generateVariationNumbersOnly', { originalProblemText, guidelines });
};
export const generateVariationIdeas = async (
    originalProblemText: string,
    guidelines: string
): Promise<string[]> => {
    return makeApiCall('generateVariationIdeas', { originalProblemText, guidelines });
};
export const generateVariationFromIdea = async (
    originalProblemText: string,
    idea: string,
    guidelines: string
): Promise<{ problem: string; explanation: string }> => {
    return makeApiCall('generateVariationFromIdea', { originalProblemText, idea, guidelines });
};


export const postProcessMarkdown = (markdown: string): string => {
    if (!markdown) return '';
    let processed = markdown.trim();
    processed = processed.replace(/^```(?:\w+\s*)?\n?([\s\S]*?)\n?```$/, '$1').trim();
    processed = processed.replace(/^(해설|풀이)전문가:\s*/, '');
    processed = processed.replace(/^markdown\s*/i, '');
    return processed.trim();
};

export const formatMathEquations = (markdown: string): string => {
    if (!markdown) return '';
    return markdown.replace(/\$\$([\s\S]+?)\$\$/g, (match, content) => {
        const hasMultipleEquals = (content.match(/=/g) || []).length > 1;
        const hasExistingEnvironment = /\\begin\{([a-zA-Z]*\*?)\}/.test(content);
        if (hasMultipleEquals && !hasExistingEnvironment) {
            return `\\[ \\begin{aligned} ${content.trim()} \\end{aligned} \\]`;
        }
        return match;
    });
};