import type { CSSProperties } from "react";

/**
 * The Gimme Gimme splash: glossy paint drops in the brand pink, cyan and yellow, outlined in ink like the
 * logo, flying out from behind a win. Decoration only, so it is hidden from screen readers and skipped
 * entirely with reduced motion.
 */
const TONES = ["#ff2d95", "#1fc4f4", "#ffe11a"];
const DROP = "M0 -15 C6 -6 9 -1 9 4 A9 9 0 0 1 -9 4 C-9 -1 -6 -6 0 -15 Z";

export function Splash({ reducedMotion, className = "", drops = 10, size = 1 }: { reducedMotion: boolean; className?: string; drops?: number; size?: number }) {
  if (reducedMotion) return null;
  return (
    <span className={`rg-splash ${className}`} aria-hidden="true" style={{ "--rg-splash-size": size } as CSSProperties}>
      <svg viewBox="-100 -100 200 200" className="rg-splash-pow">
        <path
          d="M0 -62 L14 -34 L44 -46 L36 -16 L66 -6 L38 10 L52 40 L20 32 L8 62 L-8 34 L-36 50 L-32 18 L-62 6 L-36 -10 L-50 -40 L-18 -30 Z"
          fill="#ffe11a"
          stroke="#141414"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path d="M-6 -44 L6 -26 L28 -32" fill="none" stroke="#fff8b8" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {Array.from({ length: drops }, (_, i) => {
        const a = (360 / drops) * i + (i % 2 ? 9 : -6);
        const d = 70 + (i % 3) * 16;
        const s = 0.75 + ((i * 7) % 5) * 0.12;
        return (
          <svg key={i} viewBox="-12 -18 24 30" className="rg-splash-drop" style={{ "--a": `${a}deg`, "--d": `${d}px`, "--s": s, "--i": i } as CSSProperties}>
            <path d={DROP} fill={TONES[i % 3]} stroke="#141414" strokeWidth="2.6" />
            <ellipse cx="-3" cy="1" rx="2.2" ry="3.4" fill="#fff" opacity="0.75" />
          </svg>
        );
      })}
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className="rg-splash-dot" style={{ "--a": `${i * 60 + 30}deg`, "--d": `${52 + (i % 2) * 30}px`, background: TONES[(i + 1) % 3] } as CSSProperties} />
      ))}
    </span>
  );
}
