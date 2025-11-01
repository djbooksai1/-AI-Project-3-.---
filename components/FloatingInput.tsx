
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface FloatingInputProps {
    onFileAdd: (file: File) => void;
}

export function FloatingInput({ onFileAdd }: FloatingInputProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = useCallback((file: File | null) => {
        if (file) {
            onFileAdd(file);
        }
    }, [onFileAdd]);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, [handleFile]);

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm z-20 border-t border-primary">
            <div className="container mx-auto p-3">
                <div
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    tabIndex={-1}
                    className={`flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-lg transition-colors duration-200 outline-none focus:ring-2 focus:ring-accent ${
                        isDragging ? 'border-accent bg-accent/10' : 'border-primary hover:border-accent'
                    }`}
                >
                    <UploadIcon />
                    <p className="ml-4 text-text-secondary">
                        해설을 추가할 이미지를 여기에 붙여넣거나(Ctrl+V) 드래그하세요.
                    </p>
                </div>
            </div>
        </div>
    );
};