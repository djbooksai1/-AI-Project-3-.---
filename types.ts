

export interface Explanation {
    id: number;
    docId?: string; // Firestore document ID, will be set after first save
    markdown: string;
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

export type UserTier = 'basic' | 'standard' | 'premium' | 'pro';

export interface QnaData {
    cardId: number;
    problemText: string;
    fullExplanation: string;
    selectedLine: string; // This is the plain text content for the AI
    selectedLineHtml: string; // This is the innerHTML to preserve LaTeX
}

export interface ExplanationSet {
    id: string;
    userId: string;
    title: string;
    createdAt: any; // Firestore Timestamp
    explanationCount: number;
}

// [+] 수동 업로드 파일 인터페이스
export interface ManualFile {
    name: string;
    url: string;
}

// [+] HWP 요청 관리용 인터페이스
export interface HwpExplanationData {
    problemImage: string; // Firebase Storage URL
    markdown: string;
    problemNumber: number;
}

export interface HwpRequest {
    id: string; // Firestore document ID
    userId: string;
    userEmail: string; // For display
    createdAt: any; // Firestore Timestamp
    status: 'pending' | 'completed';
    explanations: HwpExplanationData[];
}


// FIX: Define and export the Bbox interface for reuse.
export interface Bbox {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
}

// FIX: Define and export the ExtractedProblem interface to resolve import errors.
export interface ExtractedProblem {
    bbox: Bbox;
    type: string;
    lines: string[];
}

// FIX: Define and export the UserSelection interface to resolve import errors.
export interface UserSelection {
    id: string;
    pageNumber: number;
    bbox: Bbox;
}