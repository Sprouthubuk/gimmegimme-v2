// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { formatMoney, formatPence, parsePounds } from "../../src/lib/money";
import { safeNext } from "../../src/lib/safe";
import { ago, endsIn, remaining, ukDateTime, ukTime } from "../../src/lib/time";
import { addToBasket, clearBasket, readBasket, removeFromBasket, restoreAside, setAside, setQuantity } from "../../src/lib/basket";

describe("money", () => {
  it("formats pence for prices", () => {
    expect(formatPence(25)).toBe("25p");
    expect(formatPence(100)).toBe("£1");
    expect(formatPence(1250)).toBe("£12.50");
    expect(formatPence(150000)).toBe("£1,500");
    expect(formatPence(25, { short: false })).toBe("£0.25");
  });
  it("formats totals with two decimals, negatives with a real minus", () => {
    expect(formatMoney(0)).toBe("£0.00");
    expect(formatMoney(1250)).toBe("£12.50");
    expect(formatMoney(-500)).toBe("−£5.00");
    expect(formatMoney(12345678)).toBe("£123,456.78");
  });
  it("parses typed amounts exactly, never via floating point", () => {
    expect(parsePounds("12.50")).toBe(1250);
    expect(parsePounds("£5")).toBe(500);
    expect(parsePounds("0.1")).toBe(10);
    expect(parsePounds("1,000.01")).toBe(100001);
    expect(parsePounds("19.99")).toBe(1999);
    for (const bad of ["", "abc", "1.234", "-5", "5.", "1e3", "£"]) expect(parsePounds(bad), bad).toBeNull();
  });
});

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/checkout?buy=a:3")).toBe("/checkout?buy=a:3");
    expect(safeNext("/competitions/x")).toBe("/competitions/x");
  });
  it("refuses anything that could leave the site or hit the API", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "/api/auth/logout", "/admin", "/sanctum/csrf-cookie", "/x\r\nSet-Cookie: a=b", null, undefined, ""])
      expect(safeNext(bad as string), String(bad)).toBe("/account");
  });
});

describe("UK time", () => {
  it("shows UK time whatever the server timezone (BST and GMT)", () => {
    expect(ukTime("2026-07-01T19:00:00Z")).toMatch(/^8\s?pm$/i); // BST
    expect(ukTime("2026-12-01T20:00:00Z")).toMatch(/^8\s?pm$/i); // GMT
    expect(ukTime("2026-12-01T20:30:00Z")).toMatch(/^8:30\s?pm$/i);
    expect(ukDateTime("2026-12-24T20:00:00Z")).toMatch(/Thu,? 24 Dec, 8\s?pm/i);
  });
  it("counts down and says Closed at zero", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(remaining("2026-11-13T13:01:05Z", now)).toEqual({ days: 1, hours: 1, mins: 1, secs: 5, done: false });
    expect(endsIn("2026-11-30T22:00:00Z", now)).toBe("18d 10h");
    expect(endsIn("2026-11-12T17:20:00Z", now)).toBe("5h 20m");
    expect(endsIn("2026-11-12T12:04:10Z", now)).toBe("4m 10s");
    expect(endsIn("2026-11-12T11:00:00Z", now)).toBe("Closed");
  });
  it("says how long ago", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(ago("2026-11-12T11:59:30Z", now)).toBe("Just now");
    expect(ago("2026-11-12T11:07:00Z", now)).toBe("53 min ago");
    expect(ago("2026-11-12T11:00:00Z", now)).toBe("1 hour ago");
    expect(ago("2026-11-06T12:00:00Z", now)).toBe("6 days ago");
  });
});

describe("basket", () => {
  beforeEach(() => { localStorage.clear(); });
  it("keeps one line per competition and adds to it", () => {
    addToBasket("a", 3);
    addToBasket("b", 1);
    addToBasket("a", 2);
    expect(readBasket()).toEqual([{ competitionId: "a", quantity: 5 }, { competitionId: "b", quantity: 1 }]);
    setQuantity("a", 0);
    expect(readBasket()).toEqual([{ competitionId: "b", quantity: 1 }]);
    removeFromBasket("b");
    expect(readBasket()).toEqual([]);
  });
  it("ignores tampered storage", () => {
    localStorage.setItem("gg-basket-v1", JSON.stringify([{ competitionId: "a", quantity: -4 }, { competitionId: 5, quantity: 1 }, { competitionId: "b", quantity: 1.5 }, { competitionId: "c", quantity: 2, price: 0 }]));
    expect(readBasket()).toEqual([{ competitionId: "c", quantity: 2 }]);
    localStorage.setItem("gg-basket-v1", "{not json");
    expect(readBasket()).toEqual([]);
  });
  it("puts the basket aside for a card payment and restores it once", () => {
    addToBasket("a", 4);
    setAside("GG-1");
    clearBasket();
    expect(restoreAside("GG-1")).toBe(true);
    expect(readBasket()).toEqual([{ competitionId: "a", quantity: 4 }]);
    expect(restoreAside("GG-1")).toBe(false);
  });
});
