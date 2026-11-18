import { useMemo } from "react";
import type { BoardProps } from "../types";
import { BINGO_BALLS, bingoLetter, generateBingo } from "../generators";
import { Mascot } from "../../shell/Mascot";
import { GamePrompt } from "../../shell/GamePrompt";
import { useBingoDraw } from "./useBingoDraw";
import "./bingo.css";
import { Scene3D } from "../../three/Scene3D";
import { buildBingoScene, CLASSIC_BINGO_3D, type BingoState } from "../../three/bingoScene";

const LETTER_TONE: Record<string, string> = { B: "pink", I: "cyan", N: "yellow", G: "pink", O: "cyan" };

function Ball({ n, big }: { n: number; big?: boolean }) {
  const letter = bingoLetter(n);
  return (
    <span className={`rg-ball rg-ball-${LETTER_TONE[letter]} ${big ? "is-big" : ""}`} aria-label={`${letter} ${n}`}>
      <span className="rg-ball-inner">
        <small>{letter}</small>
        {n}
      </span>
    </span>
  );
}

export function BingoBoard({ ticket, seed, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateBingo(ticket.prize, seed), [ticket.prize, seed]);
  const { started, start, drawn, done, isMarked, lastBall, waitingOn, winCells, left, recent } = useBingoDraw(layout, reducedMotion, onReveal);

  const state3d: BingoState = { started, drawn, draws: layout.draws, done, win: !!layout.winLine, left, start };
  const tray = (
      <div className="rg-bingo-tray" aria-live="polite">
        {recent.length ? (
          <>
            <div className="rg-bingo-balls">
              {recent.map((n, i) => (
                <span key={`${n}-${drawn}`} className={i === 0 ? "rg-ball-new" : ""}>
                  <Ball n={n} big={i === 0} />
                </span>
              ))}
            </div>
            <div className="rg-bingo-left">
              <small>BALLS LEFT</small>
              <strong>{left}</strong>
            </div>
          </>
        ) : (
          <span className="rg-bingo-placeholder">Balls appear here</span>
        )}
        {waitingOn && <span className="rg-bingo-sticker">{waitingOn} to win!</span>}
      </div>
  );

  let prompt: React.ReactNode;
  if (!started) prompt = null;
  else if (done) prompt = <GamePrompt title={layout.winLine ? "BINGO!" : "No line this time"} tone={layout.winLine ? "pink" : "ink"} />;
  else if (waitingOn) prompt = <GamePrompt title="1 to go!" tone="pink" sub={`${left} ball${left === 1 ? "" : "s"} left to draw`} />;
  else prompt = <GamePrompt title="Drawing…" sub={`${left} ball${left === 1 ? "" : "s"} left to draw`} />;

  return (
    <>
      <Scene3D
        state={state3d}
        setup={(ctx) => buildBingoScene(ctx, CLASSIC_BINGO_3D)}
        seed={`bingo:${ticket.ticketNumber}`}
        reducedMotion={reducedMotion}
        aspect={0.74}
        fallback={tray}
        label="Bingo ball machine"
      >
        {waitingOn && <span className="rg3-sticker">{waitingOn} to win!</span>}
        <span className="rg-sr-only" aria-live="polite">{lastBall ? `${bingoLetter(lastBall)} ${lastBall}. ${left} left.` : ""}</span>
      </Scene3D>

      <div className="rg-bingo-card" role="grid" aria-label="Bingo card">
        {"BINGO".split("").map((l) => (
          <div key={l} className={`rg-bingo-head rg-ball-${LETTER_TONE[l]}`}>{l}</div>
        ))}
        {layout.card.map((n, cell) => {
          const m = isMarked(cell);
          const justHit = n !== null && n === lastBall;
          return (
            <div
              key={cell}
              role="gridcell"
              className={`rg-bingo-cell ${n === null ? "is-free" : ""} ${m && n !== null ? "is-marked" : ""} ${justHit ? "is-new" : ""} ${winCells?.has(cell) ? "is-win" : ""}`}
              aria-label={n === null ? "Free space" : `${n}${m ? ", marked" : ""}`}
            >
              {n === null ? <Mascot mood="smile" /> : <span>{n}</span>}
            </div>
          );
        })}
      </div>

      {!started ? (
        <div className="rg-bingo-controls">
          <button type="button" className="rg-btn rg-btn-yellow" onClick={start}>
            DRAW BALLS
          </button>
          <p className="rg-note">{BINGO_BALLS} balls per card. Any full line wins. Result set when you bought.</p>
        </div>
      ) : (
        prompt
      )}
    </>
  );
}
