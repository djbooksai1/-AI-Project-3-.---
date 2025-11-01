
import React from 'react';

// FIX: Removed import for non-existent 'PdfPage' type.
// The type for the 'pages' prop is defined inline since this component appears to be unused.
interface PdfViewerProps {
    pages: { image: string }[];
    currentPage: number;
    onPageChange: (newPage: number) => void;
}

export function PdfViewer({ pages, currentPage, onPageChange }: PdfViewerProps) {
    const totalPages = pages.length;

    const handlePrev = () => {
        onPageChange(Math.max(0, currentPage - 1));
    };

    const handleNext = () => {
        onPageChange(Math.min(totalPages - 1, currentPage + 1));
    };

    if (totalPages === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-surface rounded-lg border border-primary">
                <p className="text-text-secondary">PDF를 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-surface rounded-lg border border-primary p-4">
            <div className="flex-grow relative overflow-hidden flex items-center justify-center">
                <img 
                    src={pages[currentPage].image} 
                    alt={`PDF Page ${currentPage + 1}`}
                    className="max-w-full max-h-full object-contain"
                />
            </div>
            <div className="flex-shrink-0 flex items-center justify-center gap-4 mt-4">
                <button
                    onClick={handlePrev}
                    disabled={currentPage === 0}
                    className="px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-accent-hover disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                    이전
                </button>
                <span className="font-semibold text-text-primary">
                    페이지 {currentPage + 1} / {totalPages}
                </span>
                <button
                    onClick={handleNext}
                    disabled={currentPage === totalPages - 1}
                    className="px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-accent-hover disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                    다음
                </button>
            </div>
        </div>
    );
};