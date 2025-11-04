

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';


interface GuidelinesModalProps {
    isOpen: boolean;
    onClose: () => void;
    guidelines: string;
    setGuidelines: (guidelines: string) => void;
}

export function GuidelinesModal({ isOpen, onClose, guidelines, setGuidelines }: GuidelinesModalProps) {
    const [localGuidelines, setLocalGuidelines] = useState(guidelines);

    useEffect(() => {
        setLocalGuidelines(guidelines);
    }, [guidelines]);

    const handleSave = async () => {
        try {
            const guidelinesDocRef = doc(db, 'settings', 'guidelines');
            await setDoc(guidelinesDocRef, { content: localGuidelines });
            setGuidelines(localGuidelines);
            onClose();
        } catch (error) {
            console.error("Error saving guidelines to Firestore: ", error);
            alert("가이드라인 저장에 실패했습니다.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl transform transition-all border border-primary">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-accent">해설강령 관리</h2>
                        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
                    </div>
                    <div>
                        <textarea
                            value={localGuidelines}
                            onChange={(e) => setLocalGuidelines(e.target.value)}
                            rows={10}
                            className="w-full p-3 bg-background border border-primary rounded-md focus:ring-2 focus:ring-accent focus:border-accent outline-none text-text-primary"
                        />
                        <div className="mt-6 flex justify-end gap-4">
                            <button onClick={onClose} className="px-4 py-2 bg-primary/50 text-text-primary rounded-md hover:bg-primary">
                                취소
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 bg-accent text-white font-semibold rounded-md hover:bg-accent-hover">
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};