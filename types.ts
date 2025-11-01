




export interface ExtractedProblem {
    id?: string; // Optional unique ID for UI management
    type: '객관식' | '주관식';
    lines: string[];
    choices?: string;
    bbox: {
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
    };
}

export interface Explanation {
    id: number;
    docId?: string; // Firestore document ID, will be set after first save
    markdown: string;
    isSatisfied: boolean;
    isLoading?: boolean;
    isError?: boolean;
    pageNumber: number;
    problemNumber: number;
    problemImage: string; // base64 string before upload, Firebase Storage URL after
    originalProblemText: string;
}

export type ExplanationMode = 'fast' | 'dajeong' | 'quality';

export interface UsageData {
    fast: number;
    dajeong: number;
    quality: number;
}

export type UserTier = 'free' | 'standard' | 'premium' | 'royal';

export interface UserSelection {
    id: string;
    pageNumber: number;
    bbox: ExtractedProblem['bbox'];
    initialText?: string; // Optional text from the initial coarse scan (for mobile)
}

export interface QnaData {
    cardId: number;
    problemText: string;
    fullExplanation: string;
    selectedLine: string; // This is the plain text content for the AI
    selectedLineHtml: string; // This is the innerHTML to preserve LaTeX
    sourceHeight: number; // The height of the source explanation card body
}

export interface ExplanationSet {
    id: string;
    userId: string;
    title: string;
    createdAt: any; // Firestore Timestamp
    explanationCount: number;
}