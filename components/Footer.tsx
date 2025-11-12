import React, { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';

interface FooterProps {
    onOpenTerms: () => void;
    onOpenPrivacy: () => void;
}

const darkenColor = (hex: string, amount: number): string => {
    if (!hex || !hex.startsWith('#')) return hex;
    try {
        let [r, g, b] = hex.slice(1).match(/.{2}/g)!.map(c => parseInt(c, 16));
        r = Math.max(0, r - amount);
        g = Math.max(0, g - amount);
        b = Math.max(0, b - amount);
        const toHex = (c: number) => c.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch (e) {
        console.error("Failed to darken color:", e);
        return hex;
    }
};

// [+] 로고의 테마 색상 적응을 위한 헬퍼 함수
const isColorLight = (hexColor: string): boolean => {
    if (!hexColor) return false;

    const color = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
    if (color.length !== 6) return false;

    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5;
};

export const Footer: React.FC<FooterProps> = ({ onOpenTerms, onOpenPrivacy }) => {
    const { theme } = useTheme();
    const [footerBgColor, setFooterBgColor] = useState(theme.colors.background);

    useEffect(() => {
        const darkerBg = darkenColor(theme.colors.background, 10);
        setFooterBgColor(darkerBg);
    }, [theme.colors.background]);

    // [+] 테마에 따라 로고 색상을 반전시키는 로직
    // FIX: 로고가 밝은 배경에서는 어둡게, 어두운 배경에서는 밝게 표시되도록 반전 논리를 수정합니다.
    const shouldInvert = !isColorLight(theme.colors.background);
    const logoStyle: React.CSSProperties = {
        filter: shouldInvert ? 'invert(1)' : 'none',
        transition: 'filter 0.3s ease-in-out',
    };

    return (
        <footer 
            className="py-6 border-t border-primary"
            style={{ backgroundColor: footerBgColor, transition: 'background-color 0.3s ease' }}
        >
            <div className="w-full max-w-4xl mx-auto px-4 flex justify-between items-center">
                {/* Text content on the left */}
                <div className="text-left">
                    <div className="flex items-center gap-4 mb-2">
                        <button onClick={onOpenTerms} className="text-xs text-text-secondary hover:text-text-primary underline">
                            이용약관
                        </button>
                        <span className="text-text-secondary">|</span>
                        <button onClick={onOpenPrivacy} className="text-xs text-text-secondary hover:text-text-primary underline">
                            개인정보처리방침
                        </button>
                    </div>
                    <p className="text-xs text-text-secondary">
                        Copyright © 2025 Dajeong Intelligence. All Rights Reserved.
                    </p>
                </div>
                
                {/* Logo on the right */}
                <div>
                    <img 
                        src="https://793d73a28bf90b83bce0aff088b4b84b.cdn.bubble.io/f1741657290407x311400631094205250/Group%2012726288352.svg" 
                        alt="Dajeong Intelligence Logo" 
                        className="w-32 h-auto"
                        style={logoStyle}
                    />
                </div>
            </div>
        </footer>
    );
};