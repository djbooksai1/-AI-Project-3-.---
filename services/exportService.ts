import { Explanation } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';

declare global {
    interface Window {
        jspdf: any;
        html2canvas: any;
    }
}

/**
 * 필요한 전역 라이브러리(jspdf, html2canvas)가 로드될 때까지 기다립니다.
 * @param {number} timeout - 최대 대기 시간 (밀리초)
 * @returns {Promise<void>} 라이브러리가 로드되면 resolve되는 Promise
 */
const waitForLibraries = (timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (window.jspdf && window.html2canvas) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error("PDF 생성 라이브러리(jspdf, html2canvas)를 불러오는 데 실패했습니다."));
            }
        }, 100); 
    });
};


/**
 * 해설 카드의 DOM 노드를 캡쳐하여 PDF 파일로 생성하고 다운로드합니다.
 * @param {(HTMLDivElement | null)[]} cardNodes - 캡쳐할 해설 카드의 DOM 노드 배열
 * @param {(progress: number) => void} progressCallback - 진행률 콜백 함수
 */
export const exportToPdf = async (
    cardNodes: (HTMLDivElement | null)[],
    progressCallback: (progress: number) => void
) => {
    await waitForLibraries();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const A4_WIDTH = 210;
    const MARGIN = 15;
    const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
    let isFirstPage = true;

    const validNodes = cardNodes.filter(node => node !== null) as HTMLDivElement[];

    for (let i = 0; i < validNodes.length; i++) {
        const node = validNodes[i];
        
        // 3-Step Stabilization Process for Rendering
        // Step 1: Wait for MathJax
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            await window.MathJax.typesetPromise([node]);
        }
        // Step 2: Wait for browser paint
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Step 3: Additional stabilization delay
        await new Promise(resolve => setTimeout(resolve, 300));

        if (!isFirstPage) {
            doc.addPage();
        }

        const canvas = await window.html2canvas(node, {
            scale: 2, 
            useCORS: true,
            logging: false,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
        });

        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfImageHeight = (imgProps.height * CONTENT_WIDTH) / imgProps.width;

        doc.addImage(imgData, 'PNG', MARGIN, MARGIN, CONTENT_WIDTH, pdfImageHeight);
        isFirstPage = false;
        
        const progress = Math.round(((i + 1) / validNodes.length) * 100);
        progressCallback(progress);
    }

    doc.save("해적_해설집.pdf");
};

/**
 * 해설 카드의 DOM 노드를 캡쳐하여 HWP에서 불러올 수 있는 단일 HTML 파일로 생성하고 다운로드합니다.
 * @param {(HTMLDivElement | null)[]} cardNodes - 캡쳐할 해설 카드의 DOM 노드 배열
 * @param {(progress: number) => void} progressCallback - 진행률 콜백 함수
 */
export const exportToHtml = async (
    cardNodes: (HTMLDivElement | null)[],
    progressCallback: (progress: number) => void
) => {
    await waitForLibraries();

    let bodyContent = '';
    const rootStyles = window.getComputedStyle(document.documentElement);

    const validNodes = cardNodes.filter(node => node !== null) as HTMLDivElement[];

    for (let i = 0; i < validNodes.length; i++) {
        const node = validNodes[i];
        
        // 3-Step Stabilization Process for Rendering
        // Step 1: Wait for MathJax
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            await window.MathJax.typesetPromise([node]);
        }
        // Step 2: Wait for browser paint
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Step 3: Additional stabilization delay
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await window.html2canvas(node, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: rootStyles.getPropertyValue('--color-background').trim(),
        });
        
        const imgDataUrl = canvas.toDataURL('image/png');
        bodyContent += `<div style="margin-bottom: 20px; page-break-inside: avoid;"><img src="${imgDataUrl}" style="width: 100%; height: auto;" alt="Explanation Card Image"></div>`;
        
        const progress = Math.round(((i + 1) / validNodes.length) * 100);
        progressCallback(progress);
    }

    const htmlString = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <title>해적 해설집</title>
            <style>
                body {
                    font-family: ${rootStyles.getPropertyValue('--font-family-text').trim()}, sans-serif;
                    background-color: ${rootStyles.getPropertyValue('--color-background').trim()};
                    padding: 2rem;
                }
                @media print {
                    body {
                        background-color: #ffffff;
                    }
                }
            </style>
        </head>
        <body>
            <h1>해적 AI 해설집</h1>
            ${bodyContent}
        </body>
        </html>
    `;

    const blob = new Blob([htmlString], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '해적_해설집(HWP에서 열어주세요).html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

const convertInlineToDisplayMathForHwp = (markdown: string): string => {
    if (!markdown) return '';
    let result = markdown;
    // Convert $...$ to $$...$$, but be careful not to affect existing $$...$$
    // This regex looks for a single $ not preceded or followed by another $
    result = result.replace(/(?<!\$)\$([^$\n]+?)\)\$(?!\$)/g, '$$$$$1$$$$');
    // Convert \(...\) to $$...$$
    result = result.replace(/\\\(([\s\S]+?)\\\)/g, '$$$$$1$$$$');
    return result;
};


// [+] Firebase Functions v2 asia-northeast3 지역을 명시적으로 설정합니다.
const functions = getFunctions(undefined, 'asia-northeast3');
const generateHwp = httpsCallable(functions, 'generateHwp');

const base64ToBlob = (base64: string, contentType: string = '', sliceSize: number = 512): Blob => {
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
};

export const exportMultipleExplanationsToHwp = async (explanations: Explanation[]): Promise<void> => {
    if (explanations.length === 0) {
        throw new Error("HWP로 내보낼 해설이 선택되지 않았습니다.");
    }

    const combinedContent = explanations
        .sort((a, b) => a.problemNumber - b.problemNumber)
        .map(exp => {
            const hwpReadyProblemText = convertInlineToDisplayMathForHwp(exp.originalProblemText);
            const hwpReadyMarkdown = convertInlineToDisplayMathForHwp(exp.markdown);
            return `[문제 ${exp.problemNumber}]\n${hwpReadyProblemText}\n\n[해설]\n${hwpReadyMarkdown}`;
        })
        .join('\n\n\n');

    try {
        // Call the secure cloud function instead of fetching directly
        const result: any = await generateHwp({ content: combinedContent });
        
        if (!result.data.base64Hwp) {
            throw new Error("Cloud function did not return HWP data.");
        }
        
        const blob = base64ToBlob(result.data.base64Hwp, 'application/x-hwp');
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const date = new Date();
        const filename = `해적_해설집_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.hwp`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error("Error generating HWP file via cloud function:", error);
        // Re-throw the error to be caught by the UI
        throw error;
    }
};
