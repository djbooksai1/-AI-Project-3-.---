import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { themes as availableThemes, Theme } from '../config/themes';
import { textFonts as availableTextFonts, Font } from '../config/fonts';
import { layouts as availableLayouts, Layout } from '../config/layouts';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';


interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    themes: Theme[];
    layout: Layout;
    setLayout: (layout: Layout) => void;
    layouts: Layout[];
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
    const [layout, setLayoutState] = useState<Layout>(availableLayouts[0]);
    
    // State for explanation-specific typography and styling
    const [explanationFontSize, setExplanationFontSizeState] = useState<number>(14.5);
    const [explanationMathSize, setExplanationMathSizeState] = useState<number>(105);
    const [explanationPadding, setExplanationPaddingState] = useState<number>(24);
    const [explanationTextFont, setExplanationTextFontState] = useState<Font>(availableTextFonts[1]); // Default to Batang
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Fetch settings from Firestore on user auth state change
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                // User is signed in, fetch their settings.
                const fetchThemeSettings = async (uid: string) => {
                    const userDocRef = doc(db, 'users', uid);
                    try {
                        const docSnap = await getDoc(userDocRef);

                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            const settings = data.themeSettings;

                            if (settings) {
                                if (settings.themeName) {
                                    const foundTheme = availableThemes.find(t => t.name === settings.themeName);
                                    if (foundTheme) setThemeState(foundTheme);
                                }
                                if (settings.layoutName) {
                                    const foundLayout = availableLayouts.find(l => l.name === settings.layoutName);
                                    if (foundLayout) setLayoutState(foundLayout);
                                }
                                if (typeof settings.explanationFontSize === 'number') setExplanationFontSizeState(settings.explanationFontSize);
                                if (typeof settings.explanationMathSize === 'number') setExplanationMathSizeState(settings.explanationMathSize);
                                if (typeof settings.explanationPadding === 'number') setExplanationPaddingState(settings.explanationPadding);
                                if (settings.explanationTextFontName) {
                                    const foundFont = availableTextFonts.find(f => f.name === settings.explanationTextFontName);
                                    if (foundFont) setExplanationTextFontState(foundFont);
                                }
                            }
                        } else {
                            console.log("No user document for theme settings found, using defaults.");
                        }
                    } catch (error) {
                        console.error("Error fetching theme settings: ", error);
                    }
                };
                fetchThemeSettings(user.uid);
            } else {
                // User is signed out, reset to defaults
                setThemeState(availableThemes[5]); // Paper
                setLayoutState(availableLayouts[0]);
                setExplanationFontSizeState(14.5);
                setExplanationMathSizeState(105);
                setExplanationPaddingState(24);
                setExplanationTextFontState(availableTextFonts[1]); // Batang
            }
        });

        return () => unsubscribe(); // Cleanup subscription on component unmount
    }, []);
    
    // Function to explicitly save all theme settings to Firestore
    const saveThemeSettingsToFirestore = useCallback(async () => {
        if (!currentUser) {
            console.warn("Cannot save theme settings, no user is logged in.");
            return;
        }

        const settingsToSave = {
            themeSettings: {
                themeName: theme.name,
                layoutName: layout.name,
                explanationFontSize,
                explanationMathSize,
                explanationPadding,
                explanationTextFontName: explanationTextFont.name,
            }
        };

        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
            await setDoc(userDocRef, settingsToSave, { merge: true });
            console.log("Theme settings saved to Firestore.");
        } catch (error) {
            console.error("Error saving theme settings to Firestore: ", error);
            let errorMessage = "테마 설정을 저장하는 데 실패했습니다.";
            if (error instanceof Error) {
                errorMessage += `\n\n${error.message}`;
            } else {
                // FIX: Explicitly cast 'error' to a string before concatenation, as it is of type 'unknown' in a catch block.
                errorMessage += `\n\n${String(error)}`;
            }
            alert(errorMessage);
        }
    }, [theme, layout, explanationFontSize, explanationMathSize, explanationPadding, explanationTextFont, currentUser]);


    // This effect applies theme colors to the DOM
    useEffect(() => {
        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${key}`, value);
        });
    }, [theme]);


    // Set default UI font globally
    useEffect(() => {
        document.documentElement.style.setProperty('--font-family-text', "'KoPubWorldDotum', sans-serif");
    }, []);

    const value = useMemo(() => ({
        theme,
        setTheme: setThemeState,
        themes: availableThemes,
        layout,
        setLayout: setLayoutState,
        layouts: availableLayouts,
        explanationFontSize,
        setExplanationFontSize: setExplanationFontSizeState,
        explanationMathSize,
        setExplanationMathSize: setExplanationMathSizeState,
        explanationPadding,
        setExplanationPadding: setExplanationPaddingState,
        explanationTextFont,
        setExplanationTextFont: setExplanationTextFontState,
        textFonts: availableTextFonts,
        saveThemeSettingsToFirestore, // Expose the save function
    }), [
        theme, layout, explanationFontSize, explanationMathSize, explanationPadding, 
        explanationTextFont, saveThemeSettingsToFirestore
    ]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};