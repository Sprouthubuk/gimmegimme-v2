import type { APIRoute } from "astro";

/** Log out on the server, then go home. Works without JavaScript (a plain form post). */
export const POST: APIRoute = async ({ request, redirect }) => {
  const base = (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const site = (process.env.PUBLIC_SITE_URL || "http://localhost:4321").replace(/\/$/, "");
  const cookie = request.headers.get("cookie") ?? "";
  const xsrf = decodeURIComponent((cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/) ?? [])[1] ?? "");
  const res = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: { Accept: "application/json", Cookie: cookie, Referer: `${site}/`, Origin: site, "X-XSRF-TOKEN": xsrf },
  }).catch(() => null);
  const out = redirect("/", 303);
  for (const c of res?.headers.getSetCookie?.() ?? []) out.headers.append("Set-Cookie", c);
  return out;
};
