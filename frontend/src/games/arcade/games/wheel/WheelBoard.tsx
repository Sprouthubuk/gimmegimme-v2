import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "../types";
import { generateWheel, WHEEL_SEGMENTS } from "../generators";
import { createRng } from "../../rng";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./wheel.css";

const SEG = 360 / WHEEL_SEGMENTS;
const R = 86; // segment radius inside the rim
const SPIN_MS = 4600;

const FILL = { yellow: "#ffe11a", cyan: "#1fc4f4", pink: "#ff2d95", white: "#ffffff" } as const;
const INK = { yellow: "#141414", cyan: "#141414", pink: "#ffffff", white: "#ff2d95" } as const;

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};

function wedge(i: number) {
  const [x1, y1] = polar(i * SEG - SEG / 2, R);
  const [x2, y2] = polar(i * SEG + SEG / 2, R);
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

type Phase = "ready" | "spinning" | "landed";

export function WheelBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateWheel(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [rotation, setRotation] = useState(0);

  // Land somewhere inside the target segment, not dead centre every time.
  const finalRotation = useMemo(() => {
    const rng = createRng(`wheel-land:${seed}`);
    const jitter = (rng() - 0.5) * SEG * 0.6;
    return 360 * 6 - layout.target * SEG + jitter;
  }, [seed, layout.target]);

  const spin = () => {
    if (phase !== "ready") return;
    // The wheel is already painted at 0°, so this runs the CSS transition.
    setPhase("spinning");
    setRotation(finalRotation);
  };

  useEffect(() => {
    if (phase !== "spinning") return;
    const t1 = setTimeout(() => setPhase("landed"), reducedMotion ? 250 : SPIN_MS + 100);
    return () => clearTimeout(t1);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : 900);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion]);

  const bulbs = Array.from({ length: 24 }, (_, i) => polar(i * 15, 94));

  return (
    <>
      <div className={`rg-wheel is-${phase}`}>
        <div className="rg-wheel-pointer" aria-hidden="true">
          <svg viewBox="0 0 40 50">
            <path d="M20 48 C8 30 3 24 3 17 a17 17 0 0 1 34 0 c0 7 -5 13 -17 31z" fill="#ffe11a" stroke="#141414" strokeWidth="3.5" />
            <ellipse cx="14" cy="12" rx="5" ry="3.5" fill="#fff" opacity="0.8" />
          </svg>
        </div>
        <svg className="rg-wheel-svg" viewBox="-100 -100 200 200" role="img" aria-label={phase === "landed" ? `Landed on ${layout.segments[layout.target].label}` : "Prize wheel"}>
          <circle r="99" fill="#ff2d95" stroke="#141414" strokeWidth="3" />
          {bulbs.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.3" fill={i % 2 ? "#fff" : "#ffe11a"} stroke="#141414" strokeWidth="1.3" className="rg-wheel-bulb" style={{ animationDelay: `${(i % 2) * 0.35}s` }} />
          ))}
          <g
            className="rg-wheel-rotor"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: phase === "spinning" && !reducedMotion ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)` : "none",
            }}
          >
            <circle r={R + 1} fill="#141414" />
            {layout.segments.map((s, i) => {
              const won = phase === "landed" && i === layout.target;
              return (
                <g key={i}>
                  <path d={wedge(i)} fill={FILL[s.tone]} stroke="#141414" strokeWidth="0.8" className={won ? "rg-wheel-won" : ""} />
                  <g transform={`rotate(${i * SEG}) translate(0 ${-R + 22})`}>
                    {s.kind === "none" ? (
                      <text className="rg-wheel-text is-none" fill={INK.white} textAnchor="middle">
                        <tspan x="0" dy="-2">NO</tspan>
                        <tspan x="0" dy="8.5">WIN</tspan>
                      </text>
                    ) : (
                      <text className={`rg-wheel-text ${s.label.length > 5 ? "is-long" : ""}`} fill={INK[s.tone]} textAnchor="middle" dominantBaseline="middle">
                        {s.label.length > 9 ? `${s.label.slice(0, 8)}…` : s.label}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
            <circle r={R} fill="none" stroke="#141414" strokeWidth="3" />
          </g>
          <g className="rg-wheel-hub">
            <circle r="24" fill="#141414" />
            <circle r="21" fill="#ffe11a" />
            <ellipse cx="-7" cy="-5" rx="3" ry="5" fill="#141414" />
            <ellipse cx="7" cy="-5" rx="3" ry="5" fill="#141414" />
            <path d="M-11 5 q11 12 22 0" fill="none" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      </div>
      {phase === "ready" ? (
        <div className="rg-wheel-controls">
          <button type="button" className="rg-btn rg-btn-yellow" onClick={spin}>
            SPIN
          </button>
          <p className="rg-note">{RESULT_SET_NOTE}</p>
        </div>
      ) : (
        <div className="rg-wheel-controls">
          <GamePrompt title={phase === "spinning" ? "Spinning…" : layout.segments[layout.target].kind === "none" ? "No win" : `${layout.segments[layout.target].label}!`} tone="pink" />
          {phase === "spinning" && (
            <button type="button" className="rg-btn rg-btn-yellow" disabled>
              SPIN
            </button>
          )}
        </div>
      )}
    </>
  );
}
