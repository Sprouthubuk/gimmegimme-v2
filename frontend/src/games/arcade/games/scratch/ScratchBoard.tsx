import { useEffect, useMemo } from "react";
import type { BoardProps } from "../types";
import { generateScratch } from "../generators";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { formatTicketNumber } from "../../money";
import { pluralLabel, scratchProgress, useScratchSurface, type PaintCover } from "./useScratchSurface";
import "./scratch.css";

/** Brushed silver foil with a fine diamond pattern and gold lettering, like a printed lottery card. */
const paintFoil: PaintCover = (c, width, height) => {
  const g = c.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#b8bcc9");
  g.addColorStop(0.35, "#eceef4");
  g.addColorStop(0.55, "#c4c8d4");
  g.addColorStop(1, "#e3e5ec");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, 0, width, height, 14);
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 1;
  for (let x = -height; x < width + height; x += 12) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + height, height);
    c.moveTo(x + height, 0);
    c.lineTo(x, height);
    c.stroke();
  }
  const shine = c.createLinearGradient(0, 0, width, 0);
  shine.addColorStop(0.3, "rgba(255,255,255,0)");
  shine.addColorStop(0.5, "rgba(255,255,255,0.35)");
  shine.addColorStop(0.7, "rgba(255,255,255,0)");
  c.fillStyle = shine;
  c.fillRect(0, 0, width, height);
  c.restore();
  c.textAlign = "center";
  c.textBaseline = "middle";
  const size = Math.round(width * 0.13);
  c.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  const gold = c.createLinearGradient(0, height / 2 - size, 0, height / 2 + size);
  gold.addColorStop(0, "#ffe680");
  gold.addColorStop(1, "#c98500");
  c.fillStyle = "rgba(60,30,0,0.35)";
  c.fillText("SCRATCH", width / 2, height / 2 - size * 0.55 + 2);
  c.fillText("HERE", width / 2, height / 2 + size * 0.55 + 2);
  c.fillStyle = gold;
  c.fillText("SCRATCH", width / 2, height / 2 - size * 0.55);
  c.fillText("HERE", width / 2, height / 2 + size * 0.55);
};

export function ScratchBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateScratch(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { revealed, started, allRevealed, wrapRef, canvasRef, cellRefs, canvasHandlers, revealAll, resetCover } = useScratchSurface(9, paintFoil);

  useEffect(() => {
    if (!allRevealed) return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.winningCells.length ? 1300 : 800);
    return () => clearTimeout(t);
  }, [allRevealed, onReveal, reducedMotion, layout.winningCells.length]);

  const progress = scratchProgress(layout, revealed, started);
  let prompt: React.ReactNode;
  if (progress.kind === "done") prompt = <GamePrompt title={progress.won ? "Match 3!" : "No match this time"} tone={progress.won ? "pink" : "ink"} />;
  else if (progress.kind === "start") prompt = <GamePrompt title="Scratch the foil to reveal" />;
  else if (progress.kind === "pair")
    prompt = <GamePrompt title={`Two ${pluralLabel(progress.label)}! Keep going…`} sub={`${progress.left} square${progress.left === 1 ? "" : "s"} left to scratch`} />;
  else prompt = <GamePrompt title="Keep scratching…" sub={`${progress.left} square${progress.left === 1 ? "" : "s"} left to scratch`} />;

  return (
    <>
      <div className="rg-board-wrap">
        <div className="rg-board-wrap-in">
  <div className="rg-scratch-card">
          <div className="rg-scratch-sheen" />
          <div className="rg-scratch-head">
            <div className="rg-scratch-title">MATCH 3 TO WIN</div>
            <div className="rg-scratch-sub">Find three the same and it's yours</div>
          </div>
          <div className="rg-scratch-play" ref={wrapRef}>
            <div className="rg-scratch-grid">
              {layout.cells.map((s, i) => {
                const win = allRevealed && layout.winningCells.includes(i);
                const dim = allRevealed && layout.winningCells.length > 0 && !win;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      cellRefs.current[i] = el;
                    }}
                    className={`rg-scratch-cell ${win ? "is-winning" : ""} ${dim ? "is-dim" : ""}`}
                    aria-label={revealed[i] ? (s.kind === "icon" ? s.icon : s.label) : "Hidden"}
                  >
                    {s.kind === "icon" ? <Coin icon={s.icon} /> : <Coin label={s.label} />}
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
        </div>
      </div>
      {prompt}
      {!allRevealed && (
        <div className="rg-scratch-actions">
          <button type="button" className="rg-btn rg-btn-white" onClick={resetCover} disabled={!started}>
            Reset foil
          </button>
          <button type="button" className="rg-btn rg-btn-cyan" onClick={revealAll}>
            Reveal card
          </button>
        </div>
      )}
      {!started && <p className="rg-note">{RESULT_SET_NOTE}</p>}
    </>
  );
}
