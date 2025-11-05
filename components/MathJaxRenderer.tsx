// TypeScript를 위한 전역 타입 선언
declare global {
  interface Window {
    MathJax: {
      typesetPromise: (nodes?: HTMLElement[]) => Promise<void>;
      // FIX: Add the optional `startup` property to the MathJax global type.
      // This is part of the MathJax 3 API and is needed to fix the type error in ExplanationCard.tsx.
      startup?: {
        promise: Promise<void>;
      };
      // FIX: Add `typesetClear` to the MathJax global type definition.
      // This is part of the MathJax 3 API and resolves the type error in ExplanationCard.tsx.
      typesetClear: (nodes?: HTMLElement[]) => void;
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
    if (node.current && window.MathJax) {
      node.current.innerHTML = text;
      window.MathJax.typesetPromise([node.current]).catch((err) =>
        console.error('MathJax typeset error:', err)
      );
    }
  }, [text]);

  return <span ref={node} />;
}

export const MathJaxRenderer = memo(MathJaxRendererInternal);