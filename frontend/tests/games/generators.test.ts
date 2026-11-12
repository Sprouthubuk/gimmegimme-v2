// Result-integrity tests for the arcade reveal games.
//
// A reveal game only shows a result the server already decided. These tests
// prove, across thousands of seeds, that a board can never show anything else:
// a winning ticket shows exactly its own prize, and a losing ticket never shows
// a winning combination. They also check that boards only use the competition's
// real prize labels, however few there are.
//
//   cd tests/reveal-games && bun test
import { describe, expect, it } from "vitest";
import type { RevealPrize } from "../../src/games/types";
import { prizeShortLabel } from "../../src/games/arcade/money";
import {
  BINGO_BALLS,
  BINGO_LINES,
  NO_WIN_LABEL,
  balloonColours,
  balloonLooks,
  firstLineAt,
  generateBingo,
  generateCoinDrop,
  generateGems,
  generateScratch,
  generateSlots,
  generateWheel,
  symbolKey,
} from "../../src/games/arcade/games/generators";
import { usableDecoys } from "../../src/games/arcade/games/symbols";

const SEEDS = Array.from({ length: 1500 }, (_, i) => `purchase-${i}:comp-${i % 5}:${10000 + i}`);
const PRIZES: RevealPrize[] = [
  { name: "£10 Site Credit", valuePence: 1000, type: "site_credit" },
  { name: "£6.66 Site Credit", valuePence: 666, type: "site_credit" },
  { name: "£50 Cash", valuePence: 5000, type: "cash" },
  { name: "AirPods Pro", valuePence: 22900, type: "physical" },
];
// A competition can have many prize tiers, one, or (for the board's purposes) none besides the win.
const LADDERS: string[][] = [[], ["£5"], ["£10", "£5"], ["£1", "£5", "£10", "£50", "£100", "AirPods Pro"]];

function counts<T>(xs: T[]): Map<T, number> {
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return m;
}
const isIcon = (k: string) => k.startsWith(":");

/** Runs `check` for every prize × prize ladder × seed, and for a losing ticket × ladder × seed. */
function everyCase(check: (prize: RevealPrize | null, decoys: string[], seed: string, ladder: string[]) => void) {
  for (const ladder of LADDERS) {
    for (const prize of [...PRIZES, null]) {
      const decoys = usableDecoys(ladder, prize ? prizeShortLabel(prize) : null);
      for (const seed of SEEDS) check(prize, decoys, seed, ladder);
    }
  }
}

describe("decoys", () => {
  it("drop the winning label and are never padded with made-up prizes", () => {
    expect(usableDecoys(["£10"], "£10")).toEqual([]);
    expect(usableDecoys(["£10", "£5", "£5"], "£10")).toEqual(["£5"]);
    expect(usableDecoys([], null)).toEqual([]);
  });
});

describe("scratch card", () => {
  it("a win shows exactly three of its prize; nothing else reaches three; only real prizes appear", () => {
    everyCase((prize, decoys, seed, ladder) => {
      const card = generateScratch(prize, decoys, seed);
      expect(card.cells).toHaveLength(9);
      const c = counts(card.cells.map(symbolKey));
      const label = prize ? prizeShortLabel(prize) : null;
      for (const [k, n] of c) {
        if (k === label) expect(n).toBe(3);
        else expect(n).toBeLessThanOrEqual(2);
        if (!isIcon(k) && k !== label) expect(ladder).toContain(k);
      }
      if (label) expect(card.winningCells.map((i) => symbolKey(card.cells[i]))).toEqual([label, label, label]);
      else expect(card.winningCells).toEqual([]);
    });
  });
  it("is the same board every time for the same ticket", () => {
    expect(generateScratch(PRIZES[0], ["£5"], "x")).toEqual(generateScratch(PRIZES[0], ["£5"], "x"));
  });
});

describe("gems", () => {
  it("a win reaches three of the gem that pays its prize, on pick 5 or 6; a loss never reaches three", () => {
    everyCase((prize, decoys, seed, ladder) => {
      const g = generateGems(prize, decoys, seed);
      expect(g.picks).toHaveLength(6);
      const c = counts(g.picks);
      for (const [k, n] of c) expect(n).toBeLessThanOrEqual(k === g.winGem ? 3 : 2);
      const label = prize ? prizeShortLabel(prize) : null;
      for (const row of g.paytable) if (row.label !== label) expect(ladder).toContain(row.label);
      expect(new Set(g.paytable.map((p) => p.gem)).size).toBe(g.paytable.length);
      if (label) {
        expect(c.get(g.winGem!)).toBe(3);
        expect(g.paytable.filter((p) => p.label === label)).toEqual([{ gem: g.winGem!, label }]);
        const third = g.picks.map((p, i) => (p === g.winGem ? i : -1)).filter((i) => i >= 0)[2];
        expect(third).toBeGreaterThanOrEqual(4);
      } else expect(g.winGem).toBeNull();
    });
  });
});

