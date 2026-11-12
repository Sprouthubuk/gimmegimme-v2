import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "../types";
import { GEM_PICKS, generateGems, type GemKind } from "../generators";
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
  // Tile index → pick number. The Nth tile tapped shows the Nth pre-set gem.
  const [opened, setOpened] = useState<number[]>([]);
  const done = opened.length === GEM_PICKS;

  const open = (tile: number) => {
    if (done || opened.includes(tile)) return;
    setOpened((o) => [...o, tile]);
  };

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.winGem ? 1300 : 900);
    return () => clearTimeout(t);
  }, [done, onReveal, reducedMotion, layout.winGem]);

  const revealed = opened.map((_, i) => layout.picks[i]);
  const counts = new Map<GemKind, number>();
  revealed.forEach((g) => g !== "dud" && counts.set(g, (counts.get(g) ?? 0) + 1));
  const [topGem, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const left = GEM_PICKS - opened.length;

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
  // Only a ticket that really wins is told it has a pair; a loss gets no "nearly" prompt.
  else if (topCount >= 2 && topGem && topGem === layout.winGem) prompt = <GamePrompt title={`Two ${GEM_NAME[topGem]}s!`} tone="pink">{dots}</GamePrompt>;
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
          const pickNo = opened.indexOf(tile);
          const gem = pickNo >= 0 ? layout.picks[pickNo] : null;
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
