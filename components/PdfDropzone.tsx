
import React, { useCallback, useState } from 'react';

interface FileDropzoneProps {
    onFileProcess: (files: File[]) => void;
    dropzoneImageUrl: string;
    disabled: boolean;
    onDisabledClick: () => void;
}

export function FileDropzone({ onFileProcess, dropzoneImageUrl, disabled, onDisabledClick }: FileDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    
    const handleFileChange = useCallback((files: FileList | null) => {
        if (disabled) {
            onDisabledClick();
            return;
        }
        if (files && files.length > 0) {
            onFileProcess(Array.from(files));
        }
    }, [onFileProcess, disabled, onDisabledClick]);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) {
            onDisabledClick();
            return;
        }
        setIsDragging(true);
    }, [disabled, onDisabledClick]);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);
    
    const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
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

    const handleClick = (e: React.MouseEvent<HTMLLabelElement>) => {
        if (disabled) {
            e.preventDefault(); // Prevent file dialog from opening when disabled
            onDisabledClick();
        }
    };

    return (
        <div className="bg-surface p-6 rounded-xl border border-primary">
            <label
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleClick}
                className={`w-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-300 ${
                    isDragging ? 'border-accent bg-accent/10' : 'border-accent/50'
                } ${
                    disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'bg-background hover:border-accent cursor-pointer'
                } p-8`}
            >
                <input
                    type="file"
                    className="hidden"
                    multiple
                    onChange={onFileInputChange}
                    disabled={disabled}
                />
                {dropzoneImageUrl && (
                    <div 
                        className="w-24 h-24 mb-4 rounded-full bg-cover bg-center border-2 border-primary shadow-lg"
                        style={{ backgroundImage: `url(${dropzoneImageUrl})` }}
                    />
                )}
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
    );
}