import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface PdfDropzoneProps {
    onFileProcess: (file: File) => void;
}

export const PdfDropzone: React.FC<PdfDropzoneProps> = ({ onFileProcess }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                onFileProcess(file);
            } else {
                alert('PDF 파일만 업로드할 수 있습니다.');
            }
        }
    };

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
        handleFileChange(e.dataTransfer.files);
    }, [onFileProcess]);

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`w-full h-80 flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-300 ${
                isDragging ? 'border-accent bg-accent/10' : 'border-accent/50 bg-surface hover:border-accent'
            }`}
        >
            <input
                type="file"
                id="pdf-upload"
                className="hidden"
                accept=".pdf"
                onChange={(e) => handleFileChange(e.target.files)}
            />
            <label htmlFor="pdf-upload" className="flex flex-col items-center justify-center text-center cursor-pointer p-4 w-full h-full">
                <UploadIcon />
                <p className="mt-4 text-lg font-semibold text-accent animate-blink">
                    최고의 해설지가 필요한 문제를 넣어주세요
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                    최대 100MB 크기의 PDF 파일을 지원합니다.
                </p>
            </label>
        </div>
    );
};