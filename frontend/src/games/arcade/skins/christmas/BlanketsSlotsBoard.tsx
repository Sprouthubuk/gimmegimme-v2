import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { generateSlots, type SlotSymbol } from "../../games/generators";
import { useSlotsSpin } from "../../games/slots/useSlotsSpin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import { Scene3D } from "../../three/Scene3D";
import { buildSlotsScene, type SlotsState } from "../../three/slotsScene";
import { svgElementToImage } from "../../three/svgImage";
import { blanketsSkin3D } from "./blankets3d";
import "../../games/slots/slots.css";
import "../shared/themed.css";
import "./blankets.css";

/**
 * Blankets & Banknotes, the Christmas skin of Slots: a glittering magenta fruit
 * machine where the fruit is Christmas dinner. Each symbol of the classic machine
 * is drawn as something festive; the reels, the payline and whether it pays all
 * come from generateSlots, exactly as the classic machine shows them.
 */

const NAMES: Record<SlotSymbol, [string, string]> = {
  coin: ["pig in blanket", "pigs in blankets"],
  seven: ["£50 note", "£50 notes"],
  diamond: ["turkey", "turkeys"],
  bar: ["Christmas pudding", "Christmas puddings"],
  star: ["sprout", "sprouts"],
  smile: ["mince pie", "mince pies"],
};

export function FeastIcon({ symbol }: { symbol: SlotSymbol }) {
  switch (symbol) {
    case "coin": // pig in blanket
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <g transform="rotate(-24 30 30)">
            <rect x="5" y="20" width="50" height="20" rx="10" fill="url(#rg-bb-sausage)" stroke="#141414" strokeWidth="3" />
            <path d="M11 25 H19" stroke="#ffd2b8" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M19 17 C24 28 23 34 20 43 H38 C41 34 42 27 37 17 Z" fill="#d9483e" stroke="#141414" strokeWidth="2.8" strokeLinejoin="round" />
            <path d="M25 18 C29 28 28 35 26 42 M32 18 C35 28 35 35 33 42" stroke="#ffe0cf" strokeWidth="2.4" fill="none" />
          </g>
          <path d="M44 6 L50 14 M48 4 L46 10 M52 8 L47 11" stroke="#2f8a3a" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "seven": // £50 note
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <g transform="rotate(-8 30 30)">
            <rect x="3" y="15" width="54" height="31" rx="3" fill="url(#rg-bb-note)" stroke="#141414" strokeWidth="3" />
            <rect x="7" y="19" width="46" height="23" rx="2" fill="none" stroke="#7d1724" strokeWidth="1.4" />
            <circle cx="17" cy="30.5" r="7" fill="#f6c4b2" stroke="#7d1724" strokeWidth="1.4" />
            <path d="M14 30 C16 26 19 26 20 30" stroke="#7d1724" strokeWidth="1.3" fill="none" />
            <text x="39" y="31.5" textAnchor="middle" dominantBaseline="middle" className="rg-bb-note-text">£50</text>
          </g>
        </svg>
      );
    case "diamond": // roast turkey
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <ellipse cx="30" cy="50" rx="27" ry="6.5" fill="#f4f6fb" stroke="#141414" strokeWidth="2.6" />
          <path d="M7 46 C4 28 17 17 30 17 C43 17 56 28 53 46 Z" fill="url(#rg-bb-roast)" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
          <path d="M17 25 C23 20 33 19 40 22" stroke="#ffe2a8" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.85" />
          <path d="M16 40 L9 25" stroke="#141414" strokeWidth="10" strokeLinecap="round" />
          <path d="M16 40 L9 25" stroke="#b8581e" strokeWidth="6" strokeLinecap="round" />
          <path d="M44 40 L51 25" stroke="#141414" strokeWidth="10" strokeLinecap="round" />
          <path d="M44 40 L51 25" stroke="#b8581e" strokeWidth="6" strokeLinecap="round" />
          <path d="M5 21 L8 18 L10 21 L13 19 L13 24 L7 26 Z" fill="#fff" stroke="#141414" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M55 21 L52 18 L50 21 L47 19 L47 24 L53 26 Z" fill="#fff" stroke="#141414" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M24 34 C27 31 33 31 36 34" stroke="#8a3f10" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "bar": // Christmas pudding
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <circle cx="30" cy="35" r="20" fill="url(#rg-bb-pud)" stroke="#141414" strokeWidth="3" />
          {[[20, 40], [36, 44], [42, 34], [26, 48], [30, 38]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.8" fill="#1e0c06" />
          ))}
          <path d="M11 30 C13 17 47 17 49 30 C46 34 43 27 40 33 C37 38 34 29 30 34 C26 39 24 29 20 33 C16 36 13 31 11 30 Z" fill="#fff6dc" stroke="#141414" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M30 17 C24 8 16 11 15 14 C20 13 22 17 30 17 Z M30 17 C36 8 44 11 45 14 C40 13 38 17 30 17 Z" fill="#2f9a44" stroke="#141414" strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx="27" cy="16" r="3" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
          <circle cx="33" cy="16" r="3" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
          <circle cx="30" cy="12" r="3" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
        </svg>
      );
    case "star": // sprout
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <path d="M25 49 H35 L34 56 H26 Z" fill="#dfeaa8" stroke="#141414" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="30" cy="30" r="21" fill="url(#rg-bb-sprout)" stroke="#141414" strokeWidth="3" />
          <path d="M30 9 C20 20 20 40 30 51 M30 9 C40 20 40 40 30 51" stroke="#2c6e22" strokeWidth="2" fill="none" />
          <path d="M11 26 C20 22 40 22 49 26 M13 38 C22 33 38 33 47 38" stroke="#2c6e22" strokeWidth="1.6" fill="none" opacity="0.7" />
          <path d="M18 18 C21 14 25 13 27 13" stroke="#d8f7a8" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "smile": // mince pie
      return (
        <svg viewBox="0 0 60 60" className="rg-slot-icon rg-feast" aria-hidden="true">
          <path d="M5 34 L12 50 H48 L55 34 Z" fill="url(#rg-bb-foil)" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
          <path d="M14 38 L18 48 M22 38 L24 49 M30 38 V49 M38 38 L36 49 M46 38 L42 48" stroke="#8b94a6" strokeWidth="1.6" />
          <ellipse cx="30" cy="31" rx="25" ry="11" fill="url(#rg-bb-pastry)" stroke="#141414" strokeWidth="3" />
          <path d="M30 22 L32.6 28 L39 28.4 L34 32 L35.8 38 L30 34.4 L24.2 38 L26 32 L21 28.4 L27.4 28 Z" fill="#7a2410" stroke="#4a1608" strokeWidth="1.4" strokeLinejoin="round" />
          {[[14, 28], [44, 27], [18, 35], [42, 35], [36, 24], [22, 24]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.2" fill="#fff" />
          ))}
        </svg>
      );
  }
}

