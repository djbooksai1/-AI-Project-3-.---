
import React from 'react';
import { useTheme } from '../hooks/useTheme';

// 헥스 코드를 기반으로 색상이 밝은지 어두운지 판단하는 함수입니다.
// 휘도를 계산하여 밝은 색이면 true를 반환합니다.
const isColorLight = (hexColor: string): boolean => {
    if (!hexColor) return false;

    const color = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
    if (color.length !== 6) return false;

    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    
    // WCAG 휘도 공식을 사용합니다.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5;
};

const LOGO_URL = "https://793d73a28bf90b83bce0aff088b4b84b.cdn.bubble.io/f1741657290407x311400631094205250/Group%2012726288352.svg";

export const FloatingLogo: React.FC = () => {
    const { theme } = useTheme();
    const backgroundColor = theme.colors['background'];
    
    const shouldInvert = isColorLight(backgroundColor);

    const logoStyle: React.CSSProperties = {
        filter: shouldInvert ? 'invert(1)' : 'none',
        transition: 'filter 0.3s ease-in-out',
        width: '150px',
        height: 'auto',
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <img 
                src={LOGO_URL} 
                alt="Dajeong Intelligence Logo" 
                style={logoStyle}
            />
        </div>
    );
};
