import { describe, expect, it } from "vitest";
import { BINS, ROWS, binOf, coinPath, isWinBin } from "../../packages/games/coin-drop/path";
import { LINES, MARKS, bingoBoard, hasLine } from "../../packages/games/bingo-card/board";
import { landingSegments, wheelSegments } from "../../packages/games/spin-wheel/scene";
import { SYMBOLS, paylineFor } from "../../packages/games/slots/scene";
import type { GameTicket } from "../../packages/games/shared/types";

/** A seeded generator so every run checks the same thousands of boards. */
function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { float: next, int: (n: number) => Math.floor(next() * n) };
}
const WIN: GameTicket = { ticketNumber: 7, result: "win", prize: { label: "£10 Site Credit", value: 10, tier: "medium" } };
const LOSE: GameTicket = { ticketNumber: 8, result: "lose" };
const RUNS = 3000;

describe("Coin Drop lands in a bin of the ticket's kind", () => {
  it("every path has ROWS moves and lands in a matching bin", () => {
    const r = seeded(1);
    const seen = new Set<number>();
    for (let i = 0; i < RUNS; i++) {
      const win = i % 2 === 0;
      const p = coinPath(win, r.int);
      expect(p).toHaveLength(ROWS);
      const bin = binOf(p);
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(BINS);
      expect(isWinBin(bin)).toBe(win);
      seen.add(bin);
    }
    expect(seen.size).toBe(BINS); // every bin is reachable
  });
});

describe("Bingo Card matches the ticket", () => {
  it("a winning card has a line; a no-win card never does", () => {
    const r = seeded(2);
    for (let i = 0; i < RUNS; i++) {
      const win = i % 3 === 0;
      const b = bingoBoard(win, r.int);
      const marked = new Set(b.marked);
      expect(hasLine(marked)).toBe(win);
      expect(b.line === null).toBe(!win);
      expect(b.marked).toHaveLength(MARKS);
      expect(new Set(b.numbers).size).toBe(9);
      // Every called number that is on the card is a marked cell, and every marked cell is called.
      const onCard = b.calls.filter((n) => b.numbers.includes(n)).map((n) => b.numbers.indexOf(n)).sort();
      expect(onCard).toEqual([...b.marked].sort());
      expect(new Set(b.calls).size).toBe(b.calls.length);
    }
  });

  it("no-win cards are drawn from every no-line set, not arranged", () => {
    const r = seeded(3);
    const shapes = new Set<string>();
    for (let i = 0; i < RUNS; i++) shapes.add(bingoBoard(false, r.int).marked.join(","));
    expect(shapes.size).toBeGreaterThan(40);
    expect(LINES).toHaveLength(8);
  });
});

describe("Spin the Wheel", () => {
  it("a win always has a segment with the ticket's prize, and lands only there", () => {
    for (const labels of [[], ["£1 Site Credit"], ["£1", "£5", "£20", "£100", "£500"]]) {
      const segs = wheelSegments(WIN, labels);
      const land = landingSegments(WIN, segs);
      expect(land.length).toBeGreaterThan(0);
      for (const i of land) { expect(segs[i].win).toBe(true); expect(segs[i].label).toBe(WIN.prize!.label); }
    }
  });
  it("a no-win lands only on a no-win segment", () => {
    const segs = wheelSegments(LOSE, ["£1", "£5"]);
    const land = landingSegments(LOSE, segs);
    expect(land.length).toBeGreaterThan(0);
    for (const i of land) expect(segs[i].win).toBe(false);
  });
});

describe("Slots", () => {
  it("a win is three crowns; a no-win is never three of a kind", () => {
    const r = seeded(4);
    expect(paylineFor(WIN, r.float)).toEqual(["crown", "crown", "crown"]);
    for (let i = 0; i < RUNS; i++) {
      const line = paylineFor(LOSE, r.float);
      expect(line).toHaveLength(3);
      for (const s of line) expect(SYMBOLS).toContain(s);
      expect(new Set(line).size).toBeGreaterThan(1);
    }
  });
});
