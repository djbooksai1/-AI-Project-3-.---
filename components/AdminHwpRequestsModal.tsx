import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { HwpRequest } from '../types';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import ReactMarkdown from 'react-markdown';
import { CheckIcon } from './icons/CheckIcon';
import { TrashIcon } from './icons/TrashIcon';

interface AdminHwpRequestsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const RequestItem: React.FC<{ request: HwpRequest }> = ({ request }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isExpanded && contentRef.current && window.Prism) {
            // Use a short timeout to ensure ReactMarkdown has rendered the content to the DOM.
            const timer = setTimeout(() => {
                if (contentRef.current) {
                    window.Prism.highlightAllUnder(contentRef.current);
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isExpanded]);

    const handleToggleStatus = async () => {
        const newStatus = request.status === 'pending' ? 'completed' : 'pending';
        try {
            await updateDoc(doc(db, 'hwpRequests', request.id), { status: newStatus });
        } catch (error) {
            console.error("Error updating request status:", error);
            alert("상태 업데이트에 실패했습니다.");
        }
    };

    const handleDelete = async () => {
        if (window.confirm("정말로 이 요청을 삭제하시겠습니까?")) {
            try {
                await deleteDoc(doc(db, 'hwpRequests', request.id));
            } catch (error) {
                console.error("Error deleting request:", error);
                alert("요청 삭제에 실패했습니다.");
            }
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp?.toDate) return '날짜 정보 없음';
        return timestamp.toDate().toLocaleString('ko-KR', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="bg-background rounded-lg border border-primary">
            <div className="p-3 cursor-pointer hover:bg-primary/20" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-semibold text-text-primary">{request.userEmail}</p>
                        <p className="text-xs text-text-secondary">{formatDate(request.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${request.status === 'pending' ? 'bg-danger/30 text-danger' : 'bg-success/30 text-success'}`}>
                            {request.status === 'pending' ? '대기 중' : '완료'}
                        </span>
                        <span className="text-text-secondary transform transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="p-3 border-t border-primary/50" ref={contentRef}>
                    <div className="space-y-4">
                        {request.explanations.map((exp, index) => (
                            <div key={index} className="border-b border-primary/30 pb-3 last:border-b-0">
                                <p className="font-bold text-accent mb-2">문제 #{exp.problemNumber}</p>
                                <img src={exp.problemImage} alt={`문제 ${exp.problemNumber}`} className="w-full object-contain bg-surface rounded-md border border-primary mb-2" />
                                <div className="prose prose-sm max-w-none text-text-primary bg-surface p-2 rounded-md">
                                    <ReactMarkdown>{exp.markdown}</ReactMarkdown>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button onClick={handleToggleStatus} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-success/30 text-success rounded-md hover:bg-success/50 transition-colors">
                            <CheckIcon /> {request.status === 'pending' ? '완료로 변경' : '대기 중으로 변경'}
                        </button>
                        <button onClick={handleDelete} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-danger/30 text-danger rounded-md hover:bg-danger/50 transition-colors">
                           <TrashIcon /> 삭제
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const AdminHwpRequestsModal: React.FC<AdminHwpRequestsModalProps> = ({ isOpen, onClose }) => {
    const [requests, setRequests] = useState<HwpRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setIsLoading(true);
        setError(null);

        const q = query(collection(db, "hwpRequests"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedRequests: HwpRequest[] = [];
            querySnapshot.forEach((doc) => {
                fetchedRequests.push({ id: doc.id, ...doc.data() } as HwpRequest);
            });
            setRequests(fetchedRequests);
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching HWP requests:", err);
            setError("HWP 요청 목록을 불러오는 데 실패했습니다.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl border border-primary max-h-[90vh] flex flex-col">
                <div className="p-4 flex justify-between items-center border-b border-primary flex-shrink-0">
                    <h2 className="text-xl font-bold text-accent">HWP 요청 목록</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-primary"><XIcon /></button>
                </div>
                <div className="p-4 overflow-y-auto flex-grow">
                    {isLoading ? (
                        <div className="flex justify-center py-10"><Loader status="요청 목록을 불러오는 중..." /></div>
                    ) : error ? (
                        <p className="text-center text-danger">{error}</p>
                    ) : requests.length === 0 ? (
                        <p className="text-center text-text-secondary py-10">접수된 HWP 요청이 없습니다.</p>
                    ) : (
                        <div className="space-y-3">
                            {requests.map(req => <RequestItem key={req.id} request={req} />)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};