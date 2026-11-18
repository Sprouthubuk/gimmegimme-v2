import { useId, useMemo } from "react";
import type { BoardProps } from "../types";
import { generateSlots, type SlotSymbol } from "../generators";
import { Mascot } from "../../shell/Mascot";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { useSlotsSpin } from "./useSlotsSpin";
import "./slots.css";

const NAMES: Record<SlotSymbol, string> = { coin: "£", seven: "7", bar: "BAR", star: "star", diamond: "gem", smile: "smiley" };

/** One reel symbol, drawn with its own shading so it reads clearly at any size. */
export function SlotIcon({ symbol }: { symbol: SlotSymbol }) {
  const u = useId().replace(/:/g, "");
  switch (symbol) {
    case "coin":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <defs>
            <radialGradient id={`${u}a`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fff7c2" />
              <stop offset="0.45" stopColor="#ffcf33" />
              <stop offset="1" stopColor="#c47f00" />
            </radialGradient>
          </defs>
          <circle cx="30" cy="31" r="25" fill="#8a5600" />
          <circle cx="30" cy="29" r="25" fill={`url(#${u}a)`} />
          <circle cx="30" cy="29" r="18.5" fill="none" stroke="#b97500" strokeWidth="2.4" opacity="0.7" />
          <text x="30" y="30.5" textAnchor="middle" dominantBaseline="middle" className="rg-slot-glyph">£</text>
          <ellipse cx="21" cy="17" rx="8" ry="4" fill="#fff" opacity="0.55" transform="rotate(-30 21 17)" />
        </svg>
      );
    case "seven":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <defs>
            <linearGradient id={`${u}a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff8fcb" />
              <stop offset="0.5" stopColor="#ff1f8e" />
              <stop offset="1" stopColor="#a8005a" />
            </linearGradient>
            <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff2a0" />
              <stop offset="1" stopColor="#e09a00" />
            </linearGradient>
          </defs>
          <path d="M12 8 H50 V19 L32 54 H17 L34 20 H12 Z" fill={`url(#${u}b)`} stroke="#7a3d00" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M15 11 H47 V18.5 L30 51 H21 L38 17 H15 Z" fill={`url(#${u}a)`} />
          <path d="M17 13 H44" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.65" />
        </svg>
      );
    case "bar":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <defs>
            <linearGradient id={`${u}a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a2650" />
              <stop offset="1" stopColor="#120a1c" />
            </linearGradient>
            <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff2a0" />
              <stop offset="1" stopColor="#e09a00" />
            </linearGradient>
          </defs>
          <rect x="4" y="16" width="52" height="28" rx="8" fill={`url(#${u}b)`} />
          <rect x="7" y="19" width="46" height="22" rx="6" fill={`url(#${u}a)`} />
          <text x="30" y="31" textAnchor="middle" dominantBaseline="middle" className="rg-slot-bar" fill={`url(#${u}b)`}>BAR</text>
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <defs>
            <radialGradient id={`${u}a`} cx="0.4" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fffbd6" />
              <stop offset="0.5" stopColor="#ffd23a" />
              <stop offset="1" stopColor="#e08a00" />
            </radialGradient>
          </defs>
          <path d="M30 6 L37.5 22.5 L55 24 L41.5 36 L45.8 53.5 L30 44 L14.2 53.5 L18.5 36 L5 24 L22.5 22.5 Z" fill="#a85f00" transform="translate(0 2)" />
          <path d="M30 6 L37.5 22.5 L55 24 L41.5 36 L45.8 53.5 L30 44 L14.2 53.5 L18.5 36 L5 24 L22.5 22.5 Z" fill={`url(#${u}a)`} />
          <path d="M30 13 L34 23" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon">
          <path d="M7 22 L18 9 H42 L53 22 L30 53 Z" fill="#0a6f9e" />
          <path d="M7 22 H53 L30 53Z" fill="#1fb6ea" />
          <path d="M18 9 L24 22 H36 L42 9Z" fill="#a8f0ff" />
          <path d="M7 22 L18 9 L24 22Z M53 22 L42 9 L36 22Z" fill="#5ad6ff" />
          <path d="M24 22 L30 53 L36 22Z" fill="#7fe6ff" />
          <path d="M20 13 L23 19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "smile":
      return <Mascot mood="smile" className="rg-slot-icon" />;
  }
}

export function SlotsBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateSlots(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { phase, stopped, spin, reelMs } = useSlotsSpin(layout, reducedMotion, onReveal);
  const pulled = phase !== "ready";
  const payline = layout.windows.map((w) => w[1]);
  const won = layout.win && phase === "landed";

  let prompt: React.ReactNode = null;
  if (phase === "spinning") prompt = <GamePrompt title={stopped === 2 ? "Last reel…" : "Spinning…"} tone="pink" />;
  else if (phase === "landed") prompt = <GamePrompt title={layout.win ? "Three in a row!" : "No win"} tone={layout.win ? "pink" : "ink"} />;

  return (
    <>
      <div className={`rg-slots is-${phase} ${won ? "is-win" : ""}`}>
        <div className="rg-slots-cab">
          <div className="rg-slots-marquee">
            <div className="rg-slots-lights" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="rg-slots-title">SLOTS</div>
          </div>
          <div className="rg-slots-bezel">
            <div className="rg-slots-window" role="img" aria-label={phase === "landed" ? `Payline: ${payline.map((s) => NAMES[s]).join(", ")}` : "Slot reels"}>
              {layout.strips.map((strip, r) => {
                const rolling = phase !== "ready";
                const stoppedHere = stopped > r || phase === "landed";
                return (
                  <div key={r} className={`rg-reel ${rolling && !stoppedHere ? "is-blur" : ""} ${stoppedHere && rolling ? "is-stopped" : ""}`}>
                    <div
                      className="rg-reel-strip"
                      style={{
                        transform: `translateY(${rolling ? 0 : (-(strip.length - 3) / strip.length) * 100}%)`,
                        transition: rolling ? `transform ${reelMs(r)}ms cubic-bezier(0.22, 0.1, 0.2, 1.06)` : "none",
                      }}
                    >
                      {strip.map((s, i) => (
                        <div key={i} className={`rg-reel-cell ${i === 1 && won ? "is-hit" : ""}`}>
                          <SlotIcon symbol={s} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="rg-payline" aria-hidden="true" />
            </div>
          </div>
          {layout.paytable.length > 0 && (
            <div className="rg-paytable">
              {layout.paytable.map((p) => (
                <span key={p.symbol} className={`rg-paytable-row ${won && p.symbol === payline[0] ? "is-hit" : ""}`}>
                  <b>3×</b>
                  <SlotIcon symbol={p.symbol} />
                  <span>{p.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={`rg-lever ${pulled ? "is-pulled" : ""}`} onClick={spin} disabled={phase !== "ready"} aria-label="Pull the lever to spin">
          <span className="rg-lever-arm" />
          <span className="rg-lever-knob" />
        </button>
      </div>
      <div className="rg-slots-controls">
        {phase === "ready" ? (
          <>
            <button type="button" className="rg-cta" onClick={spin}>
              SPIN
            </button>
            <p className="rg-note">{RESULT_SET_NOTE}</p>
          </>
        ) : (
          prompt
        )}
      </div>
    </>
  );
}
