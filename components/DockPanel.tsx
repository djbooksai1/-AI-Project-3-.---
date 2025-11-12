import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, writeBatch, increment, deleteDoc } from 'firebase/firestore';
import { DockOpinion, DockComment } from '../types';
import { User } from 'firebase/auth';
import { XIcon } from './icons/XIcon';
import { Loader } from './Loader';
import { TrashIcon } from './icons/TrashIcon';

interface DockPanelProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
}

const getUserDisplayName = (user: User | null): string => {
    if (user && user.phoneNumber && user.phoneNumber.length >= 4) {
        return `해적선 ${user.phoneNumber.slice(-4)}`;
    }
    return "익명의 선원";
};

const OpinionItem: React.FC<{ opinion: DockOpinion; user: User | null }> = ({ opinion, user }) => {
    const [isCommentsVisible, setIsCommentsVisible] = useState(false);
    const [comments, setComments] = useState<DockComment[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');

    const userDisplayName = getUserDisplayName(user);
    const isOwner = user?.uid === opinion.userId;

    useEffect(() => {
        if (!isCommentsVisible) return;

        setIsLoadingComments(true);
        const commentsRef = collection(db, 'dockOpinions', opinion.id, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DockComment));
            setComments(fetchedComments);
            setIsLoadingComments(false);
        }, (error) => {
            console.error("Error fetching comments:", error);
            setIsLoadingComments(false);
        });

        return () => unsubscribe();
    }, [isCommentsVisible, opinion.id]);

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user) return;

        const commentsRef = collection(db, 'dockOpinions', opinion.id, 'comments');
        const opinionRef = doc(db, 'dockOpinions', opinion.id);
        
        try {
            const batch = writeBatch(db);
            const newCommentRef = doc(commentsRef);
            batch.set(newCommentRef, {
                userId: user.uid,
                userDisplayName,
                content: newComment,
                createdAt: serverTimestamp(),
            });
            batch.update(opinionRef, { commentCount: increment(1) });
            await batch.commit();
            setNewComment('');
        } catch (error) {
            console.error("Error adding comment:", error);
        }
    };

    const handleDeleteOpinion = async () => {
        if (!window.confirm("이 의견을 정말로 삭제하시겠습니까? 모든 댓글도 함께 삭제됩니다.")) return;
    
        const opinionRef = doc(db, 'dockOpinions', opinion.id);
        const commentsRef = collection(db, 'dockOpinions', opinion.id, 'comments');
        
        try {
            const batch = writeBatch(db);
            
            const commentsSnapshot = await getDocs(commentsRef);
            commentsSnapshot.forEach(commentDoc => {
                batch.delete(commentDoc.ref);
            });
            
            batch.delete(opinionRef);
    
            await batch.commit();
        } catch (error) {
            console.error("Error deleting opinion and its comments:", error);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm("이 댓글을 정말로 삭제하시겠습니까?")) return;

        const opinionRef = doc(db, 'dockOpinions', opinion.id);
        const commentRef = doc(db, 'dockOpinions', opinion.id, 'comments', commentId);

        try {
            const batch = writeBatch(db);
            batch.delete(commentRef);
            batch.update(opinionRef, { commentCount: increment(-1) });
            await batch.commit();
        } catch (error) {
            console.error("Error deleting comment:", error);
        }
    };
    
    const formatDate = (timestamp: any) => {
        if (!timestamp?.toDate) return '방금 전';
        return timestamp.toDate().toLocaleString('ko-KR', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="bg-background p-4 rounded-lg border border-primary">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-accent text-sm">{opinion.userDisplayName}</p>
                    <p className="text-xs text-text-secondary mt-1">{formatDate(opinion.createdAt)}</p>
                </div>
                {isOwner && (
                    <button onClick={handleDeleteOpinion} className="p-1 text-danger hover:bg-danger/20 rounded-full"><TrashIcon /></button>
                )}
            </div>
            <p className="text-text-primary my-3 whitespace-pre-wrap break-words">{opinion.content}</p>
            <button onClick={() => setIsCommentsVisible(!isCommentsVisible)} className="text-xs font-semibold text-text-secondary hover:text-accent">
                {isCommentsVisible ? '댓글 숨기기' : `댓글 보기 (${opinion.commentCount || 0}개)`}
            </button>
            
            {isCommentsVisible && (
                <div className="mt-3 pt-3 border-t border-primary/50">
                    {isLoadingComments && <p className="text-xs text-text-secondary">댓글 로딩 중...</p>}
                    <div className="space-y-3 mb-3">
                        {comments.map(comment => (
                             <div key={comment.id} className="text-xs flex justify-between items-start gap-2 group">
                                <div className="flex-grow break-words">
                                    <span className="font-bold text-text-primary mr-2">{comment.userDisplayName}:</span>
                                    <span className="text-text-primary">{comment.content}</span>
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-2">
                                     <span className="text-text-secondary text-[10px] whitespace-nowrap">{formatDate(comment.createdAt)}</span>
                                     {user?.uid === comment.userId && (
                                         <button
                                             onClick={() => handleDeleteComment(comment.id)}
                                             className="p-1 text-danger hover:bg-danger/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                             title="댓글 삭제"
                                         >
                                             <TrashIcon />
                                         </button>
                                     )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleAddComment} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="댓글 추가..."
                            className="flex-grow bg-primary/30 text-xs p-2 rounded-md outline-none focus:ring-1 focus:ring-accent"
                        />
                        <button type="submit" className="px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50" disabled={!newComment.trim()}>
                            등록
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};


export const DockPanel: React.FC<DockPanelProps> = ({ isOpen, onClose, user }) => {
    const [opinions, setOpinions] = useState<DockOpinion[]>([]);
    const [newOpinion, setNewOpinion] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const userDisplayName = getUserDisplayName(user);

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        const opinionsRef = collection(db, 'dockOpinions');
        const q = query(opinionsRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedOpinions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DockOpinion));
            setOpinions(fetchedOpinions);
            setIsLoading(false);
        }, (err) => {
            setError("의견을 불러오는 데 실패했습니다.");
            setIsLoading(false);
            console.error(err);
        });

        return () => unsubscribe();
    }, [isOpen]);

    const handleAddOpinion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOpinion.trim() || !user) return;
        
        try {
            await addDoc(collection(db, 'dockOpinions'), {
                userId: user.uid,
                userDisplayName,
                content: newOpinion,
                createdAt: serverTimestamp(),
                commentCount: 0,
            });
            setNewOpinion('');
        } catch (err) {
            console.error("Error adding opinion:", err);
            setError("의견을 등록하는 데 실패했습니다.");
        }
    };
    
    const opinionLineCount = (newOpinion.match(/\n/g) || []).length + 1;
    const isOpinionInvalid = opinionLineCount > 5 || newOpinion.trim().length === 0;

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <div 
                className={`fixed top-0 left-0 h-full w-full max-w-md bg-surface shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center p-4 border-b border-primary flex-shrink-0">
                        <h2 className="text-xl font-bold text-accent">선착장</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-primary">
                            <XIcon />
                        </button>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-4 space-y-4">
                        {isLoading && <div className="flex justify-center py-10"><Loader status="선착장 소식 불러오는 중..." /></div>}
                        {error && <p className="text-center text-danger">{error}</p>}
                        {!isLoading && opinions.map(opinion => (
                            <OpinionItem key={opinion.id} opinion={opinion} user={user} />
                        ))}
                    </div>

                    <div className="p-4 border-t border-primary flex-shrink-0 bg-background/50">
                        <form onSubmit={handleAddOpinion} className="space-y-2">
                             <textarea
                                value={newOpinion}
                                onChange={(e) => setNewOpinion(e.target.value)}
                                placeholder={`${userDisplayName}님, 자유롭게 의견을 남겨주세요... (최대 5줄)`}
                                rows={3}
                                className={`w-full p-2 bg-background border rounded-md focus:ring-2 focus:ring-accent outline-none text-sm resize-none ${isOpinionInvalid && newOpinion ? 'border-danger' : 'border-primary'}`}
                            />
                            <div className="flex justify-between items-center">
                                <p className={`text-xs ${opinionLineCount > 5 ? 'text-danger' : 'text-text-secondary'}`}>
                                    {opinionLineCount} / 5 줄
                                </p>
                                <button type="submit" disabled={isOpinionInvalid} className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-md hover:bg-accent-hover disabled:opacity-50">
                                    남기기
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};