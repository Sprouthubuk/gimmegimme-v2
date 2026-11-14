import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { GEM_PICKS, generateGems, type GemKind } from "../../games/generators";
import { useGemPicks } from "../../games/gems/useGemPicks";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound, useSoundLater } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import { Scene3D } from "../../three/Scene3D";
import { buildPickScene, type PickState } from "../../three/pickScene";
import { svgElementToImage } from "../../three/svgImage";
import { piratesSkin3D } from "./pirates3d";
import "../shared/themed.css";
import "./pirates.css";

/**
 * Pirates of the Prizeibbean, a skin of Gems. Sixteen treasure chests on a
 * ship's deck at sunset; open six. Each gem colour of the classic game is a
 * kind of treasure here, and a dud is an old boot. Which chest the player opens
 * is cosmetic: the Nth chest opened shows the Nth pick of generateGems, exactly
 * as the classic gem board does, so the board can only show the ticket's result.
 */

const LOOT_NAME: Record<GemKind, [string, string]> = {
  gold: ["gold doubloon", "gold doubloons"],
  pink: ["ruby", "rubies"],
  blue: ["pearl", "pearls"],
  dud: ["old boot", "old boots"],
};

/** The treasure in a chest, on a 60x60 grid. */
export function Treasure({ kind, className = "" }: { kind: GemKind; className?: string }) {
  if (kind === "dud") {
    return (
      <svg viewBox="0 0 60 60" className={`rg-treasure ${className}`} aria-hidden="true">
        <path d="M18 10 H34 V34 L50 38 C55 39 56 46 52 48 H12 C10 48 10 44 12 42 L16 36 Z" fill="#6b4a2c" stroke="#141414" strokeWidth="3.2" strokeLinejoin="round" />
        <path d="M16 36 L34 36 M18 16 H34" stroke="#3d2814" strokeWidth="2" />
        <path d="M12 48 H52 V52 H12 Z" fill="#3d2814" stroke="#141414" strokeWidth="2.5" />
        <circle cx="40" cy="42" r="3" fill="#2a1a0c" />
        <path d="M24 22 L30 20 M24 28 L30 26" stroke="#c9a46a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M44 30 C48 24 52 26 50 20" stroke="#4f8a5c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "gold") {
    const coin = (x: number, y: number, r: number) => (
      <g>
        <circle cx={x} cy={y} r={r} fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="2.6" />
        <circle cx={x} cy={y} r={r * 0.68} fill="none" stroke="#b37800" strokeWidth="1.6" />
        <path d={`M${x - r * 0.25} ${y - r * 0.3} L${x + r * 0.25} ${y + r * 0.3} M${x + r * 0.25} ${y - r * 0.3} L${x - r * 0.25} ${y + r * 0.3}`} stroke="#b37800" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    );
    return (
      <svg viewBox="0 0 60 60" className={`rg-treasure ${className}`} aria-hidden="true">
        {coin(18, 40, 12)}
        {coin(42, 40, 12)}
        {coin(30, 24, 14)}
        <path d="M24 16 L28 14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "pink") {
    const ruby = (x: number, y: number, s: number) => (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-14 -4 L-8 -12 H8 L14 -4 L0 14 Z" fill="url(#rg-pir-ruby)" stroke="#141414" strokeWidth="2.8" strokeLinejoin="round" />
        <path d="M-14 -4 H14 M-8 -12 L-4 -4 L0 14 L4 -4 L8 -12" fill="none" stroke="#7a0a1c" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M-7 -9 L-4 -6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </g>
    );
    return (
      <svg viewBox="0 0 60 60" className={`rg-treasure ${className}`} aria-hidden="true">
        {ruby(18, 38, 0.85)}
        {ruby(42, 38, 0.85)}
        {ruby(30, 26, 1.1)}
      </svg>
    );
  }
  // Pearls in an open shell.
  return (
    <svg viewBox="0 0 60 60" className={`rg-treasure ${className}`} aria-hidden="true">
      <path d="M8 40 C8 54 52 54 52 40 Z" fill="#7fb4e6" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 42 L18 50 M24 42 L26 52 M36 42 L34 52 M46 42 L42 50" stroke="#3f74a8" strokeWidth="1.6" />
      {[[20, 36], [30, 32], [40, 36], [25, 26], [35, 26]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6.5" fill="url(#rg-pir-pearl)" stroke="#141414" strokeWidth="2.2" />
          <circle cx={x - 2} cy={y - 2} r="1.8" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

/** A treasure chest: the lid lifts off when it is opened. */
function Chest() {
  return (
    <svg viewBox="0 0 70 64" className="rg-chest-svg" aria-hidden="true">
      <ellipse cx="35" cy="60" rx="28" ry="3.5" fill="rgba(0,0,0,0.4)" />
      <g className="rg-chest-body">
        <rect x="7" y="28" width="56" height="30" rx="3" fill="url(#rg-pir-wood)" stroke="#141414" strokeWidth="3" />
        <path d="M7 38 H63 M7 48 H63" stroke="#4a2a12" strokeWidth="1.4" />
        <rect x="14" y="28" width="6" height="30" fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="2" />
        <rect x="50" y="28" width="6" height="30" fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="2" />
        <rect x="29" y="30" width="12" height="14" rx="2" fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="2" />
        <path d="M35 34 V39" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="35" cy="34" r="2" fill="#141414" />
      </g>
      <g className="rg-chest-lid">
        <path d="M7 30 V20 C7 6 63 6 63 20 V30 Z" fill="url(#rg-pir-wood)" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
        <path d="M14 30 V14 C14 11 20 10 20 12 V30 Z M50 12 C50 10 56 11 56 14 V30 H50 Z" fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 16 C24 8 46 8 58 16" stroke="#c98a4a" strokeWidth="2.2" fill="none" opacity="0.7" />
      </g>
    </svg>
  );
}

export function SharedDefs() {
  return (
    <svg className="rg-pir-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rg-pir-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8632c" />
          <stop offset="0.6" stopColor="#7a4319" />
          <stop offset="1" stopColor="#4f2a0e" />
        </linearGradient>
        <radialGradient id="rg-pir-gold" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#b87800" />
        </radialGradient>
        <linearGradient id="rg-pir-ruby" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8aa0" />
          <stop offset="0.5" stopColor="#e0153d" />
          <stop offset="1" stopColor="#7a0a1c" />
        </linearGradient>
        <radialGradient id="rg-pir-pearl" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#ece6f6" />
          <stop offset="1" stopColor="#b6a9cc" />
        </radialGradient>
        <linearGradient id="rg-pir-sign-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.5" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** "PIRATES of the PRIZEIBBEAN" on a dark wooden sign with brass corners and a red banner. */
function PirateSign() {
  return (
    <svg viewBox="0 0 320 118" className="rg-themed-sign rg-pir-sign" role="img" aria-label="Pirates of the Prizeibbean">
      <path d="M16 10 H304 L312 22 V82 L304 94 H16 L8 82 V22 Z" fill="#2b1a0e" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M18 14 H302 L308 24 V80 L302 90 H18 L12 80 V24 Z" fill="none" stroke="#c98a2c" strokeWidth="2" />
      {[[16, 14], [304, 14], [16, 90], [304, 90]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="url(#rg-pir-gold)" stroke="#141414" strokeWidth="1.6" />
      ))}
      <text x="160" y="50" textAnchor="middle" className="rg-pir-sign-big">PIRATES</text>
      <text x="160" y="66" textAnchor="middle" className="rg-pir-sign-small">OF THE</text>
      <path d="M30 76 Q160 68 290 76 V108 Q160 100 30 108 Z" fill="#9e1b1b" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 80 H10 L20 92 L10 104 H30 Z M290 80 H310 L300 92 L310 104 H290 Z" fill="#6e1010" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="160" y="102" textAnchor="middle" className="rg-pir-sign-big is-banner">PRIZEIBBEAN</text>
    </svg>
  );
}

/** A galleon on the horizon. */
function Ship() {
  return (
    <svg className="rg-pir-ship" viewBox="0 0 80 60" aria-hidden="true">
      <path d="M8 40 H72 L64 52 H16 Z" fill="#1b120c" />
      <path d="M40 6 V40 M24 14 V40 M56 14 V40" stroke="#1b120c" strokeWidth="2" />
      <path d="M28 10 Q40 16 28 26 Z M44 8 Q58 18 44 34 Z M14 18 Q24 24 14 32 Z M58 18 Q68 24 58 32 Z" fill="#2a1c12" />
      <path d="M40 6 L50 9 L40 12 Z" fill="#1b120c" />
    </svg>
  );
}

export function PiratesBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateGems(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { opened, done, open, left, kindAt, pair } = useGemPicks(layout, reducedMotion, onReveal, { win: 1800, lose: 1100 });

  // A creak as each chest opens, a clink on treasure, a chime when three match.
  const before = useRef(0);
  const later = useSoundLater();
  useEffect(() => {
    if (opened.length > before.current) {
      playSound("creak");
      if (layout.picks[opened.length - 1] !== "dud") later("clink", 220);
      if (opened.length === GEM_PICKS && layout.winGem) later("chime", 450);
    }
    before.current = opened.length;
  }, [opened.length, layout.picks, layout.winGem, later]);

  const openChest = (tile: number) => {
    if (done || kindAt(tile)) return;
    if (!reducedMotion) navigator.vibrate?.(12);
    open(tile);
  };

  const picks = (
    <div className="rg-pir-picks" role="status" aria-label={`${left} ${left === 1 ? "chest" : "chests"} left to open`}>
      {Array.from({ length: GEM_PICKS }, (_, i) => (
        <i key={i} className={i >= left ? "is-used" : ""} />
      ))}
      {opened.length > 0 && !done && <span>{left} left</span>}
    </div>
  );

  let prompt: React.ReactNode;
  if (done) prompt = <GamePrompt title={layout.winGem ? `Three ${LOOT_NAME[layout.winGem][1]}!` : "No match this time"} tone={layout.winGem ? "pink" : "ink"} />;
  else if (opened.length === 0) prompt = <GamePrompt title={`Open ${GEM_PICKS} chests to find 3 the same`} sub={RESULT_SET_NOTE}>{picks}</GamePrompt>;
  else if (pair) prompt = <GamePrompt title={`Two ${LOOT_NAME[pair][1]}! Keep looking…`} tone="pink">{picks}</GamePrompt>;
  else prompt = <GamePrompt title="Keep opening…">{picks}</GamePrompt>;

  const flat = (
    <>
      <div className={`rg-pir ${done ? "is-done" : ""} ${done && layout.winGem ? "is-won" : ""}`}>
        <SharedDefs />
        <div className="rg-pir-sky" aria-hidden="true">
          <span className="rg-pir-sun" />
          <Ship />
          <span className="rg-pir-sea" />
        </div>
        <PirateSign />
        {layout.paytable.length > 0 && (
          <div className="rg-pir-paytable">
            {layout.paytable.map((p) => (
              <div key={p.gem} className={`rg-pir-pay ${done && p.gem === layout.winGem ? "is-hit" : ""}`}>
                <Treasure kind={p.gem} />
                <b>×3</b>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="rg-pir-deck">
          {Array.from({ length: 16 }, (_, tile) => {
            const loot = kindAt(tile);
            const hit = done && loot !== null && loot === layout.winGem;
            return (
              <button
                key={tile}
                type="button"
                className={`rg-gem-tile rg-pir-tile ${loot ? "is-open" : ""} ${loot === "dud" ? "is-boot" : ""} ${hit ? "is-hit" : ""}`}
                style={{ "--bob": `${(tile * 0.41) % 2}s` } as CSSProperties}
                onClick={() => openChest(tile)}
                disabled={done || !!loot}
                aria-label={loot ? LOOT_NAME[loot][0] : `Treasure chest ${tile + 1}`}
              >
                <span className="rg-pir-chest">
                  <Chest />
                </span>
                {loot && (
                  <>
                    <span className="rg-pir-glow" aria-hidden="true" />
                    <span className="rg-pir-loot">
                      <Treasure kind={loot} />
                    </span>
                  </>
                )}
                {loot && loot !== "dud" && !reducedMotion && (
                  <span className="rg-pir-sparks" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, k) => (
                      <i key={k} style={{ "--a": `${-160 + k * 28 + ((tile * 5) % 9)}deg`, "--d": `${24 + ((k * 3 + tile) % 4) * 6}px` } as CSSProperties} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {done && layout.winGem && !reducedMotion && (
          <div className="rg-pir-rain" aria-hidden="true">
            {Array.from({ length: 16 }, (_, k) => (
              <i key={k} style={{ left: `${4 + ((k * 37) % 92)}%`, "--t": `${0.9 + ((k * 7) % 5) * 0.12}s`, "--w": `${(k * 0.11) % 0.7}s` } as CSSProperties} />
            ))}
          </div>
        )}
      </div>
    </>
  );
  const state: PickState = { kinds: Array.from({ length: 16 }, (_, i) => kindAt(i)), done, winGem: layout.winGem, open: openChest };

  return (
    <>
      <Scene3D
        state={state}
        setup={(ctx) => buildPickScene(ctx, piratesSkin3D(lootImage))}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={1.05}
        fallback={flat}
        label="Pirates of the Prizeibbean treasure chests"
      />
      {layout.paytable.length > 0 && (
        <div className="rg3-paytable">
          {layout.paytable.map((p) => (
            <span key={p.gem} className={`rg3-pay ${done && p.gem === layout.winGem ? "is-hit" : ""}`}>
              <Treasure kind={p.gem} className="rg-slot-icon" />
              <b>×3</b>
              <span>{p.label}</span>
            </span>
          ))}
        </div>
      )}
      {prompt}
      <SoundToggle />
    </>
  );
}

/** The board's own loot picture, for the 3D board. */
const lootImage = (kind: GemKind) => svgElementToImage(<Treasure kind={kind} />, { defs: <SharedDefs /> });
