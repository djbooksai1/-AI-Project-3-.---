
import { ExtractedProblem } from '../types';

declare const cv: any;

class RecognitionService {
    private isReady = false;
    private readyPromise: Promise<void> | null = null;

    init(): Promise<void> {
        if (this.isReady) {
            return Promise.resolve();
        }

        if (this.readyPromise) {
            return this.readyPromise;
        }

        this.readyPromise = new Promise((resolve, reject) => {
            const script = document.getElementById('opencv-script');
            if (!script) {
                return reject(new Error("OpenCV.js script tag not found."));
            }

             const onCvReady = () => {
                if (cv && cv.onRuntimeInitialized) {
                     cv.onRuntimeInitialized = () => {
                        console.log("OpenCV.js is ready.");
                        this.isReady = true;
                        resolve();
                    };
                } else {
                    setTimeout(() => {
                         if (typeof cv !== 'undefined' && cv.Mat) {
                             console.log("OpenCV.js is ready (fallback).");
                             this.isReady = true;
                             resolve();
                         } else {
                            reject(new Error("OpenCV failed to initialize even after delay."));
                         }
                    }, 500);
                }
            };
            
            if (typeof cv !== 'undefined' && cv.Mat) {
                this.isReady = true;
                resolve();
            } else {
                script.onload = onCvReady;
            }

            script.onerror = () => {
                reject(new Error("Failed to load OpenCV.js script."));
            };
        });

        return this.readyPromise;
    }

    async detectProblems(imageBase64: string): Promise<ExtractedProblem[]> {
        if (!this.isReady) {
            throw new Error("Recognition service (OpenCV.js) is not initialized yet.");
        }

        const imgElement = await this.createImageElement(imageBase64);
        const src = cv.imread(imgElement);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        const thresh = new cv.Mat();
        cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
        
        let initialRects = [];
        for (let i = 0; i < contours.size(); ++i) {
            initialRects.push(cv.boundingRect(contours.get(i)));
        }
        contours.delete();
        hierarchy.delete();
        
        const imageWidth = src.cols;
        const imageHeight = src.rows;

        const minArea = 20; 
        const maxLineAspect = 15.0; 
        let filteredRects = initialRects.filter(rect => {
            const area = rect.width * rect.height;
            const aspectRatio = rect.width / rect.height;
            return area > minArea && 
                   aspectRatio < maxLineAspect && 
                   (1/aspectRatio) < maxLineAspect;
        });

        const mergedRects = this.mergeNearbyRects(filteredRects, imageWidth * 0.03);

        const problems: ExtractedProblem[] = mergedRects.map(rect => {
            return {
                problemBody: '', 
                problemType: '주관식', 
                bbox: {
                    x_min: rect.x / imageWidth,
                    y_min: rect.y / imageHeight,
                    x_max: (rect.x + rect.width) / imageWidth,
                    y_max: (rect.y + rect.height) / imageHeight,
                },
            };
        });

        src.delete();
        gray.delete();
        thresh.delete();

        return problems.sort((a, b) => a.bbox.y_min - b.bbox.y_min);
    }
    
    private mergeNearbyRects(rects: any[], gapThreshold: number): any[] {
        if (rects.length < 2) return rects;

        let merged = [...rects];
        let wasMergePerformed = true;

        while (wasMergePerformed) {
            wasMergePerformed = false;
            let nextMerged = [];
            let mergedIndices = new Set<number>();

            for (let i = 0; i < merged.length; i++) {
                if (mergedIndices.has(i)) continue;

                let currentRect = merged[i];

                for (let j = i + 1; j < merged.length; j++) {
                    if (mergedIndices.has(j)) continue;

                    const otherRect = merged[j];

                    const horizontalDist = Math.max(0, Math.max(currentRect.x, otherRect.x) - Math.min(currentRect.x + currentRect.width, otherRect.x + otherRect.width));
                    const verticalDist = Math.max(0, Math.max(currentRect.y, otherRect.y) - Math.min(currentRect.y + currentRect.height, otherRect.y + otherRect.height));
                    
                    if (horizontalDist < gapThreshold && verticalDist < gapThreshold) {
                         const unionX = Math.min(currentRect.x, otherRect.x);
                         const unionY = Math.min(currentRect.y, otherRect.y);
                         const unionWidth = Math.max(currentRect.x + currentRect.width, otherRect.x + otherRect.width) - unionX;
                         const unionHeight = Math.max(currentRect.y + currentRect.height, otherRect.y + otherRect.height) - unionY;
                         
                         currentRect = new cv.Rect(unionX, unionY, unionWidth, unionHeight);

                         mergedIndices.add(j);
                         wasMergePerformed = true;
                    }
                }
                nextMerged.push(currentRect);
            }
            merged = nextMerged;
        }
        return merged;
    }

    private createImageElement(base64String: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`Failed to load image for detection: ${err}`));
            img.src = base64String;
        });
    }
}

export const recognitionService = new RecognitionService();
