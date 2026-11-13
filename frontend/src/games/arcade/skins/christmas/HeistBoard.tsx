import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { GEM_PICKS, generateGems, type GemKind } from "../../games/generators";
import { useGemPicks } from "../../games/gems/useGemPicks";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "./heist.css";

/**
 * Christmas skin of Gems: Liam's Humbug Heist. Sixteen money bags on a snowy,
 * lamplit street; crack six of them open. Each gem colour of the classic game is
 * a kind of loot here, and a dud is a lump of coal. Which bag the player taps is
 * cosmetic: the Nth bag cracked shows the Nth pick of generateGems, exactly as
 * the classic gem board does, so the board can only show the ticket's result.
 */

type Loot = GemKind;
const LOOT_NAME: Record<Loot, [string, string]> = {
  gold: ["gold bar", "gold bars"],
  pink: ["bundle of notes", "bundles of notes"],
  blue: ["silver stack", "silver stacks"],
  dud: ["lump of coal", "coal"],
};

/** The loot inside a bag. Drawn on a 60x60 grid, outlined in ink like every board. */
export function LootIcon({ kind, className = "" }: { kind: Loot; className?: string }) {
  const id = useId();
  if (kind === "dud") {
    return (
      <svg viewBox="0 0 60 60" className={`rg-loot ${className}`} aria-hidden="true">
        <path d="M14 36 L10 26 L18 16 L30 12 L42 15 L50 25 L48 38 L40 46 L26 48 L16 44 Z" fill="#2b2b33" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M18 18 L28 26 L30 12 M28 26 L42 15 M28 26 L26 48 M28 26 L48 38 M28 26 L10 26" fill="none" stroke="#141414" strokeWidth="1.6" />
        <path d="M20 21 L26 18" stroke="#8d8d9c" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M38 22 L44 26" stroke="#5f5f6c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "gold") {
    const bar = (x: number, y: number) => (
      <g transform={`translate(${x} ${y})`}>
        <path d="M0 14 L5 2 H25 L30 14 Z" fill={`url(#${id})`} stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
        <path d="M5 2 L8 8 H22 L25 2" fill="none" stroke="#141414" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 5 H15" stroke="#fffbe0" strokeWidth="2" strokeLinecap="round" />
      </g>
    );
    return (
      <svg viewBox="0 0 60 60" className={`rg-loot ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3a6" />
            <stop offset="0.5" stopColor="#ffcf2e" />
            <stop offset="1" stopColor="#c98a00" />
          </linearGradient>
        </defs>
        {bar(3, 38)}
        {bar(27, 38)}
        {bar(15, 24)}
        {bar(15, 10)}
      </svg>
    );
  }
  if (kind === "pink") {
    // Bundles of banknotes with a red paper band.
    return (
      <svg viewBox="0 0 60 60" className={`rg-loot ${className}`} aria-hidden="true">
        <rect x="8" y="30" width="44" height="20" rx="3" fill="#5fae6f" stroke="#141414" strokeWidth="3" transform="rotate(-8 30 40)" />
        <rect x="8" y="18" width="44" height="22" rx="3" fill="#8fd49c" stroke="#141414" strokeWidth="3" />
        <path d="M12 23 H48 M12 35 H48" stroke="#2f7a40" strokeWidth="1.5" />
        <ellipse cx="30" cy="29" rx="7" ry="6" fill="#d9f5de" stroke="#2f7a40" strokeWidth="1.5" />
        <text x="30" y="33.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1d5a2b" fontFamily="Arial, sans-serif">£</text>
        <rect x="23" y="16" width="14" height="26" fill="#e0283a" stroke="#141414" strokeWidth="3" />
        <path d="M26 20 V38" stroke="#ff8a96" strokeWidth="2" />
      </svg>
    );
  }
  // Silver coins, stacked.
  const coin = (y: number, dx = 0) => (
    <g transform={`translate(${dx} ${y})`}>
      <path d="M12 6 V12 A18 6 0 0 0 48 12 V6" fill="#9aa7bd" stroke="#141414" strokeWidth="3" />
      <ellipse cx="30" cy="6" rx="18" ry="6" fill={`url(#${id})`} stroke="#141414" strokeWidth="3" />
    </g>
  );
  return (
    <svg viewBox="0 0 60 60" className={`rg-loot ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d4dcea" />
          <stop offset="1" stopColor="#8f9cb3" />
        </linearGradient>
      </defs>
      {coin(42)}
      {coin(33, 2)}
      {coin(24, -1)}
      {coin(15, 1)}
      <path d="M22 18 L26 16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A burlap money bag tied with rope and stamped with a pound sign. */
function MoneyBag() {
  return (
    <svg viewBox="0 0 70 76" className="rg-heist-bag-svg" aria-hidden="true">
      <ellipse cx="35" cy="71" rx="24" ry="4" fill="rgba(0,0,0,0.35)" />
      <g className="rg-heist-bag-body">
        <path d="M24 26 C10 34 5 50 9 61 C12 69 22 71 35 71 C48 71 58 69 61 61 C65 50 60 34 46 26 Z" fill="url(#rg-heist-burlap)" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M16 44 C18 52 20 60 26 66" stroke="#f6d9a4" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
        <path d="M20 58 C30 61 42 61 52 57 M14 48 C28 52 44 52 57 47" stroke="#8a5a2b" strokeWidth="1.4" fill="none" opacity="0.6" />
        <text x="36" y="58" textAnchor="middle" fontSize="22" fontWeight="900" fill="#a3121f" fontFamily="Georgia, 'Times New Roman', serif">£</text>
      </g>
      <g className="rg-heist-bag-top">
        <path d="M24 26 C20 18 16 12 20 6 C26 10 30 8 35 4 C40 8 44 10 50 6 C54 12 50 18 46 26 Z" fill="url(#rg-heist-burlap)" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M22 25 C30 29 40 29 48 25" stroke="#141414" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M22 25 C30 29 40 29 48 25" stroke="#e6b35a" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d="M46 27 C52 31 54 36 51 40" stroke="#141414" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M46 27 C52 31 54 36 51 40" stroke="#e6b35a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** Gradients the bags share: defined once per board, not once per bag. */
function SharedDefs() {
  return (
    <svg className="rg-heist-defs" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="rg-heist-burlap" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#f0cf8e" />
          <stop offset="0.55" stopColor="#d3a25a" />
          <stop offset="1" stopColor="#9a6a2c" />
        </radialGradient>
        <linearGradient id="rg-heist-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#d98a00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** "LIAM'S HUMBUG HEIST": a hanging shop sign with gold lettering and a red ribbon. */
function HeistSign() {
  return (
    <svg viewBox="0 0 320 112" className="rg-heist-sign" role="img" aria-label="Liam's Humbug Heist">
      {/* Wooden plaque with snow on top. */}
      <path d="M104 4 H216 L224 28 H96 Z" fill="#6b3a1c" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M106 5 C124 0 196 0 214 5" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
      <text x="160" y="24" textAnchor="middle" className="rg-heist-sign-small">LIAM'S</text>
      {/* Red ribbon, tails behind. */}
      <path d="M40 76 H8 L20 90 L8 104 H40 Z M280 76 H312 L300 90 L312 104 H280 Z" fill="#8f0c1d" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <path d="M28 72 Q160 63 292 72 V104 Q160 95 28 104 Z" fill="#c4122a" stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M40 76 Q160 68 280 76" stroke="#ff7a86" strokeWidth="2.5" fill="none" opacity="0.7" />
      <text x="160" y="64" textAnchor="middle" className="rg-heist-sign-big">HUMBUG</text>
      <text x="160" y="98" textAnchor="middle" className="rg-heist-sign-big is-heist">HEIST</text>
    </svg>
  );
}

/** A Victorian street lamp, glowing, at one side of the street. */
function Lamp({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`rg-heist-lamp is-${side}`} viewBox="0 0 30 90" aria-hidden="true">
      <rect x="13" y="30" width="4" height="58" fill="#1d2433" stroke="#141414" strokeWidth="1.5" />
      <path d="M7 12 H23 L21 30 H9 Z" fill="#ffe08a" stroke="#141414" strokeWidth="2" strokeLinejoin="round" className="rg-heist-lamp-glass" />
      <path d="M5 12 L15 3 L25 12 Z" fill="#1d2433" stroke="#141414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 30 H22" stroke="#141414" strokeWidth="3" />
    </svg>
  );
}

export function HeistBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateGems(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { opened, done, open, left, kindAt, pair } = useGemPicks(layout, reducedMotion, onReveal, { win: 1800, lose: 1100 });

  // A clink as each bag opens on loot; a chime when three match.
  const before = useRef(0);
  useEffect(() => {
    if (opened.length > before.current) {
      const last = layout.picks[opened.length - 1];
      if (last !== "dud") playSound("clink");
      if (opened.length === GEM_PICKS && layout.winGem) window.setTimeout(() => playSound("chime"), 350);
    }
    before.current = opened.length;
  }, [opened.length, layout.picks, layout.winGem]);

  const crack = (tile: number) => {
    if (done || kindAt(tile)) return;
    if (!reducedMotion) navigator.vibrate?.(12);
    open(tile);
  };

  const picks = (
    <div className="rg-heist-picks" aria-label={`${left} picks left`}>
      {Array.from({ length: GEM_PICKS }, (_, i) => (
        <i key={i} className={i >= left ? "is-used" : ""} />
      ))}
      {opened.length > 0 && !done && <span>{left} left</span>}
    </div>
  );

  let prompt: React.ReactNode;
  if (done) prompt = <GamePrompt title={layout.winGem ? `Three ${LOOT_NAME[layout.winGem][1]}!` : "No match this time"} tone={layout.winGem ? "pink" : "ink"} />;
  else if (opened.length === 0) prompt = <GamePrompt title={`Crack ${GEM_PICKS} bags to find 3 the same`} sub={RESULT_SET_NOTE}>{picks}</GamePrompt>;
  else if (pair) prompt = <GamePrompt title={`Two ${LOOT_NAME[pair][1]}! Keep cracking…`} tone="pink">{picks}</GamePrompt>;
  else prompt = <GamePrompt title="Keep cracking…">{picks}</GamePrompt>;

  return (
    <>
      <div className={`rg-heist ${done ? "is-done" : ""} ${done && layout.winGem ? "is-won" : ""}`}>
        <SharedDefs />
        <Lamp side="left" />
        <Lamp side="right" />
        <HeistSign />
        {layout.paytable.length > 0 && (
          <div className="rg-heist-paytable">
            {layout.paytable.map((p) => (
              <div key={p.gem} className={`rg-heist-pay ${done && p.gem === layout.winGem ? "is-hit" : ""}`}>
                <LootIcon kind={p.gem} />
                <b>×3</b>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="rg-heist-street">
          {Array.from({ length: 16 }, (_, tile) => {
            const loot = kindAt(tile);
            const hit = done && loot !== null && loot === layout.winGem;
            return (
              <button
                key={tile}
                type="button"
                className={`rg-gem-tile rg-heist-tile ${loot ? "is-open" : ""} ${loot === "dud" ? "is-coal" : ""} ${hit ? "is-hit" : ""}`}
                style={{ "--sway": `${(tile * 0.37) % 1.6}s` } as CSSProperties}
                onClick={() => crack(tile)}
                disabled={done || !!loot}
                aria-label={loot ? LOOT_NAME[loot][0] : `Money bag ${tile + 1}`}
              >
                <span className="rg-heist-bag">
                  <MoneyBag />
                </span>
                {loot && (
                  <span className="rg-heist-loot">
                    <LootIcon kind={loot} />
                  </span>
                )}
                {loot && loot !== "dud" && !reducedMotion && (
                  <span className="rg-heist-spill" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, k) => (
                      <i key={k} style={{ "--a": `${-150 + k * 24 + ((tile * 7) % 9)}deg`, "--d": `${26 + ((k * 5 + tile) % 4) * 6}px` } as CSSProperties} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {done && layout.winGem && !reducedMotion && (
          <div className="rg-heist-rain" aria-hidden="true">
            {Array.from({ length: 16 }, (_, k) => (
              <i key={k} style={{ left: `${4 + ((k * 37) % 92)}%`, "--t": `${0.9 + ((k * 7) % 5) * 0.12}s`, "--w": `${(k * 0.11) % 0.7}s` } as CSSProperties} />
            ))}
          </div>
        )}
      </div>
      {prompt}
      <SoundToggle />
    </>
  );
}
