import { defineMiddleware } from "astro:middleware";
import { serverApi, ApiFailure } from "./lib/api";
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
  for (const c of new Set(setCookies)) res.headers.append("Set-Cookie", c);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (context.locals.me || MEMBERS_ONLY.some((r) => r.test(path))) res.headers.set("Cache-Control", "private, no-store");
  return res;
});
