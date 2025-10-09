export interface Explanation {
    id: number;
    questionImage: string;
    markdown: string;
    markedForRetry: boolean;
    isSatisfied: boolean;
}