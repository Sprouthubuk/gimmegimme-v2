import { useMemo } from "react";
import type { BoardProps } from "../types";
import { GEM_PICKS, generateGems, type GemKind } from "../generators";
import { useGemPicks } from "./useGemPicks";
import { GamePrompt } from "../../shell/GamePrompt";
import "./gems.css";

const GEM_FILL: Record<Exclude<GemKind, "dud">, [string, string]> = {
  pink: ["#ff8cc8", "#ff2d95"],
  blue: ["#8fe3ff", "#1fc4f4"],
  gold: ["#fff59a", "#ffd000"],
};
const GEM_NAME: Record<GemKind, string> = { pink: "pink gem", blue: "blue gem", gold: "gold gem", dud: "no gem" };

/** A cut gem with lit facets (or a plain pebble for no gem). Gradients are per kind, so every copy shares them. */
export function Gem({ kind, className = "" }: { kind: GemKind; className?: string }) {
  if (kind === "dud") {
    return (
      <svg viewBox="0 0 60 60" className={`rg-gem ${className}`} aria-hidden="true">
        <defs>
          <radialGradient id="gm-dud" cx="0.4" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#b9adc9" />
            <stop offset="1" stopColor="#5d5170" />
          </radialGradient>
        </defs>
        <ellipse cx="30" cy="34" rx="20" ry="13" fill="url(#gm-dud)" transform="rotate(-10 30 34)" />
        <ellipse cx="24" cy="29" rx="6" ry="3" fill="#fff" opacity="0.3" transform="rotate(-20 24 29)" />
      </svg>
    );
  }
  const [light, main] = GEM_FILL[kind];
  const g = `gm-${kind}`;
  return (
    <svg viewBox="0 0 60 60" className={`rg-gem ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${g}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={main} />
        </linearGradient>
        <linearGradient id={`${g}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={main} />
          <stop offset="1" stopColor="#1a0030" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d="M6 22 L17 9 H43 L54 22 L30 54 Z" fill={main} />
      <path d="M6 22 H54 L30 54 Z" fill={`url(#${g}-b)`} />
      <path d="M23 22 L30 54 L37 22 Z" fill={light} opacity="0.55" />
      <path d="M17 9 L23 22 H37 L43 9 Z" fill={`url(#${g}-a)`} />
      <path d="M17 9 L23 22 L6 22 Z M43 9 L37 22 L54 22 Z" fill={light} opacity="0.8" />
      <path d="M19 12 L22 18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="40" cy="14" r="1.6" fill="#fff" />
    </svg>
  );
}

export function GemsBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateGems(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { opened, done, open, left, kindAt, pair } = useGemPicks(layout, reducedMotion, onReveal);

  const dots = (
    <div className="rg-gem-dots" aria-label={`${left} picks left`}>
      {Array.from({ length: GEM_PICKS }, (_, i) => (
        <i key={i} className={i >= left ? "is-used" : ""} />
      ))}
      {opened.length > 0 && !done && <span>{left} pick{left === 1 ? "" : "s"} left</span>}
    </div>
  );

  let prompt: React.ReactNode;
  if (done) prompt = <GamePrompt title={layout.winGem ? `Three ${GEM_NAME[layout.winGem]}s!` : "No match this time"} tone={layout.winGem ? "pink" : "ink"} />;
  else if (opened.length === 0) prompt = <GamePrompt title={`Tap ${GEM_PICKS} tiles to find 3 matching gems`}>{dots}</GamePrompt>;
  else if (pair) prompt = <GamePrompt title={`Two ${GEM_NAME[pair]}s!`} tone="pink">{dots}</GamePrompt>;
  else prompt = <GamePrompt title="Keep picking…">{dots}</GamePrompt>;

  const flat = (
    <>
      {layout.paytable.length > 0 && <div className="rg-gem-paytable">
        {layout.paytable.map((p) => (
          <div key={p.gem} className={`rg-gem-pay ${done && p.gem === layout.winGem ? "is-hit" : ""}`}>
            <Gem kind={p.gem} />
            <Gem kind={p.gem} />
            <Gem kind={p.gem} />
            <span>{p.label}</span>
          </div>
        ))}
      </div>}
      <div className="rg-gem-grid">
        {Array.from({ length: 16 }, (_, tile) => {
          const gem = kindAt(tile);
          const hit = done && gem === layout.winGem && gem !== null;
          return (
            <button
              key={tile}
              type="button"
              className={`rg-gem-tile ${gem ? "is-open" : ""} ${hit ? "is-hit" : ""}`}
              onClick={() => open(tile)}
              disabled={done || !!gem}
              aria-label={gem ? GEM_NAME[gem] : `Tile ${tile + 1}`}
            >
              <span className="rg-gem-face rg-gem-back">?</span>
              <span className="rg-gem-face rg-gem-front">{gem && <Gem kind={gem} />}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {flat}
      {prompt}
    </>
  );
}

