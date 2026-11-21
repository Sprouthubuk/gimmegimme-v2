/**
 * Marketing cookies and the Meta Pixel. Nothing from Meta loads until the visitor presses "Accept" in the
 * cookie banner, and only when a Pixel ID is set in the admin (Settings → Site). "Reject", or withdrawing
 * later from "Cookie settings" in the footer, stops it at once (the page reloads without it).
 * The choice is kept in this browser (localStorage, with the date it was made) and copied to a first-party
 * `gg_consent` cookie, so the server knows whether it may also tell Meta about a sale (Conversions API,
 * `backend/app/Tracking/MetaEvents.php`). Server and browser events share an id so Meta counts each once.
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
  writeConsentCookie(choice);
  if (choice === "rejected") forgetMetaCookies();
}

/** The server reads this cookie (never the choice in localStorage). Kept for six months, as the ICO suggests. */
export function writeConsentCookie(choice: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `gg_consent=${choice}; Max-Age=${60 * 60 * 24 * 182}; Path=/; SameSite=Lax${secure}`;
}

/** Withdrawing consent removes Meta's cookies from this site (on this host and the parent domain it may use). */
export function forgetMetaCookies() {
  const host = location.hostname;
  const parts = host.split(".");
  const domains = ["", host, `.${host}`, parts.length > 2 ? `.${parts.slice(-2).join(".")}` : null, parts.length > 3 ? `.${parts.slice(-3).join(".")}` : null]
    .filter((d): d is string => d !== null);
  for (const name of ["_fbp", "_fbc"]) {
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ""}`;
  }
}

/** Visitors who chose before the cookie existed get it on their next page view. */
export function syncConsentCookie() {
  const c = readConsent();
  if (c && !document.cookie.split("; ").some((x) => x === `gg_consent=${c}`)) writeConsentCookie(c);
}

let pixelId: string | null = null;

/**
 * Signed-in players: their email and account id, already SHA-256 hashed on the server (Layout), so Meta can
 * match the visit. The account id hash is the same `external_id` the server sends.
 */
function matching(): Record<string, string> {
  const d = document.getElementById("cookie-banner")?.dataset;
  const out: Record<string, string> = {};
  if (d?.em && /^[a-f0-9]{64}$/.test(d.em)) out.em = d.em;
  if (d?.xid && /^[a-f0-9]{64}$/.test(d.xid)) out.external_id = d.xid;
  return out;
}

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
  const m = matching();
  if (Object.keys(m).length) fbq("init", id, m);
  else fbq("init", id);
  fbq("track", "PageView");
}

/** A Meta standard event (ViewContent, InitiateCheckout, Purchase, CompleteRegistration). Nothing without consent. */
export function track(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (!pixelId) startPixel(document.getElementById("cookie-banner")?.dataset.pixel);
  if (!pixelId || !window.fbq) return;
  window.fbq("track", event, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** A custom event (Deposit, GimmeBoxShake, GimmeBoxAdded, ReferralShare, VoucherRedeemed). Nothing without consent; never personal data. */
export function trackCustom(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (!pixelId) startPixel(document.getElementById("cookie-banner")?.dataset.pixel);
  if (!pixelId || !window.fbq) return;
  window.fbq("trackCustom", event, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** Runs `send` once per key in this browser, so a reload doesn't count an event twice (Meta also drops repeats of an event id). */
function once(key: string, send: () => void) {
  if (!pixelId) startPixel(document.getElementById("cookie-banner")?.dataset.pixel);
  if (!pixelId || !window.fbq) return;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
  send();
}

/** Pence as Meta's value: pounds with two decimals. */
export const metaValue = (pence: number) => Math.round(pence) / 100;

/**
 * Purchase, once per order. The id is the order number, which the server also sends, so Meta counts the
 * sale once. The value is real money only (no bonus credit): the order's `trackValuePence`.
 */
export function trackPurchaseOnce(orderNumber: string, valuePence: number, items?: { slug: string; quantity: number }[]) {
  if (valuePence <= 0) return;
  once(`gg-px-purchase:${orderNumber}`, () =>
    track("Purchase", {
      value: metaValue(valuePence), currency: "GBP", content_type: "product",
      ...(items?.length ? { content_ids: [...new Set(items.map((i) => i.slug))], contents: items.map((i) => ({ id: i.slug, quantity: i.quantity })), num_items: items.reduce((s, i) => s + i.quantity, 0) } : {}),
    }, orderNumber));
}

/** A wallet top up, once per top up (custom event "Deposit", the same id as the server's). */
export function trackDepositOnce(orderNumber: string, valuePence: number) {
  if (valuePence <= 0) return;
  once(`gg-px-deposit:${orderNumber}`, () => trackCustom("Deposit", { value: metaValue(valuePence), currency: "GBP" }, orderNumber));
}

// Pages without an island send their event through this (see the competition and checkout pages).
declare global {
  interface Window {
    ggTrack?: typeof track;
  }
}
if (typeof window !== "undefined") window.ggTrack = track;

/** Tickets put in the basket (standard AddToCart). */
export function trackAddToCart(slug: string, quantity: number, valuePence: number) {
  track("AddToCart", { content_type: "product", content_ids: [slug], contents: [{ id: slug, quantity }], value: metaValue(valuePence), currency: "GBP" });
}

/** The checkout page with a priced basket (standard InitiateCheckout), once per page view. */
let checkoutSent = false;
export function trackInitiateCheckout(totalPence: number, items: { slug: string; quantity: number }[]) {
  if (checkoutSent || totalPence <= 0) return;
  checkoutSent = true;
  track("InitiateCheckout", {
    value: metaValue(totalPence), currency: "GBP", content_type: "product",
    content_ids: [...new Set(items.map((i) => i.slug))], contents: items.map((i) => ({ id: i.slug, quantity: i.quantity })),
    num_items: items.reduce((s, i) => s + i.quantity, 0),
  });
}
