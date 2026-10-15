export function CursorArrow({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
      <path
        d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
