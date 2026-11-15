/**
 * Marketing cookies and the Meta Pixel. Nothing from Meta loads until the visitor presses "Accept" in the
 * cookie banner, and only when a Pixel ID is set in the admin (Settings → Site). "Reject", or withdrawing
 * later from "Cookie settings" in the footer, stops it at once (the page reloads without it).
 * The choice is kept in this browser only (localStorage), with the date it was made.
 */
export type Consent = "accepted" | "rejected";
const KEY = "gg-cookie-consent";

interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: Fbq;
}
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function readConsent(): Consent | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { choice?: string } | null;
    return v?.choice === "accepted" || v?.choice === "rejected" ? v.choice : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: Consent) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ choice, at: new Date().toISOString(), version: 1 }));
  } catch {
    // Private mode with storage off: the banner simply asks again next time.
  }
}

let pixelId: string | null = null;

/** Starts the Pixel if the visitor has accepted and an ID is set. Safe to call more than once. */
export function startPixel(id: string | null | undefined) {
  if (!id || !/^\d{10,20}$/.test(id) || readConsent() !== "accepted" || window.fbq) return;
  pixelId = id;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  fbq("init", id);
  fbq("track", "PageView");
}

/** A Meta standard event (ViewContent, InitiateCheckout, Purchase, CompleteRegistration). Nothing without consent. */
export function track(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (!pixelId) startPixel(document.getElementById("cookie-banner")?.dataset.pixel);
  if (!pixelId || !window.fbq) return;
  window.fbq("track", event, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** Purchase, once per order in this browser (a reload of the order page doesn't count it twice). */
export function trackPurchaseOnce(orderNumber: string, valuePence: number) {
  const k = `gg-px-purchase:${orderNumber}`;
  if (!pixelId) startPixel(document.getElementById("cookie-banner")?.dataset.pixel);
  try {
    if (localStorage.getItem(k)) return;
    if (pixelId && window.fbq) localStorage.setItem(k, "1");
  } catch {
    // ignore
  }
  track("Purchase", { value: valuePence / 100, currency: "GBP" }, orderNumber);
}

// Pages without an island send their event through this (see the competition and checkout pages).
declare global {
  interface Window {
    ggTrack?: typeof track;
  }
}
if (typeof window !== "undefined") window.ggTrack = track;
