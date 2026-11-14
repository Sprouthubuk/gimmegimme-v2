/**
 * Bingo Card board maths, kept apart from the drawing so it can be tested. A 3×3 card; the result is the
 * ticket's (decided on the server). A winning card gets a full line; a no-win card is marked at random from
 * every set that makes no line, so it is never arranged to look close.
 */
export const SIZE = 3;
export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
export const MARKS = 4;

export const hasLine = (marked: ReadonlySet<number>) => LINES.some((l) => l.every((c) => marked.has(c)));

function subsets(k: number): number[][] {
  const out: number[][] = [];
  const go = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < SIZE * SIZE; i++) { acc.push(i); go(i + 1, acc); acc.pop(); }
  };
  go(0, []);
  return out;
}
const WINNING = subsets(MARKS).filter((s) => hasLine(new Set(s)));
const LOSING = subsets(MARKS).filter((s) => !hasLine(new Set(s)));

export interface BingoBoard {
  /** The nine numbers on the card, left to right, top to bottom. */
  numbers: number[];
  /** Card positions that get marked. */
  marked: number[];
  /** The balls called, in order: the marked numbers plus some that are not on the card. */
  calls: number[];
  /** The completed line (cells), or null for a no-win card. */
  line: readonly number[] | null;
}

export function bingoBoard(win: boolean, rand: (n: number) => number): BingoBoard {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const take = () => pool.splice(rand(pool.length), 1)[0];
  const numbers = Array.from({ length: SIZE * SIZE }, take).sort((a, b) => a - b);
  const sets = win ? WINNING : LOSING;
  const marked = sets[rand(sets.length)];
  const extra = [take(), take()];
  const calls = [...marked.map((c) => numbers[c]), ...extra];
  for (let i = calls.length - 1; i > 0; i--) { const j = rand(i + 1); [calls[i], calls[j]] = [calls[j], calls[i]]; }
  const set = new Set(marked);
  return { numbers, marked, calls, line: LINES.find((l) => l.every((c) => set.has(c))) ?? null };
}
