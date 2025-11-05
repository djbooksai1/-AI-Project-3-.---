import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

// Simple in-memory cache for prompts to reduce Firestore reads.
const promptCache = new Map<string, string>();

/**
 * Fetches a prompt from the 'prompts' collection in Firestore or returns it from an in-memory cache.
 * This approach secures prompts by removing them from the client-side source code.
 * @param promptName The name of the document in the 'prompts' collection (e.g., 'systemInstruction').
 * @returns The content of the prompt as a string.
 * @throws An error if the prompt cannot be fetched, preventing insecure or incomplete API calls.
 */
export const getPrompt = async (promptName: string): Promise<string> => {
    if (promptCache.has(promptName)) {
        return promptCache.get(promptName)!;
    }

    try {
        const promptDocRef = doc(db, 'prompts', promptName);
        const docSnap = await getDoc(promptDocRef);

        if (docSnap.exists()) {
            const content = docSnap.data().content;
            if (typeof content === 'string' && content.trim() !== '') {
                promptCache.set(promptName, content);
                return content;
            }
            throw new Error(`Prompt '${promptName}' content is empty or not a string.`);
        } else {
            // This is a critical failure, as the app's core logic depends on these prompts.
            throw new Error(`Prompt document '${promptName}' does not exist in Firestore.`);
        }
    } catch (error) {
        console.error(`CRITICAL: Error fetching prompt '${promptName}':`, error);
        // We throw a specific error that can be caught to notify the user.
        // The error message now includes "해적 AI" to be routed correctly.
        const firestoreError = error instanceof Error ? ` (Firestore 오류: ${error.message})` : '';
        throw new Error(`해적 AI 지침('${promptName}')을 불러오는 데 실패했습니다.${firestoreError} 앱을 사용할 수 없습니다.`);
    }
};