export function SharedDefs() {
  return (
    <svg className="rg-bb-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rg-bb-sausage" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9a070" />
          <stop offset="0.6" stopColor="#b8582c" />
          <stop offset="1" stopColor="#7d3414" />
        </linearGradient>
        <linearGradient id="rg-bb-note" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a8e" />
          <stop offset="0.55" stopColor="#e2525a" />
          <stop offset="1" stopColor="#a8283a" />
        </linearGradient>
        <radialGradient id="rg-bb-roast" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffcf7a" />
          <stop offset="0.55" stopColor="#d9862e" />
          <stop offset="1" stopColor="#8a420e" />
        </radialGradient>
        <radialGradient id="rg-bb-pud" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#8a4a26" />
          <stop offset="0.6" stopColor="#4f2410" />
          <stop offset="1" stopColor="#2a1006" />
        </radialGradient>
        <radialGradient id="rg-bb-sprout" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#c8f08a" />
          <stop offset="0.55" stopColor="#5fb83a" />
          <stop offset="1" stopColor="#2a6e1a" />
        </radialGradient>
        <radialGradient id="rg-bb-pastry" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe4a0" />
          <stop offset="0.6" stopColor="#e8a84a" />
          <stop offset="1" stopColor="#b3701e" />
        </radialGradient>
        <linearGradient id="rg-bb-foil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6fa" />
          <stop offset="1" stopColor="#a9b2c2" />
        </linearGradient>
        <linearGradient id="rg-bb-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.5" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
        <linearGradient id="rg-bb-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dfe6f2" />
          <stop offset="1" stopColor="#9aa6bc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** "BLANKETS & BANKNOTES": snow-capped gold and frosted silver lettering. */
function Sign() {
  return (
    <svg viewBox="0 0 320 112" className="rg-themed-sign rg-bb-sign" role="img" aria-label="Blankets and Banknotes">
      <text x="160" y="46" textAnchor="middle" className="rg-bb-sign-top">BLANKETS</text>
      {/* Snow settled on the top of the letters. */}
      <path
        d="M34 14 C40 8 48 12 52 10 C58 6 66 12 72 9 C80 6 86 12 94 10 C102 6 110 12 118 9 C126 6 132 12 140 10 C148 6 156 12 164 9 C172 6 180 12 188 10 C196 6 204 12 212 9 C220 6 228 12 236 10 C244 6 252 12 260 9 C268 6 276 12 286 14 C280 17 274 14 268 17 C258 14 250 18 240 16 C230 14 222 18 212 16 C200 14 190 18 180 16 C168 14 158 18 148 16 C136 14 126 18 116 16 C104 14 94 18 84 16 C72 14 62 18 52 16 C44 15 40 17 34 14 Z"
        className="rg-bb-sign-snow"
        transform="translate(0 -1)"
      />
      <circle cx="160" cy="62" r="13" className="rg-bb-sign-amp-disc" />
      <text x="160" y="63" textAnchor="middle" dominantBaseline="middle" className="rg-bb-sign-amp">&amp;</text>
      <text x="160" y="104" textAnchor="middle" className="rg-bb-sign-bottom">BANKNOTES</text>
    </svg>
  );
}

/** Sprigs of holly for the cabinet corners. */
function Holly({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 32" className={`rg-bb-holly ${className}`} aria-hidden="true">
      <path d="M24 18 C14 4 4 8 2 12 C8 11 10 16 6 20 C12 18 16 24 24 18 Z" fill="#2f9a44" stroke="#141414" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M24 18 C34 4 44 8 46 12 C40 11 38 16 42 20 C36 18 32 24 24 18 Z" fill="#23803a" stroke="#141414" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="4" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
      <circle cx="28" cy="20" r="4" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
      <circle cx="24" cy="25" r="4" fill="#e0283a" stroke="#141414" strokeWidth="1.8" />
    </svg>
  );
}

const BULBS_X = 13;
const BULBS_Y = 9;

export function BlanketsSlotsBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateSlots(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { phase, stopped, spin, reelMs } = useSlotsSpin(layout, reducedMotion, onReveal, { win: 2000, lose: 1000 });
  const won = phase === "landed" && layout.win;
  const payline = layout.windows.map((w) => w[1]);

  // Bells as the reels go, a clunk as each one stops, a chime on a win.
  const lastStop = useRef(0);
  useEffect(() => {
    if (phase === "spinning" && stopped === 0) playSound("bells");
    if (stopped > lastStop.current) playSound("clink");
    lastStop.current = stopped;
    if (phase === "landed" && layout.win) playSound("chime");
  }, [phase, stopped, layout.win]);

  const pull = () => {
    if (phase !== "ready") return;
    if (!reducedMotion) navigator.vibrate?.(14);
    spin();
  };

  let prompt: React.ReactNode = null;
  if (phase === "spinning") prompt = <GamePrompt title={stopped === 2 ? "Last reel…" : "Spinning…"} tone="pink" />;
  else if (phase === "landed") prompt = <GamePrompt title={layout.win ? `Three ${NAMES[payline[0]][1]}!` : "No three in a row"} tone={layout.win ? "pink" : "ink"} />;

  const bulb = (i: number, side: string) => <i key={`${side}${i}`} style={{ "--k": i % 3 } as CSSProperties} />;

  const flat = (
    <>
      <div className={`rg-bb is-${phase} ${won ? "is-win" : ""}`}>
        <SharedDefs />
        <div className="rg-bb-cabinet">
          <div className="rg-bb-bulbs is-top" aria-hidden="true">{Array.from({ length: BULBS_X }, (_, i) => bulb(i, "t"))}</div>
          <div className="rg-bb-bulbs is-bottom" aria-hidden="true">{Array.from({ length: BULBS_X }, (_, i) => bulb(i + 1, "b"))}</div>
          <div className="rg-bb-bulbs is-left" aria-hidden="true">{Array.from({ length: BULBS_Y }, (_, i) => bulb(i + 2, "l"))}</div>
          <div className="rg-bb-bulbs is-right" aria-hidden="true">{Array.from({ length: BULBS_Y }, (_, i) => bulb(i, "r"))}</div>
          <Holly className="is-left" />
          <Holly className="is-right" />

          <Sign />

          <div
            className="rg-slots-window rg-bb-window"
            role="img"
            aria-label={phase === "landed" ? `Payline: ${payline.map((s) => NAMES[s][0]).join(", ")}` : "Slot reels"}
          >
            {layout.strips.map((strip, r) => {
              const rolling = phase !== "ready";
              const stoppedHere = stopped > r || phase === "landed";
              const dur = reelMs(r);
              return (
                <div key={r} className={`rg-reel rg-bb-reel ${rolling && !stoppedHere ? "is-blur" : ""} ${stoppedHere && rolling ? "is-stopped" : ""}`}>
                  <div
                    className="rg-reel-strip"
                    style={{
                      transform: `translateY(${rolling ? 0 : (-(strip.length - 3) / strip.length) * 100}%)`,
                      transition: rolling ? `transform ${dur}ms cubic-bezier(0.25, 0.1, 0.25, 1.08)` : "none",
                    }}
                  >
                    {strip.map((s, i) => (
                      <div key={i} className={`rg-reel-cell ${i === 1 && won ? "is-hit" : ""}`}>
                        <FeastIcon symbol={s} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="rg-payline rg-bb-payline" aria-hidden="true" />
          </div>

          {layout.paytable.length > 0 && (
            <div className="rg-bb-paytable">
              {layout.paytable.map((p) => (
                <span key={p.symbol} className={`rg-bb-pay ${won && p.symbol === payline[0] ? "is-hit" : ""}`}>
                  <b>3×</b>
                  <FeastIcon symbol={p.symbol} />
                  <span>{p.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <button type="button" className={`rg-lever rg-bb-lever ${phase !== "ready" ? "is-pulled" : ""}`} onClick={pull} disabled={phase !== "ready"} aria-label="Pull the lever to spin">
          <span className="rg-lever-knob" />
          <span className="rg-lever-arm" />
        </button>

        {won && !reducedMotion && (
          <div className="rg-bb-burst" aria-hidden="true">
            {Array.from({ length: 18 }, (_, k) => (
              <i
                key={k}
                className={k % 3 === 0 ? "is-coin" : "is-note"}
                style={{ "--a": `${-170 + ((k * 23) % 160)}deg`, "--d": `${110 + ((k * 37) % 90)}px`, "--r": `${((k * 53) % 300) - 150}deg`, "--w": `${(k % 6) * 0.05}s` } as CSSProperties}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
  const state: SlotsState = { phase, stopped, win: layout.win, pull };

  return (
    <>
      <Scene3D
        state={state}
        setup={(ctx) => buildSlotsScene(ctx, blanketsSkin3D(feastImage), layout)}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={1.2}
        bloom={false}
        fallback={flat}
        label="Blankets and Banknotes slot machine"
      />
      {layout.paytable.length > 0 && (
        <div className="rg3-paytable">
          {layout.paytable.map((p) => (
            <span key={p.symbol} className={`rg3-pay ${won && p.symbol === payline[0] ? "is-hit" : ""}`}>
              <b>3×</b>
              <FeastIcon symbol={p.symbol} />
              <span>{p.label}</span>
            </span>
          ))}
        </div>
      )}
      {phase === "ready" ? (
        <div className="rg-slots-controls rg-bb-controls">
          <button type="button" className="rg3-btn is-gold rg3-spin" onClick={pull}>
            SPIN
          </button>
          <p className="rg-note">{RESULT_SET_NOTE}</p>
        </div>
      ) : (
        prompt
      )}
      <SoundToggle />
    </>
  );
}

const NOTE_CSS = ".rg-bb-note-text{font:900 15px Arial Black,Arial,sans-serif;fill:#fff;stroke:#141414;stroke-width:3px;paint-order:stroke}";
/** The board's own symbol, as a picture for the 3D drums. */
const feastImage = (symbol: SlotSymbol) => svgElementToImage(<FeastIcon symbol={symbol} />, { defs: <SharedDefs />, css: NOTE_CSS });
