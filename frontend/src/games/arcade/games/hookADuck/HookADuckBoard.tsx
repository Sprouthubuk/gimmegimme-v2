import { useEffect, useState } from "react";
import type { BoardProps } from "../types";
import { winLabel } from "../symbols";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { Scene3D } from "../../three/Scene3D";
import { buildDuckScene, type DuckState } from "../../three/duckScene";
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

export function Duck({ colour }: { colour: DuckColour }) {
  const [light, main] = COLOURS[colour];
  return (
    <svg viewBox="0 0 100 84" className="rg-duck-svg" aria-hidden="true">
      <circle cx="46" cy="8" r="6" fill="none" stroke="#141414" strokeWidth="3.5" />
      <path d="M8 50 Q2 34 16 36 Q30 40 40 46 Z" fill={main} stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M10 54 Q14 80 50 80 Q86 80 88 56 Q84 44 64 46 L34 46 Q14 44 10 54 Z" fill={light} stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M30 58 Q46 50 62 58 Q52 72 34 66 Z" fill={main} stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="54" cy="32" r="18" fill={light} stroke="#141414" strokeWidth="3.5" />
      <path d="M70 30 Q88 30 90 38 Q82 44 68 40 Z" fill="#ff8a1f" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="59" cy="27" r="4.5" fill="#141414" />
      <circle cx="60.5" cy="25.5" r="1.5" fill="#fff" />
      <path d="M46 16 L46 14" stroke="#141414" strokeWidth="3" />
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
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} fill={i % 2 ? "#ffffff" : "#ff2d95"} stroke="#141414" strokeWidth="3">
                <path d={`M${i * 50} 58 a25 25 0 0 0 50 0`} />
                <rect x={i * 50} y="-3" width="50" height="61" strokeWidth="0" />
              </g>
            ))}
            <line x1="0" x2="400" y1="58" y2="58" stroke="#141414" strokeWidth="3" />
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
  const state: DuckState = { phase, chosen, label, hook };

  return (
    <>
      <Scene3D
        state={state}
        setup={(ctx) => buildDuckScene(ctx)}
        seed={`duck:${ticket.ticketNumber}`}
        reducedMotion={reducedMotion}
        aspect={1.0}
        fallback={flat}
        label="Hook a duck stall"
      />
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
