export type MarkerType = {
  id: string | number;
  baseMarkerId?: string | null;
  source: string;
  resolvedSource?: string;
  size: [number, number];
  anchor: [number, number];
  popupAnchor: [number, number];
  kind: 'upload' | 'editor';
  filename?: string | null;
};

export type MarkerDecorationType = {
  id: number | string;
  source: string;
  resolvedSource?: string;
  filename?: string | null;
};

export type SpaceType = {
  id: string;
  name: string;
  markerId?: MarkerType['id'];
  /** Position on the mock map, in viewBox coordinates (0–100). */
  x: number;
  y: number;
};
