// TypeScript를 위한 전역 타입 선언
declare global {
  interface Window {
    MathJax: {
      typesetPromise: (nodes?: HTMLElement[]) => Promise<void>;
    }
  }
}

import React, { useEffect, useRef, memo } from 'react';

const MathJaxRenderer: React.FC<{ text: string }> = memo(({ text }) => {
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
});

export default MathJaxRenderer;
