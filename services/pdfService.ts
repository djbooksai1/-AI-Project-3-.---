
// This uses the global pdfjsLib object loaded from the CDN in index.html
declare const pdfjsLib: any;

export const pdfToImages = async (file: File): Promise<string[]> => {
    const images: string[] = [];
    const fileReader = new FileReader();

    return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file."));
            }

            try {
                const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    
                    if (!context) {
                        return reject(new Error('Failed to get canvas context.'));
                    }

                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    images.push(canvas.toDataURL('image/jpeg'));
                }
                resolve(images);
            } catch (error) {
                console.error("Error processing PDF:", error);
                reject(new Error("PDF 파일을 처리하는 중 오류가 발생했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다."));
            }
        };

        fileReader.onerror = () => {
            reject(new Error("Error reading file."));
        };

        fileReader.readAsArrayBuffer(file);
    });
};
