import { Explanation } from '../types';

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

export const exportMultipleExplanationsToHwp = async (explanations: Explanation[]): Promise<void> => {
    if (explanations.length === 0) {
        throw new Error("HWP로 내보낼 해설이 선택되지 않았습니다.");
    }

    const combinedContent = explanations
        .sort((a, b) => a.problemNumber - b.problemNumber)
        .map(exp => `[문제 ${exp.problemNumber}]\n${exp.originalProblemText}\n\n[해설]\n${exp.markdown}`)
        .join('\n\n\n');

    try {
        const response = await fetch('https://hml-generator-service-646620208083.asia-northeast3.run.app/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: combinedContent,
                treatAsChar: true,
                textSize: 12,
                equationSize: 9,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HWP 생성 서버 오류: ${response.status} ${errorText}`);
        }

        const blob = await response.blob();
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
        console.error("Error generating HWP file:", error);
        throw error;
    }
};