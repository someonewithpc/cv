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

    svgElementRef.current.replaceWith(parsedSvg);
    svgElementRef.current = parsedSvg;
  }, [svgString]);

  return <svg ref={svgElementRef} />;
}
