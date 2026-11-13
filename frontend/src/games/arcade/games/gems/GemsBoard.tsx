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

export function Gem({ kind, className = "" }: { kind: GemKind; className?: string }) {
  if (kind === "dud") {
    return (
      <svg viewBox="0 0 60 60" className={`rg-gem ${className}`} aria-hidden="true">
        <ellipse cx="30" cy="30" rx="22" ry="14" fill="#ffd6ea" stroke="#141414" strokeWidth="3.5" transform="rotate(-12 30 30)" />
        <path d="M33 21 L27 39" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  const [light, main] = GEM_FILL[kind];
  return (
    <svg viewBox="0 0 60 60" className={`rg-gem ${className}`} aria-hidden="true">
      <path d="M6 22 L17 9 H43 L54 22 L30 54 Z" fill={main} stroke="#141414" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M6 22 H54 L43 9 H17 Z" fill={light} stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
      <path d="M17 9 L23 22 L30 54 L37 22 L43 9 M23 22 L30 9 L37 22" fill="none" stroke="#141414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 21 L18 14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
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

  return (
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
      {prompt}
    </>
  );
}
