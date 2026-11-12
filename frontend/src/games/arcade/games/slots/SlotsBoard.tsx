import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "../types";
import { generateSlots, type SlotSymbol } from "../generators";
import { Mascot } from "../../shell/Mascot";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./slots.css";

const NAMES: Record<SlotSymbol, string> = { coin: "£", seven: "7", bar: "BAR", star: "star", diamond: "gem", smile: "smiley" };

export function SlotIcon({ symbol }: { symbol: SlotSymbol }) {
  switch (symbol) {
    case "coin":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <circle cx="30" cy="30" r="25" fill="#ffe11a" stroke="#141414" strokeWidth="4" />
          <circle cx="30" cy="30" r="17" fill="none" stroke="#f2b400" strokeWidth="3" />
          <text x="30" y="31" textAnchor="middle" dominantBaseline="middle" className="rg-slot-glyph">£</text>
        </svg>
      );
    case "seven":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <path d="M14 10 H48 V20 L30 52 H17 L34 21 H14 Z" fill="#ff2d95" stroke="#141414" strokeWidth="4" strokeLinejoin="round" />
        </svg>
      );
    case "bar":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <rect x="4" y="17" width="52" height="26" rx="7" fill="#141414" stroke="#ffe11a" strokeWidth="3" />
          <text x="30" y="31" textAnchor="middle" dominantBaseline="middle" className="rg-slot-bar">BAR</text>
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <path d="M30 5 L37 22 L55 23 L41 35 L46 53 L30 43 L14 53 L19 35 L5 23 L23 22 Z" fill="#ffe11a" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <path d="M8 22 L18 10 H42 L52 22 L30 52 Z" fill="#1fc4f4" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M8 22 H52 M18 10 L24 22 L30 52 L36 22 L42 10" fill="none" stroke="#141414" strokeWidth="2" strokeLinejoin="round" />
          <path d="M20 14 L24 20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "smile":
      return <Mascot mood="smile" className="rg-slot-icon" />;
  }
}

type Phase = "ready" | "spinning" | "landed";
const STOP_MS = [1400, 2000, 2700];

export function SlotsBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateSlots(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [stopped, setStopped] = useState(0);
  const [pulled, setPulled] = useState(false);

  const spin = () => {
    if (phase !== "ready") return;
    setPulled(true);
    // The strips are already painted at their start offset, so this kicks off the CSS transition.
    setPhase("spinning");
  };

  useEffect(() => {
    if (phase !== "spinning") return;
    const stops = reducedMotion ? [100, 150, 200] : STOP_MS;
    const timers = stops.map((ms, i) => setTimeout(() => setStopped(i + 1), ms + 60));
    timers.push(setTimeout(() => setPhase("landed"), stops[2] + 150));
    return () => timers.forEach(clearTimeout);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.win ? 1200 : 800);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion, layout.win]);

  const payline = layout.windows.map((w) => w[1]);
  let prompt: React.ReactNode = null;
  if (phase === "spinning") {
    if (stopped === 0) prompt = <GamePrompt title="Spinning…" tone="pink" />;
    else prompt = <GamePrompt title={stopped === 2 ? "Last reel…" : "Spinning…"} tone="pink" />;
  } else if (phase === "landed") prompt = <GamePrompt title={layout.win ? "Three in a row!" : "No win"} tone={layout.win ? "pink" : "ink"} />;

  return (
    <>
      <div className={`rg-slots is-${phase} ${layout.win && phase === "landed" ? "is-win" : ""}`}>
        <div className="rg-slots-top">
          <div className="rg-marquee" aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div>
          <div className="rg-slots-title">SLOTS</div>
        </div>
        <div className="rg-slots-body">
          <div className="rg-slots-window" role="img" aria-label={phase === "landed" ? `Payline: ${payline.map((s) => NAMES[s]).join(", ")}` : "Slot reels"}>
            {layout.strips.map((strip, r) => {
              const rolling = phase !== "ready";
              const stoppedHere = stopped > r || phase === "landed";
              const dur = reducedMotion ? 100 : STOP_MS[r];
              return (
                <div key={r} className={`rg-reel ${rolling && !stoppedHere ? "is-blur" : ""}`}>
                  <div
                    className="rg-reel-strip"
                    style={{
                      transform: `translateY(${rolling ? 0 : (-(strip.length - 3) / strip.length) * 100}%)`,
                      transition: rolling ? `transform ${dur}ms cubic-bezier(0.25, 0.1, 0.25, 1.08)` : "none",
                    }}
                  >
                    {strip.map((s, i) => (
                      <div key={i} className={`rg-reel-cell ${i === 1 && phase === "landed" && layout.win ? "is-hit" : ""}`}>
                        <SlotIcon symbol={s} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="rg-payline" aria-hidden="true" />
          </div>
          <button type="button" className={`rg-lever ${pulled ? "is-pulled" : ""}`} onClick={spin} disabled={phase !== "ready"} aria-label="Pull the lever to spin">
            <span className="rg-lever-knob" />
            <span className="rg-lever-arm" />
          </button>
          {layout.paytable.length > 0 && <div className="rg-paytable">
            {layout.paytable.map((p) => (
              <span key={p.symbol} className="rg-paytable-row">
                3 <SlotIcon symbol={p.symbol} /> = {p.label}
              </span>
            ))}
          </div>}
        </div>
      </div>
      {phase === "ready" ? (
        <div className="rg-slots-controls">
          <button type="button" className="rg-btn rg-btn-yellow" onClick={spin}>
            SPIN
          </button>
          <p className="rg-note">{RESULT_SET_NOTE}</p>
        </div>
      ) : (
        prompt
      )}
    </>
  );
}
