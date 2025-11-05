import { storage } from '../firebaseConfig';
import { ref, uploadString, getDownloadURL, listAll, StorageReference } from 'firebase/storage';
import type { ManualFile } from '../types';

/**
 * Uploads a base64 encoded image string to a user-specific folder in Firebase Storage.
 * This function is specifically for problem images associated with a user.
 * @param userId The UID of the current user.
 * @param base64String The image string, which must be a data URL.
 * @returns A promise that resolves to the public download URL of the uploaded image.
 */
// FIX: Added optional isCache parameter to support saving images to a different location for the "golden set" cache.
export const uploadProblemImage = async (userId: string, base64String: string, isCache?: boolean): Promise<string> => {
    // This function is intended for new uploads, so we expect a data URL.
    // If it's not, it might be an existing URL, so we return it to prevent errors.
    if (!base64String.startsWith('data:image')) {
        console.warn("uploadProblemImage was called with a non-base64 string. Returning as is.");
        return base64String;
    }
    
    const imageId = `problem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storagePath = isCache 
        ? `goldenSet/${imageId}.jpeg` 
        : `users/${userId}/images/${imageId}.jpeg`;
    const storageRef = ref(storage, storagePath);
    
    // Extract pure base64 data from the data URL
    const base64Data = base64String.split(',')[1];
    if (!base64Data) {
        throw new Error("Invalid base64 string provided.");
    }

    try {
        const snapshot = await uploadString(storageRef, base64Data, 'base64', {
            contentType: 'image/jpeg'
        });
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading problem image to Firebase Storage:", error);
        throw new Error("문제 이미지 업로드에 실패했습니다. 스토리지 권한을 확인해주세요.");
    }
};

/**
 * Uploads a base64 encoded image string to a shared 'ui_assets' folder for admin use.
 * This overwrites the existing file to ensure the UI always shows the latest version.
 * @param assetName The name of the asset (e.g., 'dropzoneImage').
 * @param base64String The image string, which must be a data URL.
 * @returns A promise that resolves to the public download URL of the uploaded asset.
 */
export const uploadUiAsset = async (assetName: string, base64String: string): Promise<string> => {
    if (!base64String.startsWith('data:image')) {
        throw new Error("Invalid image data provided for UI asset upload.");
    }
    
    const storageRef = ref(storage, `ui_assets/${assetName}.jpeg`);
    const base64Data = base64String.split(',')[1];
     if (!base64Data) {
        throw new Error("Invalid base64 string provided for UI asset.");
    }

    try {
        const snapshot = await uploadString(storageRef, base64Data, 'base64', {
            contentType: 'image/jpeg'
        });
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading UI asset to Firebase Storage:", error);
        throw new Error("UI 자산 업로드에 실패했습니다. 관리자 권한 및 스토리지 규칙을 확인해주세요.");
    }
};


/**
 * Lists manually uploaded files (like HWP) from a user's specific storage folder.
 * @param userId The UID of the current user.
 * @returns A promise that resolves to an array of objects with file names and download URLs.
 */
export const listUserFiles = async (userId: string): Promise<ManualFile[]> => {
    const userFilesRef = ref(storage, `users/${userId}/manual_files/`);
    try {
        const res = await listAll(userFilesRef);
        const filePromises = res.items.map(async (itemRef: StorageReference) => {
            const url = await getDownloadURL(itemRef);
            return {
                name: itemRef.name,
                url: url,
            };
        });
        const files = await Promise.all(filePromises);
        // Sort files by name, assuming a consistent naming convention like date prefixes
        return files.sort((a, b) => b.name.localeCompare(a.name));
    } catch (error) {
        // It's common for this directory not to exist, so we don't log an error.
        // We just return an empty array.
        if ((error as any).code !== 'storage/object-not-found') {
            console.error("Error listing user files:", error);
        }
        return [];
    }
};
