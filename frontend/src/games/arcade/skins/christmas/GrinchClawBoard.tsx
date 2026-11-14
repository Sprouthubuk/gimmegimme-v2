import { useEffect, useState, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { winLabel } from "../../games/symbols";
import { CHUTE_X, useClaw, type ClawItem } from "../../games/claw/useClaw";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { Splash } from "../../shell/Splash";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "../../games/claw/claw.css";
import "./grinch.css";

/**
 * Christmas skin of the Claw Machine: Demi's Grinchmas Gold. A red-velvet,
 * fur-trimmed cabinet full of glass baubles on a snowy night. Steer the claw,
 * grab a bauble, and it cracks open on what is inside. The controls and the
 * sequence are the classic claw's (useClaw); every bauble holds this ticket's
 * result, so steering and which bauble is picked are only for fun.
 */

type Tone = "red" | "green" | "gold" | "silver";
const TONES: Tone[] = ["red", "green", "gold", "silver"];

/** Bauble centres as % of the glass, the same places as the classic capsules. Later rows sit on top. */
const PILE: (ClawItem & { tone: Tone; turn: number })[] = [
  ...[8, 24, 40, 56, 72, 88].map((x, i) => ({ x, y: 86, tone: TONES[i % 4], turn: ((i * 13) % 21) - 10 })),
  ...[16, 32, 48, 64, 80].map((x, i) => ({ x, y: 73, tone: TONES[(i + 2) % 4], turn: ((i * 17) % 23) - 11 })),
  ...[24, 40, 56, 72].map((x, i) => ({ x, y: 60, tone: TONES[(i + 1) % 4], turn: ((i * 11) % 19) - 9 })),
  ...[33, 50, 66].map((x, i) => ({ x, y: 48, tone: TONES[(i + 3) % 4], turn: ((i * 7) % 15) - 7 })),
];

/** A glass bauble: cap and loop, two halves that come apart when it opens. Gradients are in GrinchDefs. */
function Bauble({ tone, open = false, turn = 0 }: { tone: Tone; open?: boolean; turn?: number }) {
  const fill = `url(#rg-grinch-${tone})`;
  return (
    <svg viewBox="0 0 60 64" className={`rg-bauble ${open ? "is-open" : ""}`} style={{ rotate: `${turn}deg` }} aria-hidden="true">
      <g className="rg-bauble-l">
        <path d="M30 14 A24 24 0 0 0 30 62 Z" fill={fill} />
        <path d="M8 42 Q18 48 30 49" stroke="#141414" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <path d="M8 42 Q18 48 30 49" stroke="#ffd23f" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="33" r="2.4" fill="#fff6c9" stroke="#141414" strokeWidth="1.2" />
        <ellipse cx="20" cy="26" rx="4.5" ry="7" fill="#fff" opacity="0.55" transform="rotate(35 20 26)" />
        <path className="rg-bauble-cut" d="M30 15 V61" stroke="rgba(20,20,20,0.45)" strokeWidth="2" />
        <path d="M30 14 A24 24 0 0 0 30 62" fill="none" stroke="#141414" strokeWidth="3" />
      </g>
      <g className="rg-bauble-r">
        <path d="M30 14 A24 24 0 0 1 30 62 Z" fill={fill} />
        <path d="M30 49 Q42 48 52 42" stroke="#141414" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <path d="M30 49 Q42 48 52 42" stroke="#ffd23f" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="44" cy="33" r="2.4" fill="#fff6c9" stroke="#141414" strokeWidth="1.2" />
        <circle cx="37" cy="25" r="1.8" fill="#fff6c9" stroke="#141414" strokeWidth="1" />
        <path className="rg-bauble-cut" d="M30 15 V61" stroke="rgba(20,20,20,0.45)" strokeWidth="2" />
        <path d="M30 14 A24 24 0 0 1 30 62" fill="none" stroke="#141414" strokeWidth="3" />
      </g>
      <g className="rg-bauble-cap">
        <circle cx="30" cy="4.5" r="3.2" fill="none" stroke="#141414" strokeWidth="2.4" />
        <rect x="23" y="7" width="14" height="9" rx="2" fill="url(#rg-grinch-cap)" stroke="#141414" strokeWidth="2.4" />
        <path d="M26 9 V14 M30 9 V14 M34 9 V14" stroke="#9a6a00" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/** Gradients and the fur effect, defined once per board. */
function GrinchDefs() {
  const ball = (id: Tone, light: string, main: string, dark: string) => (
    <radialGradient id={`rg-grinch-${id}`} gradientUnits="userSpaceOnUse" cx="22" cy="30" r="34">
      <stop offset="0" stopColor={light} />
      <stop offset="0.45" stopColor={main} />
      <stop offset="1" stopColor={dark} />
    </radialGradient>
  );
  return (
    <svg className="rg-grinch-defs" aria-hidden="true" focusable="false">
      <defs>
        {ball("red", "#ff9aa4", "#e0283a", "#7d0c18")}
        {ball("green", "#b8f57a", "#5cc02a", "#1f6a14")}
        {ball("gold", "#fff6c2", "#ffd23f", "#b87800")}
        {ball("silver", "#ffffff", "#c9d6ea", "#6f7f9c")}
        <linearGradient id="rg-grinch-cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="1" stopColor="#d99a00" />
        </linearGradient>
        <linearGradient id="rg-grinch-green-text" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6ff8a" />
          <stop offset="0.5" stopColor="#9bdc28" />
          <stop offset="1" stopColor="#4c9a12" />
        </linearGradient>
        <linearGradient id="rg-grinch-gold-text" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8cf" />
          <stop offset="0.45" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#d98a00" />
        </linearGradient>
        {/* Roughens the green letters' edges so they read as fur. */}
        <filter id="rg-grinch-fur" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" />
        </filter>
      </defs>
    </svg>
  );
}

/** "DEMI'S GRINCHMAS GOLD": furry green lettering over gold, under a red plaque. */
function GrinchSign() {
  return (
    <svg viewBox="0 0 320 106" className="rg-grinch-sign" role="img" aria-label="Demi's Grinchmas Gold">
      <rect x="108" y="3" width="104" height="26" rx="9" fill="#b3122a" stroke="#141414" strokeWidth="3.5" />
      <rect x="113" y="7" width="94" height="18" rx="6" fill="none" stroke="#ffd23f" strokeWidth="1.6" />
      <path d="M112 5 C130 0 190 0 208 5" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
      <text x="160" y="23" textAnchor="middle" className="rg-grinch-sign-small">DEMI'S</text>
      <text x="160" y="68" textAnchor="middle" className="rg-grinch-sign-green">GRINCHMAS</text>
      <text x="160" y="102" textAnchor="middle" className="rg-grinch-sign-gold">GOLD</text>
    </svg>
  );
}

/** A little snowy pine at the back of the glass. */
function Pine({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`rg-grinch-pine is-${side}`} viewBox="0 0 40 60" aria-hidden="true">
      <path d="M20 2 L34 22 H27 L37 38 H28 L38 54 H2 L12 38 H3 L13 22 H6 Z" fill="#1b5e3a" stroke="#0d2a1c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 22 H27 M12 38 H28" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      <rect x="17" y="54" width="6" height="5" fill="#5b3a1c" />
    </svg>
  );
}

export function GrinchClawBoard({ ticket, reducedMotion, onReveal }: BoardProps) {
  const label = winLabel(ticket.prize);
  const { x, phase, target, tilt, swing, glassRef, move, startHold, stopHold, grab, onGlassPointer, jostled, carrying, released, len, closed } = useClaw(PILE, reducedMotion, onReveal, 2200);
  const held = target != null ? PILE[target] : null;
  /** Centre stage, the bauble lands and wobbles before it cracks open. */
  const [cracked, setCracked] = useState(false);
  useEffect(() => {
    if (phase !== "open") return;
    const t = window.setTimeout(() => setCracked(true), reducedMotion ? 0 : 650);
    return () => window.clearTimeout(t);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase === "close") playSound("bells");
    if (phase === "drop" && !reducedMotion) navigator.vibrate?.(18);
    if (phase !== "open") return;
    // The bauble lands centre stage, wobbles, then cracks open.
    const t1 = window.setTimeout(() => playSound("crack"), reducedMotion ? 0 : 650);
    if (!label) return () => window.clearTimeout(t1);
    const t2 = window.setTimeout(() => {
      playSound("chime");
      playSound("clink");
      if (!reducedMotion) navigator.vibrate?.([30, 40, 60]);
    }, reducedMotion ? 0 : 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase, label, reducedMotion]);

  const press = () => {
    if (phase === "aim" && !reducedMotion) navigator.vibrate?.(12);
    grab();
  };

  return (
    <>
      <GrinchDefs />
      <div className={`rg-claw-machine rg-grinch is-${phase} ${label ? "is-win" : "is-empty"}`}>
        <div className="rg-grinch-top">
          <div className="rg-xmas-lights" aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div>
          <GrinchSign />
        </div>
        <div className="rg-claw-glass rg-grinch-glass" ref={glassRef} onPointerDown={onGlassPointer} onPointerMove={onGlassPointer}>
          <span className="rg-grinch-moon" aria-hidden="true" />
          <Pine side="left" />
          <Pine side="right" />
          <span className="rg-grinch-drift" aria-hidden="true" />
          <div className="rg-claw-rail" />
          {PILE.map((c, i) =>
            i === target && (carrying || released) ? null : (
              <span key={i} className={`rg-capsule-slot rg-bauble-slot ${jostled(i) ? "is-jostled" : ""}`} style={{ left: `${c.x}%`, top: `${c.y}%`, zIndex: Math.round(c.y) }}>
                <Bauble tone={c.tone} turn={c.turn} />
              </span>
            ),
          )}
          {phase === "aim" && <span className="rg-claw-aim" style={{ left: `${x}%` }} aria-hidden="true" />}
          <div className="rg-claw-rig" style={{ left: `${x}%`, "--len": len, "--swing": swing } as CSSProperties}>
            <span className="rg-claw-carriage" />
            <span className="rg-claw-arm">
            <span className="rg-claw-cable" />
            <span className={`rg-claw-head ${closed ? "is-closed" : ""}`}>
              <svg viewBox="0 0 60 50" aria-hidden="true">
                <rect x="18" y="0" width="24" height="16" rx="7" fill="url(#rg-grinch-cap)" stroke="#141414" strokeWidth="3.5" />
                <path className="rg-prong is-left" d="M22 14 L8 34 L16 46" fill="none" stroke="#141414" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-left" d="M22 14 L8 34 L16 46" fill="none" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-right" d="M38 14 L52 34 L44 46" fill="none" stroke="#141414" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-right" d="M38 14 L52 34 L44 46" fill="none" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {held && carrying && (
                <span className="rg-claw-held">
                  <Bauble tone={held.tone} />
                </span>
              )}
            </span>
            </span>
          </div>
          {held && phase === "drop" && (
            <span className="rg-claw-falling" style={{ left: `${CHUTE_X}%` }} aria-hidden="true">
              <Bauble tone={held.tone} />
            </span>
          )}
          {held && phase === "open" && (
            <div className={`rg-claw-stage ${label ? "is-win" : "is-empty"}`}>
              <span className="rg-claw-stage-rays" aria-hidden="true" />
              <span className="rg-claw-stage-item">
                {cracked && label && <Splash reducedMotion={reducedMotion} className="rg-claw-stage-splash" size={1.15} />}
                <span className="rg-claw-stage-bauble">
                  <Bauble tone={held.tone} open={cracked} />
                </span>
                {cracked && (label ? <Coin label={label} tone="yellow" className="rg-claw-prize" /> : <span className="rg-claw-empty">Empty bauble</span>)}
              </span>
            </div>
          )}
        </div>
        <div className="rg-claw-panel rg-grinch-panel">
          <div className="rg-joystick" aria-label="Move the claw">
            <button
              type="button"
              className="rg-joy-btn is-left"
              aria-label="Move claw left"
              disabled={phase !== "aim"}
              onPointerDown={() => startHold(-1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && move(-8)}
            />
            <span className="rg-joy-stick" style={{ rotate: `${tilt * 18}deg` }} />
            <span className="rg-joy-base" />
            <button
              type="button"
              className="rg-joy-btn is-right"
              aria-label="Move claw right"
              disabled={phase !== "aim"}
              onPointerDown={() => startHold(1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && move(8)}
            />
          </div>
          <div className={`rg-claw-chute ${phase === "drop" ? "is-catching" : ""}`}>GOLD</div>
          <button type="button" className="rg-grab" onClick={press} disabled={phase !== "aim"}>
            GRAB
          </button>
        </div>
      </div>
      {phase === "aim" ? (
        <GamePrompt title="Steer, then press GRAB" sub={RESULT_SET_NOTE} />
      ) : phase === "open" && !cracked ? (
        <GamePrompt title="Cracking it open…" tone="cyan" />
      ) : phase === "open" ? (
        <GamePrompt title={label ? `${label}!` : "Empty bauble"} tone={label ? "pink" : "ink"} />
      ) : phase === "carry" || phase === "drop" ? (
        <GamePrompt title="Into the chute…" tone="cyan" />
      ) : carrying ? (
        <GamePrompt title="Got a bauble!" tone="cyan" sub="Lifting it out…" />
      ) : (
        <GamePrompt title="Grabbing…" tone="pink" />
      )}
      <SoundToggle />
    </>
  );
}
