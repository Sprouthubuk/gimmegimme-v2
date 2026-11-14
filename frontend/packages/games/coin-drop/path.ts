/**
 * Coin Drop path maths, kept apart from the drawing so it can be tested. The board has ROWS rows of pegs in a
 * triangle; each bounce sends the coin one half-gap left or right, and the number of rights picks the bin.
 * The result is the ticket's (decided on the server): the path is chosen to land in a bin of that kind.
 */
export const ROWS = 6;
export const BINS = ROWS + 1;
/** Bins 1, 3 and 5 are prize bins; 0, 2, 4 and 6 are "no win". */
export const isWinBin = (b: number) => b % 2 === 1;

/** A path of ROWS moves (false = left, true = right) that lands in a bin matching `win`. */
export function coinPath(win: boolean, rand: (n: number) => number): boolean[] {
  const bins = Array.from({ length: BINS }, (_, b) => b).filter((b) => isWinBin(b) === win);
  const bin = bins[rand(bins.length)];
  const moves = Array.from({ length: ROWS }, (_, i) => i < bin);
  for (let i = moves.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return moves;
}

export const binOf = (moves: readonly boolean[]) => moves.filter(Boolean).length;
