/**
 * Pure board generators. Each takes the ticket's (already decided) prize and a
 * seed and returns a board that shows exactly that result:
 *  - a winning ticket shows its own prize and nothing else "wins";
 *  - a losing ticket never shows a winning combination.
 * Losing boards are laid out at random. Nothing here arranges a loss to look
 * closer to a win than chance makes it (see docs/drafts/spec-next-builds.md §2).
 * `decoys` are the competition's real prize labels; none are ever invented.
 * Tested in tests/reveal-games across thousands of seeds.
 */
import type { RevealPrize } from "../contract";
import { createRng, fillCapped, pick, randInt, shuffle } from "../rng";
import { winLabel, type Tone } from "./symbols";

// ---------------------------------------------------------------- scratch card

export type ScratchIcon = "smile" | "star" | "heart" | "diamond" | "club";
export const SCRATCH_ICONS: ScratchIcon[] = ["smile", "star", "heart", "diamond", "club"];
export type ScratchSymbol = { kind: "label"; label: string } | { kind: "icon"; icon: ScratchIcon };
export const symbolKey = (s: ScratchSymbol) => (s.kind === "icon" ? `:${s.icon}` : s.label);

export interface ScratchCardLayout {
  cells: ScratchSymbol[]; // 9, row-major
  winningCells: number[]; // empty on a loss
}

export function generateScratch(prize: RevealPrize | null, decoys: readonly string[], seed: string): ScratchCardLayout {
  const rng = createRng(`scratch:${seed}`);
  // Five plain icons guarantee enough variety even when the competition has one prize tier.
  const pool: ScratchSymbol[] = [
    ...decoys.map((label) => ({ kind: "label" as const, label })),
    ...SCRATCH_ICONS.map((icon) => ({ kind: "icon" as const, icon })),
  ];
  const w = winLabel(prize);
  if (!w) return { cells: fillCapped(rng, pool, 9, 2), winningCells: [] };

  const winningCells = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3).sort((a, b) => a - b);
  const others = fillCapped(rng, pool, 6, 2);
  const cells = Array.from({ length: 9 }, (_, i) => (winningCells.includes(i) ? { kind: "label" as const, label: w } : others.pop()!));
  return { cells, winningCells };
}

// ------------------------------------------------------------------------ gems

export type GemKind = "pink" | "blue" | "gold" | "dud";
export const GEM_COLOURS: GemKind[] = ["pink", "blue", "gold"];
export const GEM_PICKS = 6;

export interface GemsLayout {
  /** Only gems that stand for a real prize are listed. */
  paytable: { gem: GemKind; label: string }[];
  /** What the 1st, 2nd … 6th tile the player taps turns out to be. */
  picks: GemKind[];
  winGem: GemKind | null;
}

export function generateGems(prize: RevealPrize | null, decoys: readonly string[], seed: string): GemsLayout {
  const rng = createRng(`gems:${seed}`);
  const w = winLabel(prize);
  const labels = shuffle(rng, decoys);
  const colours = shuffle(rng, GEM_COLOURS);
  if (!w) {
    return {
      paytable: colours.slice(0, labels.length).map((gem, i) => ({ gem, label: labels[i] })),
      picks: fillCapped(rng, ["pink", "blue", "gold", "dud"] as GemKind[], GEM_PICKS, 2),
      winGem: null,
    };
  }
  const winGem = colours[0];
  const paytable = [{ gem: winGem, label: w }, ...colours.slice(1, 1 + labels.length).map((gem, i) => ({ gem, label: labels[i] }))];
  // The third matching gem lands on pick 5 or 6, so the board is still being played when it appears.
  const last = randInt(rng, 4, 5);
  const earlier = shuffle(rng, Array.from({ length: last }, (_, i) => i)).slice(0, 2);
  const fillers = fillCapped(rng, (["pink", "blue", "gold", "dud"] as GemKind[]).filter((g) => g !== winGem), GEM_PICKS - 3, 2);
  const picks = Array.from({ length: GEM_PICKS }, (_, i) => (i === last || earlier.includes(i) ? winGem : fillers.pop()!));
  return { paytable, picks, winGem };
}

// ----------------------------------------------------------------------- slots

export type SlotSymbol = "coin" | "seven" | "bar" | "star" | "diamond" | "smile";
export const SLOT_SYMBOLS: SlotSymbol[] = ["coin", "seven", "bar", "star", "diamond", "smile"];

