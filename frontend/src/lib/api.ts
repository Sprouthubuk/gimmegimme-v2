// Talking to the Laravel API.
//
// Server side (Astro pages): `serverApi(Astro)` calls the backend directly at
// API_INTERNAL_URL, forwarding the visitor's cookies so Sanctum knows who they
// are, and passing back any Set-Cookie the backend sends.
// Browser side (React islands): `api()` calls the same-origin /api path with
// the XSRF token Laravel sets, so cookie sessions work without CORS.
import type { ApiError } from "./types";

export class ApiFailure extends Error {
  status: number;
  body: ApiError | null;
  constructor(status: number, body: ApiError | null) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

function internalBase(): string {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const raw = env.API_INTERNAL_URL || import.meta.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

function siteOrigin(): string {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return (env.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL || "http://localhost:4321").replace(/\/$/, "");
}

/**
 * Server-side API client bound to one page request. Cookies Laravel sends back
 * (session refresh, XSRF token) are collected in `setCookies` and copied onto
 * the page response by the middleware.
 */
export function serverApi(request: Request, setCookies: string[] = []) {
  // The visitor's cookies, updated as Laravel sets new ones during this page view, so later calls
  // use the same session as earlier ones (a first-time visitor gets one session, not one per call).
  const jar = parseCookieHeader(request.headers.get("cookie") ?? "");
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const cookie = cookieHeader();
    const res = await fetch(`${internalBase()}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
        // Sanctum treats a request as first-party when it comes from the site.
        Referer: `${siteOrigin()}/`,
        Origin: siteOrigin(),
        "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "",
        ...(init.headers ?? {}),
      },
    });
    // Keep the session alive: pass Laravel's cookies back to the browser.
    if (typeof res.headers.getSetCookie === "function") {
      for (const sc of res.headers.getSetCookie()) {
        setCookies.push(sc);
        const pair = sc.split(";", 1)[0];
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiFailure(res.status, body);
    return body as T;
  }
  // The XSRF token that goes with the session in the jar (the newest one Laravel handed out).
  const xsrf = () => {
    try {
      return decodeURIComponent(jar.get("XSRF-TOKEN") ?? "");
    } catch {
      return "";
    }
  };
  return {
    get: <T>(path: string) => call<T>(path),
    /** A write on the visitor's behalf: carries their XSRF token, like the browser would. */
    post: <T>(path: string, json: unknown = {}) => call<T>(path, { method: "POST", body: JSON.stringify(json), headers: { "X-XSRF-TOKEN": xsrf() } }),
    /** Like get, but answers null on 401/404 instead of throwing. */
    maybe: async <T>(path: string): Promise<T | null> => {
      try {
        return await call<T>(path);
      } catch (e) {
        if (e instanceof ApiFailure && (e.status === 401 || e.status === 404)) return null;
        throw e;
      }
    },
  };
}

/** "a=1; b=2" → Map { a → "1", b → "2" } (values kept exactly as sent). */
export function parseCookieHeader(header: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return jar;
}

/** Several Set-Cookie lines for the same cookie → only the last one (it carries the newest value). */
export function latestSetCookies(lines: string[]): string[] {
  const byName = new Map<string, string>();
  for (const line of lines) {
    const name = line.split(";", 1)[0].split("=", 1)[0].trim();
    if (!name) continue;
    byName.delete(name);
    byName.set(name, line);
  }
  return [...byName.values()];
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

let csrfReady: Promise<void> | null = null;
async function ensureCsrf(force = false): Promise<void> {
  if (force) csrfReady = null;
  else if (readCookie("XSRF-TOKEN")) return;
  csrfReady ??= fetch("/sanctum/csrf-cookie", { credentials: "include" }).then(() => undefined);
  await csrfReady;
}

/**
 * Browser-side API call. Throws ApiFailure with Laravel's message on error. A write refused with 419
 * (the security token expired, e.g. a tab left open overnight) fetches a fresh token and tries once more.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retried = false): Promise<T> {
  const method = (init.method ?? (init.json !== undefined ? "POST" : "GET")).toUpperCase();
  if (method !== "GET") await ensureCsrf();
  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
  const xsrf = readCookie("XSRF-TOKEN");
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    ...init,
    method,
    credentials: "include",
    headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: "Something went wrong. Please try again." };
  }
  if (res.status === 419 && method !== "GET" && !retried) {
    await ensureCsrf(true);
    return api<T>(path, init, true);
  }
  if (!res.ok) throw new ApiFailure(res.status, body as ApiError);
  return body as T;
}

/** First validation message for a field, or the general message. */
export function errorText(e: unknown, field?: string): string {
  if (e instanceof ApiFailure) {
    if (field && e.body?.errors?.[field]?.[0]) return e.body.errors[field][0];
    if (e.status === 419) return "Your session expired. Please refresh the page and try again.";
    if (e.status === 429) return "Too many attempts. Please wait a minute and try again.";
    return e.body?.message || "Something went wrong. Please try again.";
  }
  return "We couldn't reach the server. Check your connection and try again.";
}
