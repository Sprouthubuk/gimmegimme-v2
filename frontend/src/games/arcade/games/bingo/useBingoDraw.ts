import { useEffect, useMemo, useState } from "react";
import { BINGO_BALLS, BINGO_LINES, type BingoLayout } from "../generators";

const DRAW_MS = 420;

/**
 * Plays a bingo card's draws in order, shared by every bingo look (the classic
 * card and skinned ones such as Jingle Bell Bingo Bonanza). The balls and the card come from
 * generateBingo; this only decides how fast they appear.
 */
export function useBingoDraw(layout: BingoLayout, reducedMotion: boolean, onReveal: () => void) {
  const [drawn, setDrawn] = useState(0);
  const [started, setStarted] = useState(false);
  const done = drawn === layout.draws.length;

  useEffect(() => {
    if (!started || done) return;
    if (reducedMotion) {
      setDrawn(layout.draws.length);
      return;
    }
    const t = setTimeout(() => setDrawn((d) => d + 1), drawn === 0 ? 150 : DRAW_MS);
    return () => clearTimeout(t);
  }, [started, drawn, done, reducedMotion, layout.draws.length]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.winLine ? 1400 : 900);
    return () => clearTimeout(t);
  }, [done, onReveal, reducedMotion, layout.winLine]);

  const marked = useMemo(() => new Set(layout.draws.slice(0, drawn)), [layout.draws, drawn]);
  const isMarked = (cell: number) => layout.card[cell] === null || marked.has(layout.card[cell]!);
  const lastBall = drawn > 0 ? layout.draws[drawn - 1] : null;

  // "71 to win!" — the one number a line is waiting on.
  // It only ever appears on a ticket that does win: a losing card is never dressed up as close.
  let waitingOn: number | null = null;
  if (!done && layout.winLine) {
    for (const line of BINGO_LINES) {
      const missing = line.filter((c) => !isMarked(c));
      if (missing.length === 1) {
        waitingOn = layout.card[missing[0]];
        break;
      }
    }
  }

  return {
    started,
    start: () => setStarted(true),
    drawn,
    done,
    isMarked,
    lastBall,
    waitingOn,
    winCells: done && layout.winLine ? new Set(layout.winLine) : null,
    left: BINGO_BALLS - drawn,
    /** The last five balls, newest first. */
    recent: layout.draws.slice(Math.max(0, drawn - 5), drawn).reverse(),
  };
}
