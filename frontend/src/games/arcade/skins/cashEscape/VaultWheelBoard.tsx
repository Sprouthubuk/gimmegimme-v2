import { useEffect, useMemo, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { generateWheel, WHEEL_SEGMENTS, type WheelSegment } from "../../games/generators";
import { useWheelSpin } from "../../games/wheel/useWheelSpin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound, useSoundLater } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "../shared/themed.css";
import "./cashEscape.css";

/**
 * The Great Cash Escape, a skin of Spin the Wheel. The wheel is a steel vault
 * door studded with gold bolts, under a red alarm siren. Spin it to crack the
 * vault. The segments, and the one it stops on, come from generateWheel exactly
 * as the classic wheel shows them; the door only bursts open on a win.
 */

const SEG = 360 / WHEEL_SEGMENTS;
const R = 80; // segment radius inside the steel rim
const SPIN_MS = 5200;

const FILL: Record<WheelSegment["tone"], string> = { yellow: "url(#rg-ce-gold)", cyan: "url(#rg-ce-blue)", pink: "url(#rg-ce-pink)", white: "url(#rg-ce-steel-dark)" };
const INK: Record<WheelSegment["tone"], string> = { yellow: "#141414", cyan: "#141414", pink: "#ffffff", white: "#c9d2e6" };

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};

/** How wide a label may be: the slice's width where the label sits, less a little breathing room. */
const LABEL_ROOM = 2 * (R - 21) * Math.sin(Math.PI / WHEEL_SEGMENTS) - 4;
/** Roughly how wide each character is, as a share of the font size (the display font, measured). */
const CHAR_EM = 0.6;
/**
 * Fits a prize label inside its slice so neighbouring labels never run into each other:
 * short amounts stay big, longer ones shrink, and a long name splits over two lines.
 */
function fitLabel(label: string): { lines: string[]; size: number } {
  const fit = (lines: string[], max: number) => Math.min(max, LABEL_ROOM / (CHAR_EM * Math.max(...lines.map((l) => l.length))));
  if (label.length <= 5 || !label.includes(" ")) {
    const text = label.length > 9 ? `${label.slice(0, 8)}…` : label;
    return { lines: [text], size: fit([text], 15) };
  }
  const words = label.split(" ");
  let best = [label];
  for (let k = 1; k < words.length; k++) {
    const pair = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    if (Math.max(...pair.map((l) => l.length)) < Math.max(...best.map((l) => l.length))) best = pair;
  }
  const lines = best.map((l) => (l.length > 9 ? `${l.slice(0, 8)}…` : l));
  return { lines, size: fit(lines, 10) };
}

