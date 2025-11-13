import { getFunctions, httpsCallable } from "firebase/functions";
import { ExplanationMode, Bbox, ExtractedProblem } from '../types';

// FIX: 'asia-northeast3' 지역을 명시하여 CORS 오류를 해결합니다.
const functions = getFunctions(undefined, 'asia-northeast3');

// 'callGemini'는 Firebase Functions에 배포된 함수의 이름과 일치해야 합니다.
// FIX: 클라이언트 측 타임아웃을 5분(300,000ms)으로 설정합니다.
// Gemini Vision API와 같이 오래 실행되는 작업을 처리할 때 기본 타임아웃(70초)으로 인해 발생하는
// 'deadline-exceeded' 오류를 방지하기 위함입니다.
const callGemini = httpsCallable(functions, 'callGemini', { timeout: 300000 });

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
): Promise<ExtractedProblem[]> => {
    return makeApiCall('detectMathProblemsFromImage', { base64Image });
};

export const reparseAndFixLatex = async (
    problemText: string
): Promise<ExtractedProblem> => {
    return makeApiCall('reparseAndFixLatex', { problemText });
};

export const generateExplanationsBatch = async (
    problemTexts: string[],
    explanationMode: ExplanationMode,
    useDajeongGuidelines: boolean
): Promise<(StructuredExplanation | null)[]> => {
    return makeApiCall('generateExplanationsBatch', { problemTexts, explanationMode, useDajeongGuidelines });
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
    originalProblemText: string
): Promise<{ problem: string; explanation: string }> => {
    return makeApiCall('generateVariationNumbersOnly', { originalProblemText });
};
export const generateVariationIdeas = async (
    originalProblemText: string
): Promise<string[]> => {
    return makeApiCall('generateVariationIdeas', { originalProblemText });
};
export const generateVariationFromIdea = async (
    originalProblemText: string,
    idea: string
): Promise<{ problem: string; explanation: string }> => {
    return makeApiCall('generateVariationFromIdea', { originalProblemText, idea });
};


export const postProcessMarkdown = (markdown: string): string => {
    if (!markdown) return '';
    let processed = markdown.trim();
    processed = processed.replace(/^```(?:\w+\s*)?\n?([\s\S]*?)\n?```$/, '$1').trim();
    processed = processed.replace(/^(해설|풀이)전문가:\s*/, '');
    processed = processed.replace(/^markdown\s*/i, '');
    
    processed = processed.replace(/\\left\{/g, '\\left\\{').replace(/\\right\}/g, '\\right\\}');

    // FIX: Wrap Korean text within math environments ($...$ or $$...$$) with \text{...}
    // to prevent font rendering issues and ensure proper typesetting.
    processed = processed.replace(/(\$\$?)([\s\S]+?)\1/g, (match, delimiter, content) => {
        // This regex finds one or more consecutive Hangul Syllable characters.
        const koreanRegex = /[\uac00-\ud7a3]+/g;
        const newContent = content.replace(koreanRegex, (koreanText) => `\\text{${koreanText}}`);
        return `${delimiter}${newContent}${delimiter}`;
    });

    return processed.trim();
};