import { defineMiddleware } from "astro:middleware";
import { serverApi, ApiFailure, latestSetCookies } from "./lib/api";
import type { Me, SiteInfo } from "./lib/types";

const FALLBACK_SITE: SiteInfo = {
  salesOpen: false,
  minDepositPence: 500,
  minCardPence: 100,
  minWithdrawalPence: 2000,
  maxTopUpPence: 50000,
  featuredSlug: null,
  socials: { instagram: null, facebook: null },
  supportEmail: null,
};

let siteCache: { at: number; value: SiteInfo } | null = null;

/**
 * What a page may load: only the site itself (pictures may also be data:/blob: for the games). Nothing
 * third-party loads anywhere, so nothing else is listed: add an address here only alongside its consent check.
 * Inline scripts stay allowed because Astro's island loader is inline; the gain is that no outside script,
 * frame, plugin, <base> or form target can be injected. Not sent by the dev server (Vite needs websockets).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Pages that need a signed-in player. Anyone else is sent to log in and brought back. */
const MEMBERS_ONLY = [/^\/account(\/|$)/, /^\/checkout$/, /^\/order\//];

export const onRequest = defineMiddleware(async (context, next) => {
  const setCookies: string[] = [];
  const api = serverApi(context.request, setCookies);
  context.locals.api = api;

  const now = Date.now();
  if (!siteCache || now - siteCache.at > 30_000) {
    try {
      siteCache = { at: now, value: await api.get<SiteInfo>("/api/site") };
    } catch {
      siteCache = siteCache ?? { at: now - 25_000, value: FALLBACK_SITE };
    }
  }
  context.locals.site = siteCache.value;

  context.locals.me = null;
  if ((context.request.headers.get("cookie") ?? "").includes("_session")) {
    try {
      context.locals.me = await api.maybe<Me>("/api/me");
    } catch (e) {
      if (!(e instanceof ApiFailure)) context.locals.me = null;
    }
  }

  const path = context.url.pathname;
  if (!context.locals.me && MEMBERS_ONLY.some((r) => r.test(path))) {
    const back = encodeURIComponent(path + context.url.search);
    return context.redirect(`/login?next=${back}`, 302);
  }

  const res = await next();
  // Keep the visitor's session alive: pass on cookies Laravel set while rendering.
  // One line per cookie: each API call during the page view refreshes them, and only the newest counts.
  for (const c of latestSetCookies(setCookies)) res.headers.append("Set-Cookie", c);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (import.meta.env.PROD) res.headers.set("Content-Security-Policy", CSP);
  // Browsers only ever use https for the site once they've seen this over https (a year; subdomains not included).
  if (context.url.protocol === "https:" || context.request.headers.get("x-forwarded-proto") === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (context.locals.me || MEMBERS_ONLY.some((r) => r.test(path))) res.headers.set("Cache-Control", "private, no-store");
  return res;
});
