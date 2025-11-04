import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface FileDropzoneProps {
    onFileProcess: (files: File[]) => void;
    dropzoneImageUrl: string;
}

export function FileDropzone({ onFileProcess, dropzoneImageUrl }: FileDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    
    const handleFileChange = useCallback((files: FileList | null) => {
        if (files && files.length > 0) {
            onFileProcess(Array.from(files));
        }
    }, [onFileProcess]);

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
    }, [handleFileChange]);

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileChange(e.target.files);
        // Resetting the value allows the user to select the same file again.
        if (e.target) {
            e.target.value = '';
        }
    };

    return (
        <div className="bg-surface p-6 rounded-xl border border-primary">
            <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`w-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-300 ${
                    isDragging ? 'border-accent bg-accent/10' : 'border-accent/50'
                } bg-background hover:border-accent cursor-pointer`}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".pdf,image/*"
                    multiple
                    onChange={onFileInputChange}
                />
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center text-center p-8 w-full h-full cursor-pointer">
                    {dropzoneImageUrl && (
                        <div 
                            className="w-24 h-24 mb-4 rounded-full bg-cover bg-center border-2 border-primary shadow-lg"
                            style={{ backgroundImage: `url(${dropzoneImageUrl})` }}
                        />
                    )}
                    <UploadIcon />
                    <p className="mt-4 text-lg font-semibold text-accent animate-blink">
                        최고의 해설지가 필요한 문제를 넣어주세요
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                        PDF 또는 이미지 파일을 드래그하거나 클릭하여 업로드하세요.
                    </p>
                     <p className="mt-1 text-sm text-text-secondary">
                        또는 스크린샷을 찍어 바로 붙여넣기(Ctrl+V) 하세요.
                    </p>
                </label>
            </div>
        </div>
    );
}