function wedge(i: number) {
  const [x1, y1] = polar(i * SEG - SEG / 2, R);
  const [x2, y2] = polar(i * SEG + SEG / 2, R);
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/** "THE GREAT CASH ESCAPE": gold CASH, neon-pink ESCAPE. */
function Title() {
  return (
    <svg viewBox="0 0 320 96" className="rg-themed-sign rg-ce-title" role="img" aria-label="The Great Cash Escape">
      <defs>
        <linearGradient id="rg-ce-title-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.5" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
      </defs>
      <text x="160" y="18" textAnchor="middle" className="rg-ce-title-small">THE GREAT</text>
      <text x="160" y="58" textAnchor="middle" className="rg-ce-title-cash">CASH</text>
      <text x="160" y="90" textAnchor="middle" className="rg-ce-title-escape">ESCAPE</text>
    </svg>
  );
}

/** A red alarm siren: the wheel's pointer. It spins its light while the vault turns. */
function Siren() {
  return (
    <svg viewBox="0 0 60 70" aria-hidden="true">
      <path d="M30 68 L20 50 H40 Z" fill="url(#rg-ce-steel)" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <rect x="10" y="40" width="40" height="11" rx="3" fill="url(#rg-ce-steel)" stroke="#141414" strokeWidth="3" />
      <path d="M14 41 V24 C14 4 46 4 46 24 V41 Z" fill="url(#rg-ce-siren)" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <path className="rg-ce-siren-beam" d="M22 18 C24 12 30 10 34 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M18 34 H42" stroke="#7a0a12" strokeWidth="2" />
    </svg>
  );
}

export function VaultWheelBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateWheel(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { phase, rotation, spin, transition, landed } = useWheelSpin(layout, seed, reducedMotion, onReveal, { spinMs: SPIN_MS, turns: 7, holdMs: 1600 });
  const won = phase === "landed" && landed.kind === "prize";
  const later = useSoundLater();

  useEffect(() => {
    if (phase === "spinning") playSound("creak");
    if (phase === "landed" && landed.kind === "prize") {
      playSound("alarm");
      later("chime", 350);
    }
  }, [phase, landed.kind, later]);

  const crack = () => {
    if (phase !== "ready") return;
    if (!reducedMotion) navigator.vibrate?.(16);
    spin();
  };

  const bolts = Array.from({ length: 24 }, (_, i) => i * 15);
  const rays = Array.from({ length: 12 }, (_, i) => i);

  return (
    <>
      <div className={`rg-ce is-${phase} ${won ? "is-won" : ""}`}>
        <div className="rg-ce-rays" aria-hidden="true">
          {rays.map((i) => (
            <i key={i} className={i % 2 ? "is-blue" : "is-pink"} style={{ "--r": `${i * 30}deg` } as CSSProperties} />
          ))}
        </div>
        <span className="rg-ce-chain is-left" aria-hidden="true" />
        <span className="rg-ce-chain is-right" aria-hidden="true" />
        <Title />

        <div className="rg-ce-vault">
          <div className="rg-ce-siren" aria-hidden="true">
            <span className="rg-ce-siren-glow" />
            <Siren />
          </div>
          <svg className="rg-ce-svg" viewBox="-110 -110 220 220" role="img" aria-label={phase === "landed" ? `Landed on ${landed.kind === "none" ? "no win" : landed.label}` : "Vault wheel"}>
            <defs>
              <radialGradient id="rg-ce-steel" cx="0.35" cy="0.3" r="0.9">
                <stop offset="0" stopColor="#f4f7fc" />
                <stop offset="0.45" stopColor="#a9b3c6" />
                <stop offset="1" stopColor="#4a5468" />
              </radialGradient>
              <linearGradient id="rg-ce-steel-dark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4a5468" />
                <stop offset="1" stopColor="#262c3a" />
              </linearGradient>
              <radialGradient id="rg-ce-gold" cx="0.5" cy="0.2" r="0.9">
                <stop offset="0" stopColor="#fff6c2" />
                <stop offset="0.5" stopColor="#ffcc33" />
                <stop offset="1" stopColor="#d18f00" />
              </radialGradient>
              <radialGradient id="rg-ce-blue" cx="0.5" cy="0.2" r="0.9">
                <stop offset="0" stopColor="#c8f4ff" />
                <stop offset="0.5" stopColor="#2ad4ff" />
                <stop offset="1" stopColor="#0a7ab8" />
              </radialGradient>
              <radialGradient id="rg-ce-pink" cx="0.5" cy="0.2" r="0.9">
                <stop offset="0" stopColor="#ffb8dc" />
                <stop offset="0.5" stopColor="#ff2d95" />
                <stop offset="1" stopColor="#b3005e" />
              </radialGradient>
              <radialGradient id="rg-ce-siren" cx="0.35" cy="0.3" r="0.8">
                <stop offset="0" stopColor="#ffb0b0" />
                <stop offset="0.5" stopColor="#ff2a3a" />
                <stop offset="1" stopColor="#a3101c" />
              </radialGradient>
              <radialGradient id="rg-ce-bolt" cx="0.35" cy="0.3" r="0.8">
                <stop offset="0" stopColor="#fff6c2" />
                <stop offset="0.5" stopColor="#ffcc33" />
                <stop offset="1" stopColor="#b37800" />
              </radialGradient>
            </defs>

            {/* The door frame and its steel rim with gold bolts. The bolts slide out when the vault opens. */}
            <circle r="106" fill="#1b2030" stroke="#141414" strokeWidth="3" />
            <circle r="101" fill="url(#rg-ce-steel)" stroke="#141414" strokeWidth="2.5" />
            <circle r="90" fill="none" stroke="#5a6478" strokeWidth="1.5" />
            {bolts.map((deg, i) => {
              const [x, y] = polar(deg, 95.5);
              return (
                <g key={i} className="rg-ce-bolt" style={{ "--bx": `${(x / 95.5) * 6}px`, "--by": `${(y / 95.5) * 6}px` } as CSSProperties}>
                  <circle cx={x} cy={y} r="4.3" fill="url(#rg-ce-bolt)" stroke="#141414" strokeWidth="1.4" />
                  <path d={`M${x - 2} ${y} H${x + 2}`} stroke="#8a5a00" strokeWidth="1.2" />
                </g>
              );
            })}

            <g className="rg-ce-rotor" style={{ transform: `rotate(${rotation}deg)`, transition }}>
              <circle r={R + 3} fill="#141414" />
              {layout.segments.map((s, i) => {
                const hit = phase === "landed" && i === layout.target;
                return (
                  <g key={i}>
                    <path d={wedge(i)} fill={FILL[s.tone]} stroke="#141414" strokeWidth="1" className={hit ? "rg-ce-hit" : ""} />
                    <g transform={`rotate(${i * SEG}) translate(0 ${-R + 21})`}>
                      {s.kind === "none" ? (
                        <text className="rg-ce-seg-text is-none" fill={INK.white} textAnchor="middle">
                          <tspan x="0" dy="-2">NO</tspan>
                          <tspan x="0" dy="8.5">WIN</tspan>
                        </text>
                      ) : (
                        (() => {
                          const { lines, size } = fitLabel(s.label);
                          return (
                            <text className="rg-ce-seg-text" fill={INK[s.tone]} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: `${size.toFixed(2)}px` }}>
                              {lines.length === 1
                                ? lines[0]
                                : lines.map((l, k) => (
                                    <tspan key={k} x="0" dy={k === 0 ? `${-size * 0.55}` : `${size * 1.1}`}>
                                      {l}
                                    </tspan>
                                  ))}
                            </text>
                          );
                        })()
                      )}
                    </g>
                  </g>
                );
              })}
              <circle r={R} fill="none" stroke="#141414" strokeWidth="3" />
              {/* The vault's spoked handle turns with the door. */}
              <g className="rg-ce-handle">
                {[0, 60, 120].map((deg) => (
                  <g key={deg} transform={`rotate(${deg})`}>
                    <rect x="-3.5" y="-40" width="7" height="80" rx="3.5" fill="url(#rg-ce-steel)" stroke="#141414" strokeWidth="2" />
                    <circle cy="-40" r="5.5" fill="url(#rg-ce-bolt)" stroke="#141414" strokeWidth="2" />
                    <circle cy="40" r="5.5" fill="url(#rg-ce-bolt)" stroke="#141414" strokeWidth="2" />
                  </g>
                ))}
              </g>
            </g>
            <g className="rg-ce-hub">
              <circle r="21" fill="url(#rg-ce-steel)" stroke="#141414" strokeWidth="3" />
              <circle r="14" fill="url(#rg-ce-bolt)" stroke="#141414" strokeWidth="2.5" />
              <text y="1" textAnchor="middle" dominantBaseline="middle" className="rg-ce-hub-text">£</text>
            </g>
          </svg>

          {/* Glow behind the door when it opens on a win, and the cash escaping. */}
          {won && <span className="rg-ce-burst-glow" aria-hidden="true" />}
          {won && !reducedMotion && (
            <div className="rg-ce-cash" aria-hidden="true">
              {Array.from({ length: 22 }, (_, k) => (
                <i
                  key={k}
                  className={k % 4 === 0 ? "is-coin" : "is-note"}
                  style={{ "--a": `${(k * 360) / 22 + ((k * 7) % 11)}deg`, "--d": `${130 + ((k * 41) % 80)}px`, "--r": `${((k * 67) % 540) - 270}deg`, "--w": `${(k % 5) * 0.06}s` } as CSSProperties}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {phase === "ready" ? (
        <div className="rg-ce-controls">
          <button type="button" className="rg-btn rg-btn-yellow rg-ce-spin" onClick={crack}>
            CRACK THE VAULT
          </button>
          <p className="rg-note">{RESULT_SET_NOTE}</p>
        </div>
      ) : (
        <div className="rg-ce-controls">
          <GamePrompt title={phase === "spinning" ? "Cracking the vault…" : landed.kind === "none" ? "No win" : `${landed.label}!`} tone={phase === "landed" && landed.kind === "none" ? "ink" : "pink"} />
          {phase === "spinning" && (
            <button type="button" className="rg-btn rg-btn-yellow rg-ce-spin" disabled>
              CRACK THE VAULT
            </button>
          )}
        </div>
      )}
      <SoundToggle />
    </>
  );
}
