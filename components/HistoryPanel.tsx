import React from 'react';
import { ExplanationSet } from '../types';
import { TrashIcon } from './icons/TrashIcon';
import { XIcon } from './icons/XIcon';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sets: ExplanationSet[];
    onLoadSet: (setId: string) => void;
    onDeleteSet: (setId: string) => void;
}

export function HistoryPanel({ isOpen, onClose, sets, onLoadSet, onDeleteSet }: HistoryPanelProps) {
    const formatDate = (timestamp: any) => {
        if (!timestamp?.toDate) return '날짜 정보 없음';
        return timestamp.toDate().toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <div 
                className={`fixed top-0 right-0 h-full w-full max-w-md bg-surface shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center p-4 border-b border-primary flex-shrink-0">
                        <h2 className="text-xl font-bold text-accent">내 해설 보관함</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-primary">
                            <XIcon />
                        </button>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 space-y-3">
                        {sets.length === 0 ? (
                            <div className="text-center text-text-secondary py-12">
                                <p>저장된 해설이 없습니다.</p>
                                <p className="text-sm mt-2">새로운 문제를 업로드하여 해설을 만들면 자동으로 이곳에 저장됩니다.</p>
                            </div>
                        ) : (
                            sets.map(set => (
                                <div key={set.id} className="bg-background p-4 rounded-lg border border-primary transition-colors hover:border-accent group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-semibold text-text-primary">{set.title}</h3>
                                            <p className="text-xs text-text-secondary mt-1">{formatDate(set.createdAt)}</p>
                                            <p className="text-sm text-text-secondary mt-1">{set.explanationCount || 0}개의 해설</p>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeleteSet(set.id); }}
                                            className="p-2 rounded-full text-text-secondary hover:bg-danger hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="해설 세트 삭제"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => onLoadSet(set.id)}
                                        className="w-full text-center mt-3 px-4 py-2 bg-primary text-text-primary text-sm font-semibold rounded-md hover:bg-accent hover:text-white transition-colors"
                                    >
                                        불러오기
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
