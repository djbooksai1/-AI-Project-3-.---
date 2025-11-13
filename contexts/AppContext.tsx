import React, { createContext, useReducer, useContext, useEffect } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { Explanation, ExplanationMode } from '../types';

interface State {
    user: User | null;
    isAuthenticating: boolean;
    isAdmin: boolean;
    currentSessionId: string | null;
    
    explanations: Explanation[];
    isProcessing: boolean;
    statusMessage: string | null;
    error: string | null;
    apiKeyError: string | null;
    
    currentExplanationSetId: string | null;
    explanationMode: ExplanationMode | null;
}

const initialState: State = {
    user: null,
    isAuthenticating: true,
    isAdmin: false,
    currentSessionId: null,
    explanations: [],
    isProcessing: false,
    statusMessage: null,
    error: null,
    apiKeyError: null,
    currentExplanationSetId: null,
    explanationMode: null,
};

type Action =
    | { type: 'SET_USER'; payload: User | null }
    | { type: 'SET_IS_AUTHENTICATING'; payload: boolean }
    | { type: 'SET_IS_ADMIN'; payload: boolean }
    | { type: 'SET_CURRENT_SESSION_ID'; payload: string | null }
    | { type: 'SET_EXPLANATIONS'; payload: Explanation[] }
    | { type: 'ADD_EXPLANATIONS'; payload: Explanation[] }
    | { type: 'UPDATE_EXPLANATION'; payload: Partial<Explanation> & { id: number } }
    | { type: 'DELETE_EXPLANATION'; payload: number }
    | { type: 'DELETE_MANY_EXPLANATIONS'; payload: Set<number> }
    | { type: 'START_PROCESSING'; payload?: string }
    | { type: 'STOP_PROCESSING' }
    | { type: 'SET_STATUS_MESSAGE'; payload: string | null }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'SET_API_KEY_ERROR'; payload: string | null }
    | { type: 'SET_CURRENT_EXPLANATION_SET_ID'; payload: string | null }
    | { type: 'SET_EXPLANATION_MODE'; payload: ExplanationMode | null }
    | { type: 'RESET_PROCESSING' };


const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case 'SET_USER':
            return { ...state, user: action.payload };
        case 'SET_IS_AUTHENTICATING':
            return { ...state, isAuthenticating: action.payload };
        case 'SET_IS_ADMIN':
            return { ...state, isAdmin: action.payload };
        case 'SET_CURRENT_SESSION_ID':
            return { ...state, currentSessionId: action.payload };
        case 'SET_EXPLANATIONS':
            return { ...state, explanations: action.payload };
        case 'ADD_EXPLANATIONS':
             return { ...state, explanations: [...state.explanations, ...action.payload] };
        case 'UPDATE_EXPLANATION':
            return { ...state, explanations: state.explanations.map(exp => exp.id === action.payload.id ? { ...exp, ...action.payload } : exp) };
        case 'DELETE_EXPLANATION':
            return { ...state, explanations: state.explanations.filter(exp => exp.id !== action.payload) };
        case 'DELETE_MANY_EXPLANATIONS':
            return { ...state, explanations: state.explanations.filter(exp => !action.payload.has(exp.id)) };
        case 'START_PROCESSING':
            return { ...state, isProcessing: true, statusMessage: action.payload || '처리 중...', error: null, apiKeyError: null };
        case 'STOP_PROCESSING':
            return { ...state, isProcessing: false, statusMessage: null };
        case 'SET_STATUS_MESSAGE':
            return { ...state, statusMessage: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload, apiKeyError: null };
        case 'SET_API_KEY_ERROR':
            return { ...state, apiKeyError: action.payload, error: null };
        case 'SET_CURRENT_EXPLANATION_SET_ID':
            return { ...state, currentExplanationSetId: action.payload };
        case 'SET_EXPLANATION_MODE':
            return { ...state, explanationMode: action.payload };
        case 'RESET_PROCESSING':
            return { ...state, explanations: [], error: null, apiKeyError: null, statusMessage: null, isProcessing: false, currentExplanationSetId: null };
        default:
            return state;
    }
};

interface AppContextType {
    state: State;
    dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: React.PropsWithChildren) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);

                // Use localStorage to persist session ID across reloads and tabs.
                // This prevents race conditions from multi-tab usage logging users out.
                let sessionId = localStorage.getItem('currentSessionId');
                const isNewLogin = !sessionId;

                if (isNewLogin) {
                    sessionId = `${Date.now()}-${Math.random()}`;
                    localStorage.setItem('currentSessionId', sessionId);
                }
                
                dispatch({ type: 'SET_CURRENT_SESSION_ID', payload: sessionId });

                const updateData: { [key: string]: any } = {};
                // Only update Firestore's session ID on a fresh login to invalidate other sessions.
                if (isNewLogin) {
                    updateData.currentSessionId = sessionId;
                }

                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists()) {
                    let formattedPhoneNumber = currentUser.phoneNumber;
                    if (formattedPhoneNumber?.startsWith('+82')) {
                        formattedPhoneNumber = '0' + formattedPhoneNumber.substring(3);
                    }
                    updateData.phoneNumber = formattedPhoneNumber;
                    updateData.createdAt = serverTimestamp();
                    updateData.tier = 'basic';
                }
                
                // Only write to Firestore if there's something to update (new user or new session).
                if (Object.keys(updateData).length > 0) {
                    await setDoc(userDocRef, updateData, { merge: true });
                }
                
                dispatch({ type: 'SET_USER', payload: currentUser });
            } else {
                // Clear local storage on logout.
                localStorage.removeItem('currentSessionId');
                dispatch({ type: 'SET_USER', payload: null });
                dispatch({ type: 'SET_CURRENT_SESSION_ID', payload: null });
                dispatch({ type: 'RESET_PROCESSING' });
            }
            dispatch({ type: 'SET_IS_AUTHENTICATING', payload: false });
        });
        return () => unsubscribe();
    }, []);

    const value = { state, dispatch };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};