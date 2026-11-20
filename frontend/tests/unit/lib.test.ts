// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { formatMoney, formatPence, parsePounds } from "../../src/lib/money";
import { safeNext } from "../../src/lib/safe";
import { ago, endsIn, remaining, ukDateTime, ukTime, ukWhen } from "../../src/lib/time";
import { addBoxLines, addToBasket, boxIdsIn, clearBasket, readBasket, removeFromBasket, restoreAside, setAside, setQuantity } from "../../src/lib/basket";
import { lineMakeup } from "../../src/lib/bundles";

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
  it("a 'buy now' card payment that fails puts its tickets in the basket, keeping what was already there", () => {
    // Bug: "Enter Now" skips the basket, so after a declined card "Try Again" opened an empty basket.
    addToBasket("other", 2);
    setAside("GG-9", [{ competitionId: "x", quantity: 0, bundleId: 3 }]);
    expect(readBasket()).toEqual([{ competitionId: "other", quantity: 2 }]);
    expect(restoreAside("GG-9")).toBe(true);
    expect(readBasket()).toEqual([{ competitionId: "other", quantity: 2 }, { competitionId: "x", quantity: 0, bundleId: 3 }]);
  });

  it("a Gimme Box takes the place of the same kind of line for each draw and keeps its box id", () => {
    const box = "a".repeat(32);
    addToBasket("x", 3);
    addToBasket("y", 2);
    addBoxLines([{ competitionId: "x", quantity: 0, bundleId: 2, boxId: box }, { competitionId: "x", quantity: 4, boxId: box }, { competitionId: "z", quantity: 6, boxId: box }]);
    expect(readBasket()).toEqual([
      { competitionId: "y", quantity: 2 },
      { competitionId: "x", quantity: 0, bundleId: 2, boxId: box },
      { competitionId: "x", quantity: 4, boxId: box },
      { competitionId: "z", quantity: 6, boxId: box },
    ]);
    expect(boxIdsIn(readBasket())).toEqual([box]);
    // More single tickets keep the box (the server still adds its bonus); a made-up box id is dropped.
    setQuantity("z", 8);
    expect(readBasket().find((l) => l.competitionId === "z")).toEqual({ competitionId: "z", quantity: 8, boxId: box });
    localStorage.setItem("gg-basket-v1", JSON.stringify([{ competitionId: "q", quantity: 1, boxId: "<script>" }]));
    expect(readBasket()).toEqual([{ competitionId: "q", quantity: 1 }]);
  });

  it("explains Gimme Box bonus tickets on a line", () => {
    expect(lineMakeup({ quantity: 27, paidQuantity: 10, freeQuantity: 15, bonusQuantity: 2 })).toBe("10 paid + 15 free + 2 Gimme Box bonus = 27 tickets");
    expect(lineMakeup({ quantity: 11, paidQuantity: 10, bonusQuantity: 1 })).toBe("10 paid + 1 Gimme Box bonus = 11 tickets");
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

describe("ukWhen", () => {
  const now = Date.parse("2026-11-18T23:30:00Z"); // 11:30pm in the UK
  it("says Today and Tomorrow by the UK calendar, and the date after that", () => {
    expect(ukWhen("2026-11-18T23:45:00Z", now)).toBe("Today 11:45pm");
    expect(ukWhen("2026-11-19T21:00:00Z", now)).toBe("Tomorrow 9pm");
    expect(ukWhen("2026-12-26T21:00:00Z", now)).toBe("Sat 26 Dec, 9pm");
  });
  it("uses UK summer time", () => {
    expect(ukWhen("2027-06-20T20:00:00Z", Date.parse("2027-06-19T12:00:00Z"))).toBe("Tomorrow 9pm");
  });
});
