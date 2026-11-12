// The basket lives in the browser until checkout; the server prices it every time.
import type { BasketLine } from "./types";

const KEY = "gg-basket-v1";
const EVENT = "gg-basket";

export function readBasket(): BasketLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l) => l && typeof l.competitionId === "string" && Number.isInteger(l.quantity) && l.quantity > 0)
      .map((l) => ({ competitionId: l.competitionId, quantity: l.quantity }));
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

/** Add tickets, or set the quantity when `replace` is true. One line per competition. */
export function addToBasket(competitionId: string, quantity: number, replace = false): BasketLine[] {
  const lines = readBasket();
  const i = lines.findIndex((l) => l.competitionId === competitionId);
  if (i >= 0) lines[i] = { competitionId, quantity: replace ? quantity : lines[i].quantity + quantity };
  else lines.push({ competitionId, quantity });
  const next = lines.filter((l) => l.quantity > 0);
  write(next);
  return next;
}

export function setQuantity(competitionId: string, quantity: number): BasketLine[] {
  return addToBasket(competitionId, Math.max(0, quantity), true);
}

export function removeFromBasket(competitionId: string): BasketLine[] {
  const next = readBasket().filter((l) => l.competitionId !== competitionId);
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

export const basketCount = (lines: BasketLine[]) => lines.reduce((n, l) => n + 1, 0);
