import { useState, useCallback } from 'react';
import { generateVariationNumbersOnly, generateVariationIdeas, generateVariationFromIdea } from '../services/geminiService';
import { Explanation } from '../types';

type VariationState = 'idle' | 'numbers_loading' | 'ideas_loading' | 'ideas_shown' | 'problem_loading';

export const useVariationGenerator = (originalProblemText: string, initialVariation: Explanation['variationProblem']) => {
    const [variationState, setVariationState] = useState<VariationState>('idle');
    const [variationIdeas, setVariationIdeas] = useState<string[]>([]);
    const [generatedVariation, setGeneratedVariation] = useState<Explanation['variationProblem'] | null>(initialVariation || null);
    const [variationError, setVariationError] = useState<string | null>(null);

    const handleGenerateNumbersVariation = useCallback(async () => {
        setVariationState('numbers_loading');
        setVariationError(null);
        try {
            const result = await generateVariationNumbersOnly(originalProblemText);
            setGeneratedVariation(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : '숫자 변형 문제 생성에 실패했습니다.';
            setVariationError(message);
        } finally {
            setVariationState('idle');
        }
    }, [originalProblemText]);

    const handleFetchIdeas = useCallback(async () => {
        setVariationState('ideas_loading');
        setVariationError(null);
        try {
            const ideas = await generateVariationIdeas(originalProblemText);
            setVariationIdeas(ideas);
            setVariationState('ideas_shown');
        } catch (error) {
            const message = error instanceof Error ? error.message : '아이디어 생성에 실패했습니다.';
            setVariationError(message);
            setVariationState('idle');
        }
    }, [originalProblemText]);

    const handleGenerateFromIdea = useCallback(async (idea: string) => {
        setVariationState('problem_loading');
        setVariationError(null);
        setVariationIdeas([]);
        try {
            const result = await generateVariationFromIdea(originalProblemText, idea);
            setGeneratedVariation(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : '문제 생성에 실패했습니다.';
            setVariationError(message);
        } finally {
            setVariationState('idle');
        }
    }, [originalProblemText]);

    const handleResetVariation = useCallback(() => {
        setGeneratedVariation(null);
        setVariationState('idle');
        setVariationIdeas([]);
        setVariationError(null);
    }, []);

    return {
        variationState,
        variationIdeas,
        generatedVariation,
        variationError,
        handleGenerateNumbersVariation,
        handleFetchIdeas,
        handleGenerateFromIdea,
        handleResetVariation,
    };
};