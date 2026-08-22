import { useMemo } from 'react';

import { useFontState } from './fontState';

export function useFontMetrics() {
  const { cssText } = useFontState();

  return useMemo(
    () => getComputedStyle(document.body),
    [cssText], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function useFontSize() {
  const metrics = useFontMetrics();
  return +metrics.fontSize.replace('px', '') / 16; // Convert from `px` to `em`
}

export function useFontWeight() {
  const metrics = useFontMetrics();
  const fontWeight = metrics.fontWeight;
  const numericWeight = +fontWeight;
  if (!Number.isNaN(numericWeight)) return numericWeight;

  const fontWeightMap: Record<string, number> = {
    'normal': 400,
    'bold': 700,
    'lighter': 100,
    'bolder': 700,
  };

  return fontWeightMap[fontWeight.toLowerCase()] ?? 400;
}
