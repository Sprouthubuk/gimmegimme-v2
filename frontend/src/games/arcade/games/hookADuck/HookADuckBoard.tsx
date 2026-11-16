import { useEffect, useState } from "react";
import type { BoardProps } from "../types";
import { winLabel } from "../symbols";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./hookADuck.css";

type DuckColour = "pink" | "yellow" | "cyan";
const COLOURS: Record<DuckColour, [string, string]> = {
  pink: ["#ff7cc3", "#ff2d95"],
  yellow: ["#fff59a", "#ffd000"],
  cyan: ["#8fe3ff", "#1fc4f4"],
};

// x/y are % of the stall; row 0 sits behind row 1.
const DUCKS: { x: number; y: number; colour: DuckColour; row: 0 | 1 }[] = [
  { x: 20, y: 47, colour: "pink", row: 0 },
  { x: 48, y: 47, colour: "yellow", row: 0 },
  { x: 77, y: 47, colour: "cyan", row: 0 },
  { x: 22, y: 67, colour: "yellow", row: 1 },
  { x: 50, y: 67, colour: "cyan", row: 1 },
  { x: 79, y: 67, colour: "pink", row: 1 },
];
const HOOK_REST = { x: 70, len: 26 };
const LIFT_Y = 30;

/** A rubber duck with soft shading; one gradient set per colour, shared by every duck on the board. */
export function Duck({ colour }: { colour: DuckColour }) {
  const [light, main] = COLOURS[colour];
  const g = `dk-${colour}`;
  return (
    <svg viewBox="0 0 100 84" className="rg-duck-svg" aria-hidden="true">
      <defs>
        <radialGradient id={`${g}-b`} cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor={light} />
          <stop offset="1" stopColor={main} />
        </radialGradient>
        <linearGradient id={`${g}-beak`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc06a" />
          <stop offset="1" stopColor="#f06a00" />
        </linearGradient>
      </defs>
      <circle cx="46" cy="8" r="6" fill="none" stroke="#c9ccd6" strokeWidth="3" />
      <path d="M8 50 Q2 34 16 36 Q30 40 40 46 Z" fill={main} />
      <path d="M10 54 Q14 80 50 80 Q86 80 88 56 Q84 44 64 46 L34 46 Q14 44 10 54 Z" fill={`url(#${g}-b)`} />
      <path d="M30 58 Q46 50 62 58 Q52 72 34 66 Z" fill={main} opacity="0.75" />
      <circle cx="54" cy="32" r="18" fill={`url(#${g}-b)`} />
      <path d="M70 30 Q88 30 90 38 Q82 44 68 40 Z" fill={`url(#${g}-beak)`} />
      <circle cx="59" cy="27" r="4.2" fill="#2b0f45" />
      <circle cx="60.4" cy="25.6" r="1.4" fill="#fff" />
      <ellipse cx="46" cy="24" rx="5" ry="3" fill="#fff" opacity="0.55" transform="rotate(-30 46 24)" />
    </svg>
  );
}

type Phase = "ready" | "hooking" | "lifting" | "tagged";

export function HookADuckBoard({ ticket, reducedMotion, onReveal }: BoardProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [chosen, setChosen] = useState<number | null>(null);
  const label = winLabel(ticket.prize);

  const hook = (i: number) => {
    if (phase !== "ready") return;
    setChosen(i);
    setPhase("hooking");
  };

  useEffect(() => {
    const ms = reducedMotion ? 120 : { ready: 0, hooking: 750, lifting: 950, tagged: 1300 }[phase];
    if (phase === "ready") return;
    const t = setTimeout(() => {
      if (phase === "hooking") setPhase("lifting");
      else if (phase === "lifting") setPhase("tagged");
      else onReveal();
    }, ms);
    return () => clearTimeout(t);
  }, [phase, reducedMotion, onReveal]);

  const duck = chosen != null ? DUCKS[chosen] : null;
  const lifted = phase === "lifting" || phase === "tagged";
  const hookX = duck ? duck.x : HOOK_REST.x;
  // The hook hangs from the awning (19%) down to the ring on the duck's head (~7.5% above its centre).
  const hookLen = !duck ? HOOK_REST.len : (lifted ? LIFT_Y : duck.y) - 26.5;

  const flat = (
    <>
      <div className={`rg-duck-stall is-${phase}`}>
        <div className="rg-awning">
          <svg viewBox="0 0 400 95" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="aw-pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6bbd" /><stop offset="1" stopColor="#c4006a" /></linearGradient>
              <linearGradient id="aw-white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e6dcef" /></linearGradient>
            </defs>
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} fill={i % 2 ? "url(#aw-white)" : "url(#aw-pink)"}>
                <path d={`M${i * 50} 58 a25 25 0 0 0 50 0`} />
                <rect x={i * 50} y="-3" width="50" height="61" strokeWidth="0" />
              </g>
            ))}
            <rect x="0" y="55" width="400" height="5" fill="#ffd34d" />
          </svg>
          <div className="rg-duck-sign">HOOK A DUCK</div>
        </div>
        <div className="rg-pole is-left" />
        <div className="rg-pole is-right" />
        <div className="rg-duck-wall" />
        <div className="rg-hook" style={{ left: `${hookX}%`, height: `${hookLen}%` }} aria-hidden="true">
          <span className="rg-hook-tip" />
        </div>
        {DUCKS.map((d, i) => {
          const isChosen = i === chosen;
          return (
            <button
              key={i}
              type="button"
              className={`rg-duck rg-duck-row${d.row} ${isChosen ? "is-chosen" : ""} ${isChosen && lifted ? "is-lifted" : ""}`}
              style={{ left: `${d.x}%`, top: `${isChosen && lifted ? LIFT_Y : d.y}%`, animationDelay: `${i * -0.37}s` }}
              onClick={() => hook(i)}
              disabled={phase !== "ready"}
              aria-label={`Hook the ${d.colour} duck`}
            >
              <Duck colour={d.colour} />
              {isChosen && phase === "tagged" && (
                <span className={`rg-duck-tag ${label ? "is-win" : ""}`}>{label ?? "No prize"}</span>
              )}
            </button>
          );
        })}
        <div className="rg-water rg-water-back" />
        <div className="rg-water rg-water-front">
          <span className="rg-ripple" />
          <span className="rg-ripple is-2" />
        </div>
      </div>
    </>
  );

  return (
    <>
      {flat}
      {phase === "ready" ? (
        <GamePrompt title="Tap a duck to hook it" sub={RESULT_SET_NOTE} />
      ) : phase === "tagged" ? (
        <GamePrompt title={label ? `${label}!` : "No prize underneath"} tone="pink" />
      ) : (
        <GamePrompt title="Hooked one!" tone="pink" sub="Checking underneath…" />
      )}
    </>
  );
}
