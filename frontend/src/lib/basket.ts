// The basket lives in the browser until checkout; the server prices it every time.
import type { BasketLine } from "./types";

const KEY = "gg-basket-v1";
const EVENT = "gg-basket";

const valid = (l: any) => l && typeof l.competitionId === "string"
  && ((Number.isInteger(l.bundleId) && l.bundleId > 0) || (Number.isInteger(l.quantity) && l.quantity > 0));

/**
 * Up to two lines per competition: single tickets, and one bundle. The browser only remembers what
 * was chosen; the server prices bundles and singles every time.
 */
export function readBasket(): BasketLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(valid).map((l) => (l.bundleId ? { competitionId: l.competitionId, quantity: 0, bundleId: l.bundleId } : { competitionId: l.competitionId, quantity: l.quantity }));
  } catch {
    return [];
  }
}

function write(lines: BasketLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage full or blocked: the basket simply isn't remembered */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lines }));
}

const isBundle = (l: BasketLine) => !!l.bundleId;

/** Add single tickets, or set the quantity when `replace` is true. */
export function addToBasket(competitionId: string, quantity: number, replace = false): BasketLine[] {
  const lines = readBasket();
  const i = lines.findIndex((l) => l.competitionId === competitionId && !isBundle(l));
  if (i >= 0) lines[i] = { competitionId, quantity: replace ? quantity : lines[i].quantity + quantity };
  else lines.push({ competitionId, quantity });
  const next = lines.filter((l) => isBundle(l) || l.quantity > 0);
  write(next);
  return next;
}

/** Put a bundle in the basket. A competition holds one bundle: choosing another replaces it. */
export function addBundle(competitionId: string, bundleId: number): BasketLine[] {
  const next = readBasket().filter((l) => !(l.competitionId === competitionId && isBundle(l)));
  next.push({ competitionId, quantity: 0, bundleId });
  write(next);
  return next;
}

/** Swap a line (single tickets or a bundle) for a bigger bundle. */
export function upgradeLine(competitionId: string, fromBundleId: number | null, toBundleId: number): BasketLine[] {
  const next = readBasket().filter((l) => !(l.competitionId === competitionId && (isBundle(l) || fromBundleId === null)));
  next.push({ competitionId, quantity: 0, bundleId: toBundleId });
  write(next);
  return next;
}

export function setQuantity(competitionId: string, quantity: number): BasketLine[] {
  return addToBasket(competitionId, Math.max(0, quantity), true);
}

/** Remove one line: the bundle when bundleId is given, otherwise the single tickets. */
export function removeFromBasket(competitionId: string, bundleId: number | null = null): BasketLine[] {
  const next = readBasket().filter((l) => !(l.competitionId === competitionId && (bundleId ? l.bundleId === bundleId : !isBundle(l))));
  write(next);
  return next;
}

export function clearBasket() {
  write([]);
}

/** Put the basket aside before going to pay by card; restored if the payment fails or is cancelled. */
export function setAside(orderNumber: string) {
  try {
    localStorage.setItem(`${KEY}:aside:${orderNumber}`, JSON.stringify(readBasket()));
  } catch {
    /* ignore */
  }
}

export function restoreAside(orderNumber: string): boolean {
  try {
    const raw = localStorage.getItem(`${KEY}:aside:${orderNumber}`);
    if (!raw) return false;
    localStorage.removeItem(`${KEY}:aside:${orderNumber}`);
    write(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

export function onBasketChange(cb: (lines: BasketLine[]) => void): () => void {
  const h = () => cb(readBasket());
  window.addEventListener(EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener("storage", h);
  };
}

export const basketCount = (lines: BasketLine[]) => lines.length;