describe("slots", () => {
  it("a win lines up three of the symbol that pays its prize; a loss never lines up three", () => {
    everyCase((prize, decoys, seed, ladder) => {
      const s = generateSlots(prize, decoys, seed);
      const line = s.windows.map((w) => w[1]);
      const label = prize ? prizeShortLabel(prize) : null;
      for (const row of s.paytable) if (row.label !== label) expect(ladder).toContain(row.label);
      s.strips.forEach((strip, r) => expect(strip.slice(0, 3)).toEqual(s.windows[r]));
      if (label) {
        expect(new Set(line).size).toBe(1);
        expect(s.paytable.find((p) => p.symbol === line[0])!.label).toBe(label);
      } else expect(new Set(line).size).toBeGreaterThan(1);
    });
  });
  it("losing reels are not steered towards two matching symbols", () => {
    // Three independent symbols from six match on the first two reels about 1 time in 6.
    const firstTwoMatch = SEEDS.filter((seed) => {
      const line = generateSlots(null, [], seed).windows.map((w) => w[1]);
      return line[0] === line[1];
    }).length;
    expect(firstTwoMatch / SEEDS.length).toBeLessThan(0.25);
  });
});

describe("wheel", () => {
  it("a win lands on the one segment carrying its prize; a loss lands on NO WIN", () => {
    everyCase((prize, decoys, seed, ladder) => {
      const w = generateWheel(prize, decoys, seed);
      expect(w.segments).toHaveLength(12);
      const label = prize ? prizeShortLabel(prize) : null;
      for (const s of w.segments) {
        if (s.kind === "none") expect(s.label).toBe(NO_WIN_LABEL);
        else if (s.label !== label) expect(ladder).toContain(s.label);
      }
      if (label) {
        expect(w.segments[w.target].label).toBe(label);
        expect(w.segments.filter((s) => s.label === label)).toHaveLength(1);
      } else expect(w.segments[w.target].kind).toBe("none");
    });
  });
});

describe("coin drop", () => {
  it("on a win every landing bin shows the prize and no other bin does; a loss only lands on ✕", () => {
    everyCase((prize, decoys, seed, ladder) => {
      const c = generateCoinDrop(prize, decoys, seed);
      expect(c.targets.length).toBeGreaterThan(0);
      const label = prize ? prizeShortLabel(prize) : null;
      c.bins.forEach((b, i) => {
        if (label) expect(b.label === label).toBe(c.targets.includes(i));
        else if (c.targets.includes(i)) expect(b.label).toBeNull();
        if (b.label !== null && b.label !== label) expect(ladder).toContain(b.label);
      });
    });
  });
});

describe("bingo", () => {
  it("cards follow B1-15 … O61-75 with a free centre", () => {
    const { card } = generateBingo(null, "card-check");
    expect(card[12]).toBeNull();
    card.forEach((n, i) => {
      if (n === null) return;
      expect(n).toBeGreaterThanOrEqual((i % 5) * 15 + 1);
      expect(n).toBeLessThanOrEqual((i % 5) * 15 + 15);
    });
  });
  it("a win completes a line on the final ball and not before", () => {
    for (const seed of SEEDS) {
      const b = generateBingo(PRIZES[0], seed);
      expect(b.draws.length).toBeLessThanOrEqual(BINGO_BALLS);
      expect(new Set(b.draws).size).toBe(b.draws.length);
      expect(firstLineAt(b.card, b.draws)).toBe(b.draws.length - 1);
      expect(BINGO_LINES).toContainEqual(b.winLine);
    }
  });
  it("a loss draws all twenty balls without completing a line", () => {
    for (const seed of SEEDS) {
      const b = generateBingo(null, seed);
      expect(b.draws).toHaveLength(BINGO_BALLS);
      expect(new Set(b.draws).size).toBe(BINGO_BALLS);
      expect(firstLineAt(b.card, b.draws)).toBe(-1);
      expect(b.winLine).toBeNull();
    }
  });
  it("losing cards are not steered towards a line that is one number short", () => {
    // Engineered near-misses would put a one-short line on every losing card.
    const oneShort = SEEDS.filter((seed) => {
      const b = generateBingo(null, seed);
      const marked = new Set(b.draws);
      return BINGO_LINES.some((line) => line.filter((c) => b.card[c] !== null && !marked.has(b.card[c]!)).length === 1);
    }).length;
    expect(oneShort / SEEDS.length).toBeLessThan(0.9);
  });
});

describe("balloon pop", () => {
  it("balloon colours are the same on every replay", () => {
    expect(balloonColours(40, "p:c")).toEqual(balloonColours(40, "p:c"));
    expect(balloonColours(40, "p:c")).toHaveLength(40);
  });
  it("a balloon's look comes from the seed and its position only, so it cannot hint at a prize", () => {
    // balloonLooks is never given the tickets or their prizes: the same purchase id draws the same
    // balloons whether every ticket wins or none do.
    expect(balloonLooks.length).toBe(2);
    const looks = balloonLooks(60, "p:c");
    expect(looks).toEqual(balloonLooks(60, "p:c"));
    expect(looks).toHaveLength(60);
    for (const l of looks) {
      expect(["pink", "cyan", "yellow"]).toContain(l.colour);
      expect(["s", "m", "l"]).toContain(l.size);
      expect(l.duration).toBeGreaterThanOrEqual(10);
      expect(l.duration).toBeLessThanOrEqual(12.5);
    }
  });
});
