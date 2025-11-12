// TypeScript를 위한 전역 타입 선언
declare global {
  interface Window {
    MathJax: {
      // FIX: Widen parameter type to match other declarations and improve type safety.
      typesetPromise: (nodes?: (HTMLElement | Document)[]) => Promise<void>;
      // FIX: Add the optional `startup` property to the MathJax global type.
      // This is part of the MathJax 3 API and is needed to fix the type error in ExplanationCard.tsx.
      startup?: {
        promise: Promise<void>;
      };
      // FIX: Add `typesetClear` to the MathJax global type definition.
      // This is part of the MathJax 3 API and resolves the type error in ExplanationCard.tsx.
      // FIX: Widen parameter type to match other declarations and improve type safety.
      typesetClear: (nodes?: (HTMLElement | Document)[]) => void;
    }
    // [+] Add Prism to global window type to avoid TypeScript errors.
    Prism?: {
      highlightAllUnder: (element: Element) => void;
    };
  }
}

import React, { useEffect, useRef, memo } from 'react';

function MathJaxRendererInternal({ text }: { text: string }) {
  const node = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const renderMath = async () => {
      if (!node.current) return;
      try {
        // Wait for MathJax to be ready before manipulating the DOM
        await window.MathJax?.startup?.promise;

        if (node.current) {
          // Clear any previous typesetting before rendering new content.
          // This prevents issues when the component re-renders with new text.
          window.MathJax.typesetClear([node.current]);
          node.current.innerHTML = text;
          // After setting innerHTML, typeset the new content
          await window.MathJax.typesetPromise([node.current]);
        }
      } catch (err) {
        console.error('MathJax typeset error:', err);
      }
    };
    renderMath();
  }, [text]);

  return <span ref={node} />;
}

export const MathJaxRenderer = memo(MathJaxRendererInternal);