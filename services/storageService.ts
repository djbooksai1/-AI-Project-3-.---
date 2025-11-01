import { storage } from '../firebaseConfig';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a base64 encoded image string to Firebase Storage.
 * @param userId The UID of the current user.
 * @param base64String The image string, which can be a data URL.
 * @returns A promise that resolves to the public download URL of the uploaded image.
 */
export const uploadImageFromBase64 = async (userId: string, base64String: string): Promise<string> => {
    // If the string is not a base64 data URL, assume it's already a valid URL and return it.
    if (!base64String.startsWith('data:image')) {
        return base64String;
    }
    
    // Generate a unique ID for the image file.
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storageRef = ref(storage, `users/${userId}/images/${imageId}.jpeg`);
    
    // The base64 string is in the format "data:image/jpeg;base64,..."
    // We need to pass only the data part to uploadString.
    const base64Data = base64String.split(',')[1];

    try {
        const snapshot = await uploadString(storageRef, base64Data, 'base64', {
            contentType: 'image/jpeg'
        });
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading image to Firebase Storage:", error);
        throw new Error("이미지 업로드에 실패했습니다.");
    }
};
