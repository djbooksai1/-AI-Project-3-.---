import React, { useState, useEffect } from 'react';
import { SaveIcon } from './icons/SaveIcon';
import { XIcon } from './icons/XIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

export const TypingAnimator = () => {
    const allLines = [
        { text: "해. 적", className: "text-base lg:text-2xl font-bold mb-3" },
        { text: "주어진 수학문제를 정확히 인식하는,", className: "mt-2 text-[11px] lg:text-base" },
        { text: "교육과정 내에서 명확히 풀어주는,", className: "mt-1 text-[11px] lg:text-base" },
        { text: "다정북스 느낌의 자세한 해설을 제공하는,", className: "mt-1 text-[11px] lg:text-base" },
        { text: "\"최고의 서비스\"로 한 차원 앞서나아갈 시간입니다.", className: "mt-1 text-[11px] lg:text-base" },
        { text: "- 다정 Intelligence", className: "mt-4 text-[10px] lg:text-sm text-text-secondary" }
    ];

    const [displayedLines, setDisplayedLines] = useState<string[]>(['']);
    const [lineIndex, setLineIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const handleTyping = () => {
            const currentLineText = allLines[lineIndex].text;
            if (charIndex < currentLineText.length) {
                setDisplayedLines(prev => {
                    const newLines = [...prev];
                    newLines[lineIndex] = currentLineText.substring(0, charIndex + 1);
                    return newLines;
                });
                setCharIndex(prev => prev + 1);
            } else {
                if (lineIndex < allLines.length - 1) {
                    setLineIndex(prev => prev + 1);
                    setCharIndex(0);
                    setDisplayedLines(prev => [...prev, '']);
                } else {
                    // All lines typed, start deleting after a pause
                    setTimeout(() => setIsDeleting(true), 3000);
                }
            }
        };

        const handleDeleting = () => {
            if (charIndex > 0) {
                setDisplayedLines(prev => {
                    const newLines = [...prev];
                    newLines[lineIndex] = allLines[lineIndex].text.substring(0, charIndex - 1);
                    return newLines;
                });
                setCharIndex(prev => prev - 1);
            } else {
                if (lineIndex > 0) {
                     setDisplayedLines(prev => {
                        const newLines = [...prev];
                        newLines.pop();
                        return newLines;
                    });
                    setLineIndex(prev => prev - 1);
                    setCharIndex(allLines[lineIndex - 1].text.length);
                } else {
                    // All lines deleted, restart cycle
                    setIsDeleting(false);
                }
            }
        };

        // FIX: The return type of `setTimeout` in a browser environment is `number`, not `NodeJS.Timeout`.
        // Using `ReturnType<typeof setTimeout>` makes it environment-agnostic.
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isDeleting) {
            timeoutId = setTimeout(handleDeleting, 50); // Deleting speed
        } else if (lineIndex < allLines.length) {
            const isLineDone = allLines[lineIndex] && charIndex === allLines[lineIndex].text.length;
            const typingSpeed = isLineDone ? 1000 : 80; // Pause between lines vs typing speed
            timeoutId = setTimeout(handleTyping, typingSpeed);
        }

        return () => clearTimeout(timeoutId);

    }, [lineIndex, charIndex, isDeleting, allLines]);


    return (
        <div className="flex flex-col w-full opacity-70 hover:opacity-100 transition-opacity duration-300">
            <div className="bg-surface rounded-lg shadow-xl border border-primary pt-4 pr-8 pb-4 pl-8 h-full">
                {/* Mock Header */}
                <div className="flex items-center justify-between pb-3 border-b border-primary text-xs text-text-secondary">
                    <p className="font-semibold">해.적 : 해설을, 적다</p>
                    <div className="flex items-center gap-4 text-primary/60">
                        <div className="w-4 h-4"><SaveIcon /></div>
                        <div className="w-5 h-5"><XIcon /></div>
                        <div className="w-6 h-6"><ChevronDownIcon /></div>
                    </div>
                </div>

                {/* Typing Area */}
                <div className="pt-6 text-text-primary overflow-hidden" style={{ minHeight: '160px' }}>
                    {allLines.map((line, index) => {
                        if (index >= displayedLines.length) return null;
                        
                        const textToShow = displayedLines[index];
                        const showCursor = (lineIndex === index && charIndex <= line.text.length && lineIndex < allLines.length);

                        return (
                            <p key={index} className={line.className}>
                                {textToShow}
                                {showCursor && <span className="text-accent animate-blink">|</span>}
                            </p>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};