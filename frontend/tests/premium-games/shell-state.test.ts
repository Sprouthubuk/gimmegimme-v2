import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../../packages/games/shell/state";
import { fromRevealOutcome, tierFor } from "../../packages/games/shared/adapter";
import type { GameTicket } from "../../packages/games/shared/types";

const T: GameTicket[] = [
  { ticketNumber: 1, result: "lose" },
  { ticketNumber: 2, result: "win", prize: { label: "£1 Site Credit", value: 1, tier: "small" } },
  { ticketNumber: 3, result: "lose" },
  { ticketNumber: 4, result: "win", prize: { label: "£0.10 Site Credit", value: 0.1, tier: "small" } },
  { ticketNumber: 5, result: "win", prize: { label: "£0.20 Site Credit", value: 0.2, tier: "small" } },
];

const play = (s: GameSession) => { s.resolveCurrent(); s.advance(); };

describe("ticket progression", () => {
  it("starts on the first ticket and walks through them in the server's order", () => {
    const s = new GameSession(T);
    expect(s.snapshot().statuses).toEqual(["active", "pending", "pending", "pending", "pending"]);
    expect(s.current?.ticketNumber).toBe(1);
    play(s);
    expect(s.current?.ticketNumber).toBe(2);
    expect(s.snapshot().statuses.slice(0, 2)).toEqual(["lost", "active"]);
  });

  it("can't move on before the current ticket is revealed", () => {
    const s = new GameSession(T);
    s.advance();
    expect(s.snapshot().index).toBe(0);
  });

  it("finishes after the last ticket and has no current ticket", () => {
    const s = new GameSession(T);
    for (let i = 0; i < T.length; i++) play(s);
    expect(s.snapshot().finished).toBe(true);
    expect(s.current).toBeNull();
    expect(s.resolveCurrent()).toBeNull();
  });

  it("refuses an empty session", () => {
    expect(() => new GameSession([])).toThrow();
  });
});

describe("totals", () => {
  it("adds exactly the prizes won, in pence (no floating-point drift)", () => {
    const s = new GameSession(T);
    for (let i = 0; i < T.length; i++) play(s);
    expect(s.snapshot().totalWon).toBe(1.3);
    expect(s.snapshot().wins).toBe(3);
  });

  it("revealing the same ticket twice counts it once", () => {
    const s = new GameSession(T);
    play(s);
    s.resolveCurrent();
    s.resolveCurrent();
    expect(s.snapshot().totalWon).toBe(1);
  });

  it("tells listeners about every change", () => {
    const s = new GameSession(T);
    const seen: number[] = [];
    s.subscribe((x) => seen.push(x.totalWon));
    play(s);
    play(s);
    expect(seen.at(-1)).toBe(1);
  });
});

describe("reveal all and skip", () => {
  it("reveal all is a flag the scene plays through; each ticket still resolves in order", () => {
    const s = new GameSession(T);
    s.startRevealAll();
    expect(s.snapshot().revealingAll).toBe(true);
    const order: number[] = [];
    while (!s.snapshot().finished) { order.push(s.resolveCurrent()!.ticketNumber); s.advance(); }
    expect(order).toEqual([1, 2, 3, 4, 5]);
    expect(s.snapshot().revealingAll).toBe(false);
    expect(s.snapshot().totalWon).toBe(1.3);
  });

  it("skip resolves everything left, once, and finishes", () => {
    const s = new GameSession(T);
    play(s);
    const shown = s.skip();
    expect(shown.map((t) => t.ticketNumber)).toEqual([2, 3, 4, 5]);
    expect(s.snapshot()).toMatchObject({ finished: true, wins: 3, totalWon: 1.3 });
    expect(s.skip()).toEqual([]);
  });
});

describe("telling the server (idempotent reveal call)", () => {
  it("calls it once however many tickets are revealed", async () => {
    const mark = vi.fn(() => Promise.resolve({ ok: true }));
    const s = new GameSession(T, mark);
    for (let i = 0; i < T.length; i++) play(s);
    s.skip();
    await Promise.resolve();
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("tries again on a later reveal if the first call failed", async () => {
    const mark = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
    const s = new GameSession(T, mark);
    play(s);
    await new Promise((r) => setTimeout(r, 0));
    play(s);
    play(s);
    await new Promise((r) => setTimeout(r, 0));
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it("doesn't call anything before the first reveal", () => {
    const mark = vi.fn(() => Promise.resolve());
    new GameSession(T, mark);
    expect(mark).not.toHaveBeenCalled();
  });
});

describe("results can't be changed", () => {
  it("freezes the tickets it was given", () => {
    const input = structuredClone(T);
    const s = new GameSession(input);
    expect(() => { (s.tickets[0] as { result: string }).result = "win"; }).toThrow();
    expect(() => { (s.tickets[1].prize as { value: number }).value = 1000; }).toThrow();
    input[0].result = "win"; // changing the caller's copy afterwards changes nothing
    expect(s.tickets[0].result).toBe("lose");
  });
});

describe("adapter: the server's play response", () => {
  const play = {
    outcome: {
      tickets: [
        { ticketNumber: 7, competitionId: "a", prize: null, proofUrl: "/verify/VTY-A" },
        { ticketNumber: 8, competitionId: "a", prize: { name: "£25 Cash", valuePence: 2500 }, proofUrl: "/verify/VTY-A" },
        { ticketNumber: 9, competitionId: "b", prize: { name: "£250 Cash", valuePence: 25000 }, proofUrl: null },
      ],
    },
  };

  it("keeps the order and outcomes exactly", () => {
    expect(fromRevealOutcome(play)).toEqual([
      { ticketNumber: 7, result: "lose", prize: undefined, proofUrl: "/verify/VTY-A" },
      { ticketNumber: 8, result: "win", prize: { label: "£25 Cash", value: 25, tier: "medium" }, proofUrl: "/verify/VTY-A" },
      { ticketNumber: 9, result: "win", prize: { label: "£250 Cash", value: 250, tier: "big" }, proofUrl: undefined },
    ]);
  });

  it("can take one competition's tickets from a mixed order", () => {
    expect(fromRevealOutcome(play, "b").map((t) => t.ticketNumber)).toEqual([9]);
  });

  it("tiers are presentation only and follow the value", () => {
    expect([tierFor(10), tierFor(1999), tierFor(2000), tierFor(9999), tierFor(10000)]).toEqual(["small", "small", "medium", "medium", "big"]);
  });
});
