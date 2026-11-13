import { useEffect, useMemo } from "react";
import type { BoardProps } from "../../games/types";
import { BINGO_BALLS, bingoLetter, generateBingo } from "../../games/generators";
import { useBingoDraw } from "../../games/bingo/useBingoDraw";
import { Mascot } from "../../shell/Mascot";
import { GamePrompt } from "../../shell/GamePrompt";
import { festiveCall } from "./festive";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "../../games/bingo/bingo.css";
import "./jingleBingo.css";

/** Candy-cane red, mint and gold. */
const LETTER_TONE: Record<string, string> = { B: "red", I: "mint", N: "gold", G: "red", O: "mint" };

/** A shiny bauble with a gold cap, in place of a bingo ball. */
function Bauble({ n, big }: { n: number; big?: boolean }) {
  const letter = bingoLetter(n);
  return (
    <span className={`rg-bauble rg-bauble-${LETTER_TONE[letter]} ${big ? "is-big" : ""}`} aria-label={`${letter} ${n}`}>
      <span className="rg-bauble-cap" aria-hidden="true" />
      <span className="rg-bauble-inner">
        <small>{letter}</small>
        {n}
      </span>
    </span>
  );
}

/** The dauber: a candy-cane marker with holly on top, stamping the number just called. */
function Dauber() {
  return (
    <svg className="rg-dauber" viewBox="0 0 40 70" aria-hidden="true">
      <defs>
        <pattern id="rg-cane" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="10" height="10" fill="#fff" />
          <rect width="5" height="10" fill="#e0283a" />
        </pattern>
      </defs>
      <ellipse cx="13" cy="9" rx="8" ry="4.5" fill="#1fae5b" stroke="#141414" strokeWidth="2" transform="rotate(-25 13 9)" />
      <ellipse cx="27" cy="9" rx="8" ry="4.5" fill="#1fae5b" stroke="#141414" strokeWidth="2" transform="rotate(25 27 9)" />
      <circle cx="20" cy="12" r="4" fill="#e0283a" stroke="#141414" strokeWidth="2" />
      <rect x="11" y="15" width="18" height="40" rx="6" fill="url(#rg-cane)" stroke="#141414" strokeWidth="3" />
      <path d="M11 55 H29 L25 66 H15 Z" fill="#e0283a" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Christmas skin of the Bingo Card: Jingle Bell Bingo Bonanza. Baubles for balls, a candy-cane
 * dauber, a festive border and caller lines. The card and the order of the draw
 * come from generateBingo exactly as on the classic card.
 */
export function JingleBingoBoard({ ticket, seed, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateBingo(ticket.prize, seed), [ticket.prize, seed]);
  const { started, start, drawn, done, isMarked, lastBall, waitingOn, winCells, left, recent } = useBingoDraw(layout, reducedMotion, onReveal);

  useEffect(() => {
    if (done && layout.winLine) playSound("bells");
  }, [done, layout.winLine]);

  const call = lastBall === null ? null : festiveCall(lastBall);

  let prompt: React.ReactNode;
  if (!started) prompt = null;
  else if (done) prompt = <GamePrompt title={layout.winLine ? "JINGLE BINGO!" : "No line this time"} tone={layout.winLine ? "pink" : "ink"} />;
  else if (waitingOn) prompt = <GamePrompt title="1 to go!" tone="pink" sub={`${left} bauble${left === 1 ? "" : "s"} left to draw`} />;
  else prompt = <GamePrompt title="Drawing…" sub={`${left} bauble${left === 1 ? "" : "s"} left to draw`} />;

  return (
    <>
      <div className="rg-xmas-title rg-jingle-title">JINGLE BELL BINGO BONANZA</div>
      <div className="rg-bingo-tray rg-jingle-tray" aria-live="polite">
        {recent.length ? (
          <>
            <div className="rg-bingo-balls">
              {recent.map((n, i) => (
                <span key={`${n}-${drawn}`} className={i === 0 ? "rg-ball-new" : ""}>
                  <Bauble n={n} big={i === 0} />
                </span>
              ))}
            </div>
            <div className="rg-bingo-left">
              <small>BAUBLES LEFT</small>
              <strong>{left}</strong>
            </div>
          </>
        ) : (
          <span className="rg-bingo-placeholder">Baubles appear here</span>
        )}
        {waitingOn && <span className="rg-bingo-sticker">{waitingOn} to win!</span>}
      </div>
      <p className="rg-jingle-call" aria-live="polite">
        {lastBall === null ? " " : call ? `${lastBall}: ${call}` : `${bingoLetter(lastBall)} ${lastBall}`}
      </p>

      <div className="rg-jingle-frame">
        <div className="rg-bingo-card rg-jingle-card" role="grid" aria-label="Jingle Bell Bingo Bonanza card">
          {"BINGO".split("").map((l) => (
            <div key={l} className={`rg-bingo-head rg-jingle-head is-${LETTER_TONE[l]}`}>{l}</div>
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
                {justHit && !reducedMotion && <Dauber />}
              </div>
            );
          })}
        </div>
      </div>

      {!started ? (
        <div className="rg-bingo-controls">
          <button type="button" className="rg-btn rg-btn-xmas" onClick={start}>
            DRAW BAUBLES
          </button>
          <p className="rg-note">{BINGO_BALLS} baubles per card. Any full line wins. Result set when you bought.</p>
          <SoundToggle />
        </div>
      ) : (
        prompt
      )}
    </>
  );
}
