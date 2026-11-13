import { useEffect, useMemo, useRef } from "react";
import type { BoardProps } from "../../games/types";
import { generateScratch } from "../../games/generators";
import { pluralLabel, scratchProgress, useScratchSurface, type PaintCover } from "../../games/scratch/useScratchSurface";
import { createRng, shuffle } from "../../rng";
import { formatTicketNumber } from "../../money";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "../../games/scratch/scratch.css";
import "./vault.css";

/** A thin frost over the vault wall, so the doors show through it: icy white with crystals, the same every time it is painted. */
const paintFrost: PaintCover = (c, width, height) => {
  const g = c.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "rgba(233,244,255,0.62)");
  g.addColorStop(0.5, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(207,228,251,0.62)");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, 0, width, height, 14);
  c.fill();
  c.save();
  c.clip();
  const rng = createRng("vault-frost");
  c.strokeStyle = "rgba(235,245,255,0.9)";
  c.lineCap = "round";
  for (let k = 0; k < 26; k++) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 6 + rng() * 12;
    c.lineWidth = 1.5 + rng() * 1.5;
    for (let a = 0; a < 6; a++) {
      const t = (a * Math.PI) / 3;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
      c.stroke();
    }
  }
  c.restore();
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.strokeStyle = "rgba(20,40,80,0.55)";
  c.lineWidth = 3;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const size = Math.round(width * 0.12);
  c.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  c.strokeText("SCRATCH", width / 2, height / 2 - size * 0.55);
  c.strokeText("THE FROST", width / 2, height / 2 + size * 0.55);
  c.fillText("SCRATCH", width / 2, height / 2 - size * 0.55);
  c.fillText("THE FROST", width / 2, height / 2 + size * 0.55);
};

/** A candle with a flickering flame, for the corners of the vault. */
function Candle({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`rg-vault-candle is-${side}`} viewBox="0 0 24 48" aria-hidden="true">
      <ellipse className="rg-vault-flame" cx="12" cy="9" rx="5" ry="8" fill="#ffd23f" stroke="#141414" strokeWidth="1.5" />
      <ellipse cx="12" cy="11" rx="2.2" ry="4" fill="#fff6c9" />
      <rect x="7" y="17" width="10" height="27" rx="2" fill="#fff3dc" stroke="#141414" strokeWidth="2" />
      <path d="M2 44 H22 V47 H2 Z" fill="#c99a2e" stroke="#141414" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Christmas skin of the Scratch Card: Scrooge's Secret Stash. A wall of ornate
 * green-and-gold safe-deposit boxes in a candlelit vault. Scratching the frost
 * off a box swings its door open on what is inside. The nine squares, and which
 * of them match, come from generateScratch exactly as on the classic card.
 */
export function VaultScratchBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateScratch(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { revealed, started, allRevealed, wrapRef, canvasRef, cellRefs, canvasHandlers, revealAll, resetCover } = useScratchSurface(9, paintFrost);
  /** Box numbers: decoration, from the seed only. */
  const boxes = useMemo(() => shuffle(createRng(`vault-boxes:${seed}`), Array.from({ length: 99 }, (_, i) => i + 1)).slice(0, 9), [seed]);

  // A creak each time doors open (once per batch, so "open all" is one sound).
  const opened = revealed.filter(Boolean).length;
  const openedBefore = useRef(0);
  useEffect(() => {
    if (opened > openedBefore.current) playSound("creak");
    openedBefore.current = opened;
  }, [opened]);

  useEffect(() => {
    if (!allRevealed) return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.winningCells.length ? 1400 : 900);
    return () => clearTimeout(t);
  }, [allRevealed, onReveal, reducedMotion, layout.winningCells.length]);

  const progress = scratchProgress(layout, revealed, started);
  let prompt: React.ReactNode;
  if (progress.kind === "done") prompt = <GamePrompt title={progress.won ? "Match 3!" : "No match this time"} tone={progress.won ? "pink" : "ink"} />;
  else if (progress.kind === "start") prompt = <GamePrompt title="Scratch the frost to open the boxes" />;
  else if (progress.kind === "pair")
    prompt = <GamePrompt title={`Two ${pluralLabel(progress.label)}! Keep going…`} sub={`${progress.left} box${progress.left === 1 ? "" : "es"} left to open`} />;
  else prompt = <GamePrompt title="Keep scratching…" sub={`${progress.left} box${progress.left === 1 ? "" : "es"} left to open`} />;

  return (
    <>
      <div className="rg-vault">
        <Candle side="left" />
        <Candle side="right" />
        <div className="rg-vault-head">
          <div className="rg-xmas-title">SCROOGE'S SECRET STASH</div>
          <div className="rg-vault-sub">Open three the same and it's yours</div>
        </div>
        <div className="rg-scratch-play rg-vault-play" ref={wrapRef}>
          <div className="rg-scratch-grid rg-vault-wall">
            {layout.cells.map((s, i) => {
              const win = allRevealed && layout.winningCells.includes(i);
              const dim = allRevealed && layout.winningCells.length > 0 && !win;
              return (
                <div
                  key={i}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  className={`rg-scratch-cell rg-vault-box ${revealed[i] ? "is-open" : ""} ${win ? "is-winning" : ""} ${dim ? "is-dim" : ""}`}
                  aria-label={revealed[i] ? (s.kind === "icon" ? s.icon : s.label) : `Box ${boxes[i]}, locked`}
                >
                  {s.kind === "icon" ? <Coin icon={s.icon} /> : <Coin tone="yellow" label={s.label} />}
                  <span className="rg-vault-door" aria-hidden="true">
                    <span className="rg-vault-plate">No. {boxes[i]}</span>
                    <span className="rg-vault-dial" />
                    <span className="rg-vault-handle" />
                    <i className="rg-vault-rivet is-tl" />
                    <i className="rg-vault-rivet is-tr" />
                    <i className="rg-vault-rivet is-bl" />
                    <i className="rg-vault-rivet is-br" />
                  </span>
                </div>
              );
            })}
          </div>
          <canvas ref={canvasRef} className={`rg-scratch-foil ${allRevealed ? "is-gone" : ""}`} {...canvasHandlers} aria-hidden="true" />
        </div>
        <div className="rg-scratch-foot">
          <span className="rg-scratch-ticket">Ticket {formatTicketNumber(ticket.ticketNumber)}</span>
          <span className="rg-scratch-brand">GIMME GIMME</span>
        </div>
      </div>
      {prompt}
      {!allRevealed && (
        <div className="rg-scratch-actions">
          <button type="button" className="rg-btn rg-btn-white" onClick={resetCover} disabled={!started}>
            Reset frost
          </button>
          <button type="button" className="rg-btn rg-btn-xmas-gold" onClick={revealAll}>
            Open all
          </button>
        </div>
      )}
      {!started && <p className="rg-note">{RESULT_SET_NOTE}</p>}
      <SoundToggle />
    </>
  );
}
