import { useMemo, type CSSProperties } from "react";
import { createRng } from "../rng";

const COLOURS = ["#ff2d95", "#1fc4f4", "#ffe01a", "#ffffff"];
const SHAPES = ["rect", "dot", "pill"] as const;

export function Confetti({ seed, reducedMotion, small = false }: { seed: string; reducedMotion: boolean; small?: boolean }) {
  const pieces = useMemo(() => {
    const rng = createRng(`confetti:${seed}`);
    return Array.from({ length: small ? (reducedMotion ? 3 : 8) : reducedMotion ? 14 : 42 }, (_, i) => ({
      i,
      left: rng() * 100,
      top: rng() * 55,
      delay: rng() * 0.5,
      duration: 1.8 + rng() * 1.4,
      rotate: Math.floor(rng() * 360),
      drift: (rng() - 0.5) * 80,
      colour: COLOURS[i % COLOURS.length],
      shape: SHAPES[Math.floor(rng() * SHAPES.length)],
    }));
  }, [seed, reducedMotion, small]);

  return (
    <div className={`rg-confetti ${reducedMotion ? "is-static" : ""}`} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.i}
          className={`rg-confetti-piece rg-confetti-${p.shape}`}
          style={
            {
              left: `${p.left}%`,
              top: reducedMotion ? `${p.top}%` : undefined,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--rg-rot": `${p.rotate}deg`,
              "--rg-drift": `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
