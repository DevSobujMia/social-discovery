'use client';

/**
 * Nested neon hearts, drawn original. Tight crop — no plate, no glow bleed.
 */
export default function HeartMark({ className = '' }: { className?: string }) {
  const d =
    'M32 53.6 C14.6 39.4 6.6 28.6 6.6 18.2 C6.6 10.6 13 4.8 20.8 4.8 C25.8 4.8 29.8 7.2 32 11.2 C34.2 7.2 38.2 4.8 43.2 4.8 C51 4.8 57.4 10.6 57.4 18.2 C57.4 28.6 49.4 39.4 32 53.6 Z';

  return (
    <svg
      viewBox="5 3.6 54 51.2"
      className={`heart-neon ${className}`.trim()}
      aria-hidden
      focusable="false"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} stroke="#ff2d6a" strokeWidth="3.1" opacity="0.55" />
        <path d={d} stroke="#ff5c94" strokeWidth="1.85" />
        <path d={d} stroke="#ffe4ef" strokeWidth="0.55" />
        <g transform="translate(16.6 18.4) scale(0.52)">
          <path d={d} stroke="#ff2d6a" strokeWidth="4.4" opacity="0.55" />
          <path d={d} stroke="#ff5c94" strokeWidth="2.6" />
          <path d={d} stroke="#ffe4ef" strokeWidth="0.8" />
        </g>
      </g>
    </svg>
  );
}
