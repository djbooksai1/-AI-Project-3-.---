

import React, { useState, useEffect } from 'react';
import { ExplanationSet, UserTier, UsageData, ExplanationMode, MonthlyUsageData, CumulativeUsageData } from '../types';
import { TrashIcon } from './icons/TrashIcon';
import { XIcon } from './icons/XIcon';
import { User } from 'firebase/auth';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sets: ExplanationSet[];
    onLoadSet: (setId: string) => void;
    onDeleteSet: (setId: string) => void;
    user: User | null;
    userTier: UserTier;
    usageData: UsageData;
    tierLimits: UsageData;
    monthlyHwpUsage: MonthlyUsageData;
    monthlyHwpLimit: number;
    cumulativeUsage: CumulativeUsageData;
    isAdmin: boolean;
    onUiAssetUpload: (assetName: 'dropzoneImage', file: File) => Promise<void>;
}

const tierDisplayMap: { [key in UserTier]: { message: string; } } = {
    basic: { message: `해설은 <span class="font-bold text-accent">'연필'</span>로 적고 있습니다.` },
    standard: { message: `해설은 <span class="font-bold text-accent">'샤프'</span>로 적고 있습니다.` },
    premium: { message: `해설은 <span class="font-bold text-accent">'펜'</span>으로 적고 있습니다.` },
    pro: { message: `해설은 <span class="font-bold text-accent">'분필'</span>로 적고 있습니다.` },
};

const modes: { id: ExplanationMode, label: string }[] = [
    { id: 'fast', label: '빠른해설' },
    { id: 'dajeong', label: '표준해설' },
    { id: 'quality', label: '전문해설' },
];

export function HistoryPanel({ isOpen, onClose, sets, onLoadSet, onDeleteSet, user, userTier, usageData, tierLimits, monthlyHwpUsage, monthlyHwpLimit, cumulativeUsage, isAdmin, onUiAssetUpload }: HistoryPanelProps) {
    const tierMessage = (tierDisplayMap[userTier] || tierDisplayMap.basic).message;
    const [isUploading, setIsUploading] = useState(false);
    
    const savedSets = sets.filter(set => set.explanationCount > 0);

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
    
    const handleDropzoneImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsUploading(true);
            try {
                await onUiAssetUpload('dropzoneImage', file);
            } catch (error) {
                console.error("UI asset upload failed:", error);
            } finally {
                setIsUploading(false);
            }
        }
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
                        <h2 className="text-xl font-bold text-accent">마이페이지</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-primary">
                            <XIcon />
                        </button>
                    </div>

                    <div className="p-6 border-b border-primary text-center">
                        <p
                            className="text-lg text-text-primary"
                            dangerouslySetInnerHTML={{ __html: tierMessage }}
                        />
                        <a
                            href="https://www.latpeed.com/memberships/6905a5b797ed45f240419b6b"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-block px-6 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover transition-colors"
                        >
                            플랜 업그레이드하기
                        </a>
                    </div>
                    
                     <div className="p-6 border-b border-primary">
                        <h3 className="text-lg font-semibold text-text-primary mb-4">사용량</h3>
                        <div className="text-sm">
                            <div>
                                <h4 className="font-semibold text-text-secondary mb-2">오늘 해설 생성 횟수</h4>
                                {modes.map(mode => {
                                    const used = usageData[mode.id] || 0;
                                    const limit = tierLimits[mode.id];
                                    const percentage = limit === Infinity || limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
                                    const cumulative = cumulativeUsage[mode.id] || 0;

                                    return (
                                        <div key={mode.id} className="mb-3">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-semibold text-text-primary">{mode.label} (누적 {cumulative}회)</span>
                                                <span className="text-text-secondary">{used} / {limit === Infinity ? '∞' : limit}</span>
                                            </div>
                                            <div className="w-full bg-primary rounded-full h-2.5">
                                                <div className="bg-accent h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="border-t border-primary my-6"></div>
                             <div>
                                <h4 className="font-semibold text-text-secondary mb-2">이번 달 HWP 내보내기 (누적 {cumulativeUsage.hwpExports || 0}회)</h4>
                                 <div className="mb-3">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-semibold text-text-primary">사용 횟수</span>
                                        <span className="text-text-secondary">{monthlyHwpUsage.hwpExports} / {monthlyHwpLimit === Infinity ? '∞' : monthlyHwpLimit}</span>
                                    </div>
                                    <div className="w-full bg-primary rounded-full h-2.5">
                                        <div className="bg-accent h-2.5 rounded-full" style={{ width: `${monthlyHwpLimit === Infinity || monthlyHwpLimit === 0 ? 0 : Math.min(100, (monthlyHwpUsage.hwpExports / monthlyHwpLimit) * 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 flex flex-col">
                        {isAdmin && (
                             <>
                                <div className="mb-4">
                                    <h3 className="text-lg font-semibold text-text-primary mb-3">관리자 설정</h3>
                                    <div className="bg-background p-3 rounded-lg border border-primary">
                                        <label htmlFor="dropzone-image-upload" className="text-sm font-semibold text-text-primary">
                                            드롭존 이미지 변경
                                        </label>
                                        <p className="text-xs text-text-secondary mb-2">홈 화면의 파일 업로드 영역 상단에 표시될 이미지를 설정합니다.</p>
                                        <input
                                            id="dropzone-image-upload"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleDropzoneImageUpload}
                                            disabled={isUploading}
                                            className="text-xs text-text-secondary file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-white hover:file:bg-accent-hover"
                                        />
                                        {isUploading && <p className="text-xs text-accent mt-1 animate-pulse">업로드 중...</p>}
                                    </div>
                                </div>
                                <div className="border-t border-primary my-4"></div>
                            </>
                        )}
                        
                         <h3 className="text-lg font-semibold text-text-primary mb-3">지난해설(저장한 해설)</h3>
                        <div className="space-y-3">
                            {savedSets.length === 0 ? (
                                <div className="text-center text-text-secondary py-12">
                                    <p>저장된 해설이 없습니다.</p>
                                </div>
                            ) : (
                                savedSets.map(set => (
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
            </div>
        </>
    );
}