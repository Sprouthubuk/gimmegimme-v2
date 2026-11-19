import type { APIRoute } from "astro";

/**
 * A share link: /r/ABCD2345. Remembers the code for 30 days in a first-party cookie (used only to fill
 * in the join form) and goes to the join page. Nothing is checked or recorded here: the code is
 * checked when the account is made.
 */
export const GET: APIRoute = ({ params, redirect, cookies, locals }) => {
  const code = String(params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!locals.site.referrals || code.length < 6) return redirect("/join", 302);
  cookies.set("gg_ref", code, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: false, secure: import.meta.env.PROD });
  return redirect(locals.me ? "/" : `/join?ref=${code}`, 302);
};
