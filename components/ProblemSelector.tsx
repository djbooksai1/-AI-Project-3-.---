import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { ExtractedProblem, UserSelection } from '../types';
import { Loader } from './Loader';
import { TrashIcon } from './icons/TrashIcon';

interface ProblemSelectorProps {
    pages: { image: string; pageNumber: number }[];
    initialProblems: Map<number, ExtractedProblem[]>;
    onConfirm: (selections: UserSelection[]) => void;
    onCancel: () => void;
}

type Selection = ExtractedProblem & { id: string };

type ActiveAction = {
    type: 'draw' | 'move' | 'resize';
    id?: string;
    handle?: string;
    startPos: { x: number; y: number };
    originalBbox?: ExtractedProblem['bbox'];
}

export function ProblemSelector({ pages, initialProblems, onConfirm, onCancel }: ProblemSelectorProps) {
    const [selectionsByPage, setSelectionsByPage] = useState<Map<number, Selection[]>>(new Map());
    const [currentPageNum, setCurrentPageNum] = useState(1);
    const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
    const [drawCurrentPos, setDrawCurrentPos] = useState<{ x: number; y: number } | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [imageRenderRect, setImageRenderRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

    useEffect(() => {
        const newSelections = new Map<number, Selection[]>();
        initialProblems.forEach((problems, pageNum) => {
            const selectionsWithId = problems.map(p => ({
                ...p,
                id: `${pageNum}-${Math.random().toString(36).substr(2, 9)}`
            }));
            newSelections.set(pageNum, selectionsWithId);
        });
        setSelectionsByPage(newSelections);
    }, [initialProblems]);
    
    const calculateImageRenderRect = useCallback(() => {
        if (imgRef.current && containerRef.current) {
            const { clientWidth: containerWidth, clientHeight: containerHeight } = containerRef.current;
            const { naturalWidth, naturalHeight } = imgRef.current;
            if (naturalWidth === 0 || naturalHeight === 0) return;

            const imageAspectRatio = naturalWidth / naturalHeight;
            const containerAspectRatio = containerWidth / containerHeight;

            let renderedWidth = containerWidth;
            let renderedHeight = containerHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (imageAspectRatio > containerAspectRatio) {
                renderedHeight = containerWidth / imageAspectRatio;
                offsetY = (containerHeight - renderedHeight) / 2;
            } else {
                renderedWidth = containerHeight * imageAspectRatio;
                offsetX = (containerWidth - renderedWidth) / 2;
            }
            
            setImageRenderRect({ x: offsetX, y: offsetY, width: renderedWidth, height: renderedHeight });
        }
    }, []);

    useLayoutEffect(() => {
        const imgElement = imgRef.current;
        if (!imgElement) return;

        const handleCalculation = () => calculateImageRenderRect();

        if (imgElement.complete) handleCalculation();
        imgElement.addEventListener('load', handleCalculation);
        window.addEventListener('resize', handleCalculation);

        return () => {
            imgElement.removeEventListener('load', handleCalculation);
            window.removeEventListener('resize', handleCalculation);
        };
    }, [currentPageNum, calculateImageRenderRect]);


    const getNormalizedCoords = (e: React.MouseEvent): { x: number; y: number } | null => {
        if (!overlayRef.current) return null;
        
        const rect = overlayRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };

    const handleActionStart = (e: React.MouseEvent, type: 'move' | 'resize', id: string, handle?: string) => {
        e.stopPropagation();
        e.preventDefault();
        const pos = getNormalizedCoords(e);
        if (pos) {
            const originalBbox = selectionsByPage.get(currentPageNum)?.find(s => s.id === id)?.bbox;
            setActiveAction({ type, id, handle, startPos: pos, originalBbox });
        }
    };
    
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('.selection-box-overlay')) return;
        e.preventDefault();
        const pos = getNormalizedCoords(e);
        if (pos) {
            setActiveAction({ type: 'draw', startPos: pos });
            setDrawCurrentPos(pos);
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!activeAction) return;
        e.preventDefault();
        const currentPos = getNormalizedCoords(e);
        if (!currentPos) return;
    
        if (activeAction.type === 'draw') {
            setDrawCurrentPos(currentPos);
        } else if ((activeAction.type === 'move' || activeAction.type === 'resize') && activeAction.id && activeAction.originalBbox) {
            const dx = currentPos.x - activeAction.startPos.x;
            const dy = currentPos.y - activeAction.startPos.y;
    
            let newBbox: ExtractedProblem['bbox'];
    
            if (activeAction.type === 'move') {
                const width = activeAction.originalBbox.x_max - activeAction.originalBbox.x_min;
                const height = activeAction.originalBbox.y_max - activeAction.originalBbox.y_min;
                const x_min = Math.max(0, Math.min(1 - width, activeAction.originalBbox.x_min + dx));
                const y_min = Math.max(0, Math.min(1 - height, activeAction.originalBbox.y_min + dy));
                newBbox = { x_min, y_min, x_max: x_min + width, y_max: y_min + height };
            } else { // resize
                let { x_min, y_min, x_max, y_max } = activeAction.originalBbox;
                const handle = activeAction.handle;
    
                if (handle?.includes('left')) x_min = Math.max(0, Math.min(x_max, currentPos.x));
                if (handle?.includes('right')) x_max = Math.max(x_min, Math.min(1, currentPos.x));
                if (handle?.includes('top')) y_min = Math.max(0, Math.min(y_max, currentPos.y));
                if (handle?.includes('bottom')) y_max = Math.max(y_min, Math.min(1, currentPos.y));
                
                newBbox = { x_min, y_min, x_max, y_max };
            }
    
            setSelectionsByPage(prev => {
                const newMap = new Map<number, Selection[]>(prev);
                const currentPageSelections = newMap.get(currentPageNum) || [];
                const updatedSelections = currentPageSelections.map(sel =>
                    sel.id === activeAction.id ? { ...sel, bbox: newBbox } : sel
                );
                newMap.set(currentPageNum, updatedSelections);
                return newMap;
            });
        }
    };
    

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (activeAction?.type === 'draw' && activeAction.startPos && drawCurrentPos) {
            e.preventDefault();
            const { startPos } = activeAction;
            const x_min = Math.min(startPos.x, drawCurrentPos.x);
            const y_min = Math.min(startPos.y, drawCurrentPos.y);
            const x_max = Math.max(startPos.x, drawCurrentPos.x);
            const y_max = Math.max(startPos.y, drawCurrentPos.y);

            if (x_max - x_min > 0.01 && y_max - y_min > 0.01) {
                const newSelection: Selection = {
                    id: `${currentPageNum}-${Math.random().toString(36).substr(2, 9)}`,
                    bbox: { x_min, y_min, x_max, y_max },
                    type: '주관식', 
                    lines: []
                };
                setSelectionsByPage((prev: Map<number, Selection[]>) => {
                    const newMap = new Map<number, Selection[]>(prev);
                    const currentPageSelections = newMap.get(currentPageNum) || [];
                    newMap.set(currentPageNum, [...currentPageSelections, newSelection]);
                    return newMap;
                });
            }
        }
        setActiveAction(null);
        setDrawCurrentPos(null);
    };

    const handleDelete = (id: string) => {
        setSelectionsByPage((prev: Map<number, Selection[]>) => {
            const newMap = new Map<number, Selection[]>(prev);
            const currentPageSelections = newMap.get(currentPageNum) || [];
            newMap.set(currentPageNum, currentPageSelections.filter(sel => sel.id !== id));
            return newMap;
        });
    };
    
    const handleConfirmClick = () => {
        const allSelections: UserSelection[] = [];
        selectionsByPage.forEach((selections, pageNum) => {
            selections.forEach(sel => {
                allSelections.push({
                    id: sel.id,
                    pageNumber: pageNum,
                    bbox: sel.bbox
                });
            });
        });
        onConfirm(allSelections);
    };

    const currentSelections = selectionsByPage.get(currentPageNum) || [];
    const totalSelections = Array.from(selectionsByPage.values()).flat().length;

    const handles = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
    const resizeHandleCursors: { [key: string]: string } = {
        'top-left': 'nwse-resize', 'top': 'ns-resize', 'top-right': 'nesw-resize',
        'left': 'ew-resize', 'right': 'ew-resize',
        'bottom-left': 'nesw-resize', 'bottom': 'ns-resize', 'bottom-right': 'nwse-resize',
    };

    return (
        <div className="bg-surface rounded-lg shadow-xl border border-primary w-full max-w-5xl flex flex-col max-h-[85vh]">
            <style>{`
                .resize-handle { position: absolute; width: 10px; height: 10px; background: var(--color-accent); border: 1px solid white; border-radius: 50%; opacity: 0; transition: opacity 0.2s; }
                .group:hover .resize-handle { opacity: 1; }
                .resize-handle.top-left { top: -5px; left: -5px; cursor: nwse-resize; }
                .resize-handle.top { top: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
                .resize-handle.top-right { top: -5px; right: -5px; cursor: nesw-resize; }
                .resize-handle.left { top: 50%; left: -5px; transform: translateY(-50%); cursor: ew-resize; }
                .resize-handle.right { top: 50%; right: -5px; transform: translateY(-50%); cursor: ew-resize; }
                .resize-handle.bottom-left { bottom: -5px; left: -5px; cursor: nesw-resize; }
                .resize-handle.bottom { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
                .resize-handle.bottom-right { bottom: -5px; right: -5px; cursor: nwse-resize; }
            `}</style>
            <div className="p-4 border-b border-primary flex justify-between items-center flex-shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-accent">문제 영역 확인 및 수정</h2>
                    <p className="text-sm text-text-secondary">AI가 자동으로 찾은 문제 영역입니다. 영역을 클릭하여 삭제하거나, 드래그하여 새로 추가할 수 있습니다.</p>
                </div>
                <div className="flex items-center gap-4">
                     <button onClick={onCancel} className="px-4 py-2 bg-primary/50 text-text-primary rounded-md hover:bg-primary">
                        취소
                    </button>
                    <button onClick={handleConfirmClick} className="px-6 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover">
                        해설 생성 시작 ({totalSelections}개)
                    </button>
                </div>
            </div>

            <div className="flex-grow p-4 overflow-hidden flex flex-col md:flex-row gap-4">
                <div className="flex-grow w-full md:w-full relative overflow-hidden viewer-container">
                    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
                         <img
                            ref={imgRef}
                            src={pages.find(p => p.pageNumber === currentPageNum)?.image}
                            alt={`Page ${currentPageNum}`}
                            className="select-none max-w-full max-h-full object-contain"
                         />
                         <div
                            ref={overlayRef}
                            className="absolute"
                            style={{
                                left: `${imageRenderRect.x}px`,
                                top: `${imageRenderRect.y}px`,
                                width: `${imageRenderRect.width}px`,
                                height: `${imageRenderRect.height}px`,
                                cursor: activeAction?.type === 'draw' ? 'crosshair' : 'default',
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp} // End action if mouse leaves
                         >
                            {currentSelections.map(sel => (
                                <div
                                    key={sel.id}
                                    className="selection-box-overlay absolute group"
                                    style={{
                                        left: `${sel.bbox.x_min * 100}%`,
                                        top: `${sel.bbox.y_min * 100}%`,
                                        width: `${(sel.bbox.x_max - sel.bbox.x_min) * 100}%`,
                                        height: `${(sel.bbox.y_max - sel.bbox.y_min) * 100}%`,
                                        cursor: 'move',
                                    }}
                                    onMouseDown={(e) => handleActionStart(e, 'move', sel.id)}
                                >
                                    <div className="w-full h-full border-2 border-accent bg-accent/20 hover:bg-accent/40 transition-colors pointer-events-none" />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(sel.id); }}
                                        className="absolute -top-3 -right-3 bg-danger text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    >
                                       <TrashIcon />
                                    </button>
                                    {handles.map(handle => (
                                        <div
                                            key={handle}
                                            className={`resize-handle ${handle}`}
                                            style={{ cursor: resizeHandleCursors[handle] }}
                                            onMouseDown={(e) => handleActionStart(e, 'resize', sel.id, handle)}
                                        />
                                    ))}
                                </div>
                            ))}
                            {activeAction?.type === 'draw' && activeAction.startPos && drawCurrentPos && (
                                <div
                                    className="absolute border-2 border-dashed border-success bg-success/20 pointer-events-none"
                                    style={{
                                        left: `${Math.min(activeAction.startPos.x, drawCurrentPos.x) * 100}%`,
                                        top: `${Math.min(activeAction.startPos.y, drawCurrentPos.y) * 100}%`,
                                        width: `${Math.abs(drawCurrentPos.x - activeAction.startPos.x) * 100}%`,
                                        height: `${Math.abs(drawCurrentPos.y - activeAction.startPos.y) * 100}%`,
                                    }}
                                />
                            )}
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 flex items-center justify-center gap-4 p-4 border-t border-primary">
                <button
                    onClick={() => setCurrentPageNum(p => Math.max(1, p - 1))}
                    disabled={currentPageNum === 1}
                    className="px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-accent-hover disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors"
                >
                    이전 페이지
                </button>
                <span className="font-semibold text-text-primary">
                    페이지 {currentPageNum} / {pages.length}
                </span>
                <button
                    onClick={() => setCurrentPageNum(p => Math.min(pages.length, p + 1))}
                    disabled={currentPageNum === pages.length}
                    className="px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-accent-hover disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors"
                >
                    다음 페이지
                </button>
            </div>
        </div>
    );
}