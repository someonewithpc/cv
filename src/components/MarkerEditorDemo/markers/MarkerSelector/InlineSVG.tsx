import '../client-only';

import { useEffect, useRef } from 'react';

export function InlineSVG({ svgString }: { svgString: string }) {
  const svgElementRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgElementRef.current || typeof document === 'undefined') {
      return;
    }

    const container = document.createElement('div');
    container.innerHTML = svgString;
    const parsedSvg = container.firstChild as SVGSVGElement;
    parsedSvg.setAttribute('aria-hidden', 'true');
    parsedSvg.setAttribute('focusable', 'false');

    svgElementRef.current.replaceWith(parsedSvg);
    svgElementRef.current = parsedSvg;
  }, [svgString]);

  return <svg ref={svgElementRef} aria-hidden="true" focusable="false" />;
}
