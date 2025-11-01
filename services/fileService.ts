export const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

/**
 * Reads the first few bytes of a file to determine if it is a PDF.
 * A PDF file starts with the magic number "%PDF" (0x25 0x50 0x44 0x46).
 * This is a much more reliable way to identify PDFs than relying on file extensions or MIME types.
 * @param file The file to check.
 * @returns A promise that resolves to true if the file is a PDF, false otherwise.
 */
export const isPdfFile = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
        // We only need the first 4 bytes to check the magic number.
        const blob = file.slice(0, 4); 
        const reader = new FileReader();

        reader.onloadend = (e) => {
            if (e.target?.readyState === FileReader.DONE) {
                try {
                    const buffer = e.target.result as ArrayBuffer;
                    const view = new Uint8Array(buffer);
                    // Check if the first 4 bytes match '%PDF'
                    if (view.length >= 4 && view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (readError) {
                    console.error("Error reading file buffer for PDF check:", readError);
                    resolve(false);
                }
            } else {
                 resolve(false);
            }
        };

        reader.onerror = (e) => {
            console.error("Error reading file slice for PDF check:", e);
            // On error, assume it's not a PDF to be safe.
            resolve(false); 
        };
        
        reader.readAsArrayBuffer(blob);
    });
};