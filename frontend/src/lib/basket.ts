// The basket lives in the browser until checkout; the server prices it every time.
import type { BasketLine } from "./types";

const KEY = "gg-basket-v1";
const EVENT = "gg-basket";
const BOX_ID = /^[a-z0-9]{32}$/;

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
    return raw.filter(valid).map((l) => {
      const line: BasketLine = l.bundleId ? { competitionId: l.competitionId, quantity: 0, bundleId: l.bundleId } : { competitionId: l.competitionId, quantity: l.quantity };
      if (typeof l.boxId === "string" && BOX_ID.test(l.boxId)) line.boxId = l.boxId;
      return line;
    });
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
  // A Gimme Box line keeps its box: the server still adds the bonus while the line holds at least what the box packed.
  if (i >= 0) lines[i] = { ...lines[i], competitionId, quantity: replace ? quantity : lines[i].quantity + quantity };
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

/**
 * Put a Gimme Box in the basket. Each box line takes the place of the same kind of line (bundle or
 * single tickets) for that draw, so the basket never prices one draw twice.
 */
export function addBoxLines(box: { competitionId: string; quantity: number; bundleId?: number; boxId: string }[]): BasketLine[] {
  const kind = (l: { bundleId?: number | null }) => (l.bundleId ? "b" : "s");
  const taken = new Set(box.map((l) => `${l.competitionId}:${kind(l)}`));
  const next: BasketLine[] = readBasket().filter((l) => !taken.has(`${l.competitionId}:${kind(l)}`));
  for (const l of box) next.push(l.bundleId ? { competitionId: l.competitionId, quantity: 0, bundleId: l.bundleId, boxId: l.boxId } : { competitionId: l.competitionId, quantity: l.quantity, boxId: l.boxId });
  write(next);
  return next;
}

/** Box ids still in the basket (shaking a new box releases the one it replaces). */
export const boxIdsIn = (lines: BasketLine[]) => [...new Set(lines.map((l) => l.boxId).filter((x): x is string => !!x))];

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

/**
 * Put the basket aside before going to pay by card; restored if the payment fails or is cancelled.
 * A "buy now" passes its own lines instead: they're added to the basket on restore (the basket
 * itself was never emptied), so "Try Again" has the tickets ready.
 */
export function setAside(orderNumber: string, buyNow?: BasketLine[]) {
  try {
    localStorage.setItem(`${KEY}:aside:${orderNumber}`, JSON.stringify(buyNow ? { add: buyNow } : readBasket()));
  } catch {
    /* ignore */
  }
}

export function restoreAside(orderNumber: string): boolean {
  try {
    const raw = localStorage.getItem(`${KEY}:aside:${orderNumber}`);
    if (!raw) return false;
    localStorage.removeItem(`${KEY}:aside:${orderNumber}`);
    const saved = JSON.parse(raw);
    if (Array.isArray(saved)) {
      write(saved);
    } else if (saved && Array.isArray(saved.add)) {
      const add = (saved.add as BasketLine[]).filter((l) => l && typeof l.competitionId === "string");
      const kind = (l: BasketLine) => `${l.competitionId}:${l.bundleId ? `b${l.bundleId}` : "s"}`;
      const taken = new Set(add.map(kind));
      write([...readBasket().filter((l) => !taken.has(kind(l))), ...add]);
    }
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
