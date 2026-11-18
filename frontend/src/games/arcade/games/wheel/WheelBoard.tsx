import { useMemo } from "react";
import type { BoardProps } from "../types";
import { generateWheel, WHEEL_SEGMENTS } from "../generators";
import { useWheelSpin } from "./useWheelSpin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./wheel.css";

const SEG = 360 / WHEEL_SEGMENTS;
const R = 92; // segment radius inside the rim
const SPIN_MS = 4600;

/** Each tone is a shaded wedge (light at the hub, deep at the rim) with its own label colour. */
const TONE = {
  yellow: { id: "gold", ink: "#3a1d00" },
  cyan: { id: "cyan", ink: "#032a3a" },
  pink: { id: "pink", ink: "#ffffff" },
  white: { id: "plum", ink: "#e9dcff" },
} as const;

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};

function wedge(i: number, r = R) {
  const [x1, y1] = polar(i * SEG - SEG / 2, r);
  const [x2, y2] = polar(i * SEG + SEG / 2, r);
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export function WheelDefs() {
  return (
    <defs>
      {(
        [
          ["gold", "#fff3a6", "#ffc928", "#e08a00"],
          ["cyan", "#c9f7ff", "#38d4ff", "#0a7fb8"],
          ["pink", "#ffb3dc", "#ff3ea4", "#b40866"],
          ["plum", "#7b55c9", "#3d2378", "#211046"],
        ] as const
      ).map(([id, a, b, c]) => (
        <radialGradient key={id} id={`wh-${id}`} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
          <stop offset="0.15" stopColor={a} />
          <stop offset="0.6" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </radialGradient>
      ))}
      <linearGradient id="wh-rim" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4b0" />
        <stop offset="0.35" stopColor="#f7c227" />
        <stop offset="0.7" stopColor="#c27c00" />
        <stop offset="1" stopColor="#ffe27a" />
      </linearGradient>
      <linearGradient id="wh-rim-in" x1="0" y1="1" x2="0" y2="-1">
        <stop offset="0" stopColor="#fff4b0" />
        <stop offset="0.5" stopColor="#d89200" />
        <stop offset="1" stopColor="#8a5200" />
      </linearGradient>
      <radialGradient id="wh-bulb">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#fff6c4" />
        <stop offset="1" stopColor="#ffd34d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="wh-hub" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#ff9fd4" />
        <stop offset="0.5" stopColor="#ff2d95" />
        <stop offset="1" stopColor="#a1065a" />
      </radialGradient>
      <radialGradient id="wh-shine" cx="0.5" cy="0" r="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
        <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="wh-stand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3b1560" />
        <stop offset="0.5" stopColor="#7a2bb0" />
        <stop offset="1" stopColor="#3b1560" />
      </linearGradient>
      <filter id="wh-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

export function WheelBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateWheel(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { phase, rotation, spin, transition } = useWheelSpin(layout, seed, reducedMotion, onReveal, { spinMs: SPIN_MS });
  const landed = layout.segments[layout.target];

  const bulbs = Array.from({ length: 24 }, (_, i) => polar(i * 15 + 7.5, 104));
  const pegs = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => polar(i * SEG + SEG / 2, R - 3));

  return (
    <>
      <div className={`rg-wheel is-${phase}`}>
        <svg className="rg-wheel-svg" viewBox="-122 -126 244 290" role="img" aria-label={phase === "landed" ? `Landed on ${landed.label}` : "Prize wheel"}>
          <WheelDefs />
          {/* Stand */}
          <g filter="url(#wh-soft)">
            <path d="M-34 96 L34 96 L58 150 L-58 150Z" fill="url(#wh-stand)" />
            <path d="M-34 96 L34 96 L38 106 L-38 106Z" fill="#ffffff" opacity="0.15" />
            <rect x="-74" y="146" width="148" height="14" rx="7" fill="url(#wh-rim)" />
          </g>
          {/* Rim */}
          <g filter="url(#wh-soft)">
            <circle r="113" fill="url(#wh-rim)" />
            <circle r="104" fill="#2a0c3a" />
            <circle r="102" fill="url(#wh-rim-in)" />
          </g>
          <g className="rg-wheel-bulbs">
            {bulbs.map(([x, y], i) => (
              <g key={i} className={`rg-wheel-bulb ${i % 2 ? "is-b" : ""}`}>
                <circle cx={x} cy={y} r="7.5" fill="url(#wh-bulb)" />
                <circle cx={x} cy={y} r="2.6" fill="#fffbe6" />
              </g>
            ))}
          </g>
          <g className="rg-wheel-rotor" style={{ transform: `rotate(${rotation}deg)`, transition }}>
            {layout.segments.map((s, i) => {
              const tone = TONE[s.tone];
              const won = phase === "landed" && i === layout.target;
              return (
                <g key={i}>
                  <path d={wedge(i)} fill={`url(#wh-${tone.id})`} />
                  {won && <path d={wedge(i)} className="rg-wheel-won" fill="#ffffff" />}
                  <g transform={`rotate(${i * SEG}) translate(0 ${-R + 26})`}>
                    {s.kind === "none" ? (
                      <text className="rg-wheel-label is-none" fill={tone.ink} textAnchor="middle">
                        <tspan x="0" dy="-1">NO</tspan>
                        <tspan x="0" dy="9">WIN</tspan>
                      </text>
                    ) : (
                      <text className={`rg-wheel-label ${s.label.length > 4 ? "is-long" : ""}`} fill={tone.ink} textAnchor="middle" dominantBaseline="middle">
                        {s.label.length > 9 ? `${s.label.slice(0, 8)}…` : s.label}
                      </text>
                    )}
                  </g>
                  <line x1="0" y1="0" x2={polar(i * SEG + SEG / 2, R)[0]} y2={polar(i * SEG + SEG / 2, R)[1]} stroke="#ffe27a" strokeWidth="1.4" opacity="0.9" />
                </g>
              );
            })}
            {pegs.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.6" fill="url(#wh-rim)" stroke="#7a4a00" strokeWidth="0.6" />
            ))}
            <circle r={R} fill="url(#wh-shine)" pointerEvents="none" />
          </g>
          {/* Hub */}
          <g className="rg-wheel-hub">
            <circle r="25" fill="url(#wh-rim)" />
            <circle r="20" fill="url(#wh-hub)" />
            <ellipse cx="-6.5" cy="-4" rx="2.6" ry="4.2" fill="#2a0016" />
            <ellipse cx="6.5" cy="-4" rx="2.6" ry="4.2" fill="#2a0016" />
            <path d="M-9.5 4.5 q9.5 10 19 0" fill="none" stroke="#2a0016" strokeWidth="2.6" strokeLinecap="round" />
            <ellipse cx="-7" cy="-12" rx="7" ry="3.5" fill="#fff" opacity="0.45" />
          </g>
          {/* Pointer: a jewel on a gold mount, with a flapper that ticks as pegs pass */}
          <g className="rg-wheel-pointer">
            <path d="M0 -84 L-13 -118 Q0 -128 13 -118Z" fill="url(#wh-rim)" stroke="#8a5200" strokeWidth="1.2" />
            <circle cy="-115" r="7" fill="url(#wh-hub)" stroke="#fff4b0" strokeWidth="1.6" />
            <ellipse cx="-2" cy="-117.5" rx="2.6" ry="1.6" fill="#fff" opacity="0.8" />
          </g>
        </svg>
      </div>
      <div className="rg-wheel-controls">
        {phase === "ready" ? (
          <>
            <button type="button" className="rg-cta" onClick={spin}>
              SPIN
            </button>
            <p className="rg-note">{RESULT_SET_NOTE}</p>
          </>
        ) : (
          <GamePrompt title={phase === "spinning" ? "Spinning…" : landed.kind === "none" ? "No win" : `${landed.label}!`} tone="pink" />
        )}
      </div>
    </>
  );
}