export interface SlotsLayout {
  /** Symbols that stand for a real prize. May be empty on a loss in a one-prize competition. */
  paytable: { symbol: SlotSymbol; label: string }[];
  /** Final visible window per reel: [top, payline, bottom]. */
  windows: [SlotSymbol, SlotSymbol, SlotSymbol][];
  /** Full strip per reel, top → bottom. The window is strip[0..2]; spinning scrolls from the end back to 0. */
  strips: SlotSymbol[][];
  win: boolean;
}

export function generateSlots(prize: RevealPrize | null, decoys: readonly string[], seed: string): SlotsLayout {
  const rng = createRng(`slots:${seed}`);
  const w = winLabel(prize);
  const labels = shuffle(rng, decoys);
  const paying = shuffle(rng, ["coin", "seven", "diamond"] as SlotSymbol[]);
  const paytable = w
    ? [{ symbol: paying[0], label: w }, ...labels.slice(0, 1).map((label) => ({ symbol: paying[1], label }))]
    : labels.slice(0, 2).map((label, i) => ({ symbol: paying[i], label }));

  let payline: SlotSymbol[];
  if (w) payline = [paying[0], paying[0], paying[0]];
  else {
    // Three independent random symbols; only an accidental three-in-a-row is changed.
    payline = [pick(rng, SLOT_SYMBOLS), pick(rng, SLOT_SYMBOLS), pick(rng, SLOT_SYMBOLS)];
    if (payline[0] === payline[1] && payline[1] === payline[2]) payline[2] = pick(rng, SLOT_SYMBOLS.filter((s) => s !== payline[0]));
  }
  const windows = payline.map((mid) => [pick(rng, SLOT_SYMBOLS), mid, pick(rng, SLOT_SYMBOLS)] as [SlotSymbol, SlotSymbol, SlotSymbol]);
  const strips = windows.map((win, r) => [...win, ...Array.from({ length: 18 + r * 7 }, () => pick(rng, SLOT_SYMBOLS))]);
  return { paytable, windows, strips, win: !!w };
}

// ----------------------------------------------------------------------- wheel

export interface WheelSegment { label: string; kind: "prize" | "none"; tone: Tone }
export interface WheelLayout { segments: WheelSegment[]; target: number }

export const WHEEL_SEGMENTS = 12;
export const NO_WIN_LABEL = "NO WIN";
const NO_WIN_AT = [1, 4, 7, 10];

export function generateWheel(prize: RevealPrize | null, decoys: readonly string[], seed: string): WheelLayout {
  const rng = createRng(`wheel:${seed}`);
  const w = winLabel(prize);
  const prizeSlots = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => i).filter((i) => !NO_WIN_AT.includes(i));
  const winAt = w ? pick(rng, prizeSlots) : -1;
  const decoyOrder = shuffle(rng, decoys);
  const tones: Tone[] = ["yellow", "cyan", "pink"];
  let d = 0;
  const segments = Array.from({ length: WHEEL_SEGMENTS }, (_, i): WheelSegment => {
    const none: WheelSegment = { label: NO_WIN_LABEL, kind: "none", tone: "white" };
    if (NO_WIN_AT.includes(i)) return none;
    const tone = tones[prizeSlots.indexOf(i) % 3];
    if (i === winAt) return { label: w!, kind: "prize", tone };
    // With no other real prizes to show, the remaining segments are plain "no win".
    return decoyOrder.length ? { label: decoyOrder[d++ % decoyOrder.length], kind: "prize", tone } : none;
  });
  const noWin = segments.map((s, i) => (s.kind === "none" ? i : -1)).filter((i) => i >= 0);
  return { segments, target: w ? winAt : pick(rng, noWin) };
}

// ------------------------------------------------------------------- coin drop

export const COIN_BINS = 7;
export interface CoinDropLayout {
  bins: { label: string | null; tone: Tone }[]; // null = ✕ (no prize)
  /** Bins the coin may land in. On a win these all show the prize; on a loss they are all ✕. */
  targets: number[];
}

export function generateCoinDrop(prize: RevealPrize | null, decoys: readonly string[], seed: string): CoinDropLayout {
  const rng = createRng(`coindrop:${seed}`);
  const w = winLabel(prize);
  const groups = [[0, 6], [2, 4], [3]];
  const winGroup = w ? randInt(rng, 0, 2) : -1;
  const labels = shuffle(rng, decoys);
  const bins: CoinDropLayout["bins"] = Array.from({ length: COIN_BINS }, () => ({ label: null, tone: "white" as Tone }));
  let d = 0;
  groups.forEach((g, gi) => {
    const label = gi === winGroup ? w! : (labels[d++] ?? null);
    if (label === null) return;
    for (const b of g) bins[b] = { label, tone: gi === 0 ? "yellow" : gi === 1 ? "cyan" : "pink" };
  });
  const empty = bins.map((b, i) => (b.label === null ? i : -1)).filter((i) => i >= 0);
  return { bins, targets: w ? groups[winGroup] : empty };
}

