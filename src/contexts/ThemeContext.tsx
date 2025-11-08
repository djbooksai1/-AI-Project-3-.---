import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { themes as availableThemes, Theme } from '../config/themes';
import { textFonts as availableTextFonts, Font } from '../config/fonts';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';


interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    themes: Theme[];
    explanationFontSize: number;
    setExplanationFontSize: (size: number) => void;
    explanationMathSize: number;
    setExplanationMathSize: (size: number) => void;
    explanationPadding: number;
    setExplanationPadding: (padding: number) => void;
    explanationTextFont: Font;
    setExplanationTextFont: (font: Font) => void;
    textFonts: Font[];
    saveThemeSettingsToFirestore: () => Promise<void>; // Added for explicit saving
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: React.PropsWithChildren) {
    const [theme, setThemeState] = useState<Theme>(availableThemes[5]); // Default to "Paper"
    
    // State for explanation-specific typography and styling
    const [explanationFontSize, setExplanationFontSizeState] = useState<number>(14.5);
    const [explanationMathSize, setExplanationMathSizeState] = useState<number>(105);
    const [explanationPadding, setExplanationPaddingState] = useState<number>(24);
    const [explanationTextFont, setExplanationTextFontState] = useState<Font>(availableTextFonts[1]); // Default to Batang
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Fetch settings from Firestore on user auth state change
    useEffect(() => {
