

export interface Explanation {
    id: number;
    docId?: string; // Firestore document ID, will be set after first save
    markdown: string;
    isLoading?: boolean;
    isError?: boolean;
    pageNumber: number;
    problemNumber: number;
    problemImage: string; // base64 string before upload, Firebase Storage URL after
    originalProblemText: string; // The full concatenated text for compatibility
    problemBody: string; // The question part
    problemType?: '객관식' | '주관식';
    choices?: string;
    bbox: Bbox;

    explanationMode?: ExplanationMode;
    isManualSelection?: boolean;
    usedDajeongGuidelines?: boolean;


    // "Dynamic AI Tutor" features
    coreConcepts?: string[];
    difficulty?: number; // 1-5
    variationProblem?: {
        problem: string;
        explanation: string;
    } | null; // null indicates it's being generated, undefined means not started

    // "Haejeok Cache" feature
    isGolden?: boolean;
}


export type ExplanationMode = 'fast' | 'dajeong' | 'quality';

export interface UsageData {
    fast: number;
    dajeong: number;
    quality: number;
    hwpExports: number;
}

export interface MonthlyUsageData {
    
}

export interface CumulativeUsageData {
    fast: number;
    dajeong: number;
    quality: number;
    hwpExports: number;
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

// FIX: Define and export the ExtractedProblem interface for reuse.
export interface ExtractedProblem {
    problemNumber?: string;
    problemBody: string;
    problemType: '객관식' | '주관식';
    choices?: string;
    bbox: Bbox;
}

// FIX: Define and export AnalyzedProblem for type consistency across services.
export type AnalyzedProblem = ExtractedProblem & {
    pageNumber: number;
    pageImage: string;
};

// FIX: Define and export the UserSelection interface for reuse.
export interface UserSelection {
    id: string;
    pageNumber: number;
    bbox: Bbox;
}


// FIX: Define and export the Bbox interface for reuse.
export interface Bbox {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
}


export interface DockComment {
    id: string; // Firestore document ID
    userId: string;
    userDisplayName: string;
    content: string;
    createdAt: any; // Firestore Timestamp
}

export interface DockOpinion {
    id:string; // Firestore document ID
    userId: string;
    userDisplayName: string;
    content: string;
    createdAt: any; // Firestore Timestamp
    commentCount: number;
    comments?: DockComment[]; // Optional for UI state, fetched on demand
}