// ----------------------------------------------------------------------- bingo

export const BINGO_BALLS = 20;
export const BINGO_LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export interface BingoLayout {
  card: (number | null)[]; // 25 cells row-major; centre (12) is the free smiley
  draws: number[]; // balls in order; on a win, the last ball completes the line
  winLine: number[] | null;
}

/** Index in `draws` at which the first line completes, or -1. */
export function firstLineAt(card: (number | null)[], draws: readonly number[]): number {
  const marked = new Set<number>();
  for (let i = 0; i < draws.length; i++) {
    marked.add(draws[i]);
    if (BINGO_LINES.some((line) => line.every((c) => card[c] === null || marked.has(card[c]!)))) return i;
  }
  return -1;
}

export function generateBingo(prize: RevealPrize | null, seed: string): BingoLayout {
  const rng = createRng(`bingo:${seed}`);
  const card: (number | null)[] = Array(25).fill(null);
  for (let c = 0; c < 5; c++) {
    const nums = shuffle(rng, Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5).sort((a, b) => a - b);
    for (let r = 0; r < 5; r++) if (!(r === 2 && c === 2)) card[r * 5 + c] = nums[r];
  }
  const onCard = new Set(card.filter((n): n is number => n !== null));
  const all = Array.from({ length: 75 }, (_, i) => i + 1);

  if (!prize) {
    // A loss is twenty balls drawn at random. A draw that happens to complete a line is redrawn.
    for (let attempt = 0; attempt < 60; attempt++) {
      const draws = shuffle(rng, all).slice(0, BINGO_BALLS);
      if (firstLineAt(card, draws) === -1) return { card, draws, winLine: null };
    }
    // Numbers that aren't on the card can never complete a line.
    return { card, draws: shuffle(rng, all.filter((n) => !onCard.has(n))).slice(0, BINGO_BALLS), winLine: null };
  }

  const line = pick(rng, BINGO_LINES);
  const lineNums = shuffle(rng, line.map((c) => card[c]).filter((n): n is number => n !== null));
  const build = (offCardOnly: boolean): number[] => {
    const fillerPool = shuffle(rng, all.filter((n) => !lineNums.includes(n) && (!offCardOnly || !onCard.has(n))));
    const last = randInt(rng, 13, BINGO_BALLS - 1);
    const slots = shuffle(rng, Array.from({ length: last }, (_, i) => i)).slice(0, lineNums.length - 1);
    const draws: number[] = [];
    let li = 0;
    for (let i = 0; i < last; i++) draws.push(slots.includes(i) ? lineNums[li++] : fillerPool.pop()!);
    draws.push(lineNums[li]);
    return draws;
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    const draws = build(false);
    if (firstLineAt(card, draws) === draws.length - 1) return { card, draws, winLine: line };
  }
  return { card, draws: build(true), winLine: line };
}

export const bingoLetter = (n: number) => "BINGO"[Math.floor((n - 1) / 15)];

// ---------------------------------------------------------------- balloon pop

export type BalloonColour = "pink" | "cyan" | "yellow";
/** Cosmetic only: the colour of each balloon slot, the same on every replay. */
export function balloonColours(count: number, seed: string): BalloonColour[] {
  const rng = createRng(`balloons:${seed}`);
  const colours: BalloonColour[] = ["pink", "cyan", "yellow"];
  return Array.from({ length: count }, () => pick(rng, colours));
}

export interface BalloonLook {
  colour: BalloonColour;
  size: "s" | "m" | "l";
  /** Seconds to float from the bottom of the sky to the top. */
  duration: number;
  /** Side-to-side sway in px. */
  sway: number;
}
/**
 * Cosmetic only, and the same on every replay. Built from the seed and the
 * balloon's position alone: a balloon's look can never hint at what is inside.
 */
export function balloonLooks(count: number, seed: string): BalloonLook[] {
  const rng = createRng(`balloon-looks:${seed}`);
  const colours = balloonColours(count, seed);
  const sizes: BalloonLook["size"][] = ["s", "m", "m", "l"];
  return colours.map((colour) => ({
    colour,
    size: pick(rng, sizes),
    // Slow enough to tap comfortably on a phone, and close enough in speed that balloons stay spread out.
    duration: 10 + Math.round(rng() * 25) / 10,
    sway: 4 + Math.round(rng() * 8),
  }));
}
