import React, { useRef, useLayoutEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';

// Type definition for window.MathJax.
declare global {
  interface Window {
    MathJax: {
      typesetPromise: (nodes?: (HTMLElement | Document)[]) => Promise<void>;
      startup?: {
        promise: Promise<void>;
      };
      // FIX: Add `typesetClear` to make this global type declaration consistent.
      typesetClear: (nodes?: (HTMLElement | Document)[]) => void;
    }
    Prism?: {
      highlightAllUnder: (element: Element) => void;
    };
  }
}

const MarkdownRendererFC: React.FC<{ markdown: string; className?: string; style?: React.CSSProperties }> = ({ markdown, className, style }) => {
    const contentRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const renderContent = async () => {
            if (!contentRef.current) return;

            try {
                // First, wait for MathJax to be fully initialized.
                if (window.MathJax?.startup?.promise) {
                    await window.MathJax.startup.promise;
                }
                
                // Then, typeset the content inside the ref.
                if (window.MathJax) {
                    await window.MathJax.typesetPromise([contentRef.current]);
                }
                
                // Highlight code blocks with Prism.js after typesetting.
                if (window.Prism && contentRef.current) {
                    window.Prism.highlightAllUnder(contentRef.current);
                }

            } catch (error) {
                console.error("Error during content rendering:", error);
            }
        };

        renderContent();
    }, [markdown]); // This effect runs every time the markdown content changes.
    
    // This is a workaround to prevent react-markdown from interpreting single backslashes in LaTeX
    // as escape characters. MathJax needs double backslashes for newlines (e.g., in `aligned` environments).
    // By replacing `\\` with `\\\\`, we ensure that after markdown processing, `\\` remains for MathJax.
    const processedMarkdown = markdown.replace(/\\\\/g, '\\\\\\\\');

    return (
        <div ref={contentRef} className={className} style={style}>
            <ReactMarkdown
                components={{
                    p: ({node, ...props}) => <p className="my-2 leading-relaxed" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-6 mb-3 border-b border-primary/50 pb-2" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-6 my-4 space-y-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-6 my-4 space-y-2" {...props} />,
                    li: ({node, ...props}) => <li className="pl-2" {...props} />,
                }}
            >
                {processedMarkdown}
            </ReactMarkdown>
        </div>
    );
};

export const MarkdownRenderer = memo(MarkdownRendererFC);