import { useMemo, type CSSProperties } from "react";
import { createRng } from "../../rng";
import "./christmas.css";

/**
 * Light snow behind the Christmas games. Two dozen soft dots moved with CSS
 * transforms only, so it stays smooth on mid-range phones. With reduced motion
 * a few flakes sit still instead. It never takes a tap.
 */
export function Snowfall({ reducedMotion }: { reducedMotion: boolean }) {
  const flakes = useMemo(() => {
    const rng = createRng("snowfall");
    return Array.from({ length: reducedMotion ? 14 : 24 }, (_, i) => ({
      i,
      left: rng() * 100,
      top: rng() * 95,
      size: 4 + Math.round(rng() * 6),
      duration: 9 + rng() * 9,
      delay: -rng() * 18,
      drift: Math.round((rng() - 0.5) * 70),
      opacity: 0.55 + rng() * 0.4,
    }));
  }, [reducedMotion]);

  return (
    <div className={`rg-snow ${reducedMotion ? "is-still" : ""}`} aria-hidden="true">
      {flakes.map((f) => (
        <i
          key={f.i}
          style={
            {
              left: `${f.left}%`,
              top: reducedMotion ? `${f.top}%` : undefined,
              width: f.size,
              height: f.size,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--rg-drift": `${f.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
