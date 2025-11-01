import { fileToBase64 } from './fileService';

// pdf.js is loaded globally from index.html via a script tag.
// We declare the global variable for TypeScript to recognize it.
declare const pdfjsLib: any;

// The workerSrc is now robustly set in index.html to avoid race conditions.

/**
 * Tries to open a file as a PDF document using the globally available pdf.js library.
 * This version uses an ArrayBuffer, which is more memory-efficient and stable for large
 * multi-page PDFs compared to base64 data URLs.
 * @param file The file to process.
 * @returns A promise that resolves to a PDFDocumentProxy object.
 * @throws An error if pdf.js cannot parse the file, which is caught by the processing service.
 */
export const getPdfDocument = async (file: File): Promise<any> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);

        // Pass an object with the data, which is a robust and efficient way to handle it.
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        
        return pdf;

    } catch (error) {
        // Fallback logic remains the same.
        const errorMessage = ((error && typeof error === 'object' && 'message' in error) 
            ? String((error as Error).message) 
            : String(error)).toLowerCase();

        // Create a specific error that the processing service can catch to trigger fallback logic.
        if (errorMessage.includes('handler for document') || errorMessage.includes('invalid pdf structure') || errorMessage.includes('missing pdf')) {
            console.warn(
                `File "${file.name}" could not be opened as a PDF. Triggering fallback to image processing.`, 
                error
            );
            throw new Error("PDF 형식이 아닙니다. 이미지로 처리를 시도합니다.");
        }
        
        console.error(`An unexpected error occurred while opening PDF "${file.name}":`, error);
        throw error; // Rethrow other unexpected errors.
    }
};

/**
 * Renders a single page of a PDF document to a high-quality, base64 encoded JPEG image string.
 * @param page The PDFPageProxy object for the page to render.
 * @param scale The rendering scale. A higher value results in a higher resolution image.
 * @returns A promise that resolves to a data URL string of the rendered image.
 */
export const renderPdfPageToImage = async (page: any, scale: number = 6.0): Promise<string> => {
    const viewport = page.getViewport({ scale });

    // Create a temporary canvas to render the PDF page.
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
        throw new Error('Could not create canvas context for PDF rendering.');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert the canvas content to a data URL.
    // Using JPEG with high quality for a good balance of size and clarity.
    return canvas.toDataURL('image/jpeg', 0.95);
};