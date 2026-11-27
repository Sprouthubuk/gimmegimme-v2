/**
 * Meta's click id cookie (`_fbc`), set by the server for a visitor who has ALREADY accepted marketing cookies and
 * arrives from an ad (`?fbclid=` in the address), so it exists before any script runs and the Conversions API can
 * link a later sale to the ad. Format, as Meta's Pixel writes it: `fb.1.<time in ms>.<fbclid>`.
 *
 * Nothing at all for anyone who hasn't accepted (no `gg_consent=accepted` cookie) or rejected: this is the same
 * storage the cookie banner asks about. An `_fbc` that already holds this fbclid is left as it is (it may be the
 * Pixel's own, with the time of the first click). Same 90 days and site-wide domain as the Pixel uses, so the two
 * never make two different `_fbc` cookies.
 */
const FBCLID = /^[A-Za-z0-9_-]{10,500}$/;
const MAX_AGE = 60 * 60 * 24 * 90;

function cookies(header: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return m;
}

/** The cookie domain shared with the Pixel: the site's host without "www."; none for localhost or an IP address. */
export function cookieDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  return h;
}

/** The `Set-Cookie` line for `_fbc`, or null when nothing may or need be set. */
export function fbcCookie(url: URL, cookieHeader: string, nowMs: number, siteHost: string): string | null {
  const jar = cookies(cookieHeader);
  if (jar.get("gg_consent") !== "accepted") return null;
  const fbclid = url.searchParams.get("fbclid") ?? "";
  if (!FBCLID.test(fbclid)) return null;
  const existing = /^fb\.\d\.\d+\.(.+)$/.exec(jar.get("_fbc") ?? "");
  if (existing && existing[1] === fbclid) return null;
  const domain = cookieDomain(siteHost);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `_fbc=fb.1.${Math.round(nowMs)}.${fbclid}; Max-Age=${MAX_AGE}; Path=/${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${secure}`;
}
