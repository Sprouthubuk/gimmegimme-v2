import type { APIRoute } from "astro";
import type { CompetitionSummary } from "../lib/types";

/**
 * Every page worth a search result, for search engines (listed in robots.txt once indexing is on):
 * the public pages, the competition categories and every live competition with its picture
 * (Google Images). Sign-in, account, basket and payment pages are never listed.
 */
const FIXED = [
  "/", "/competitions", "/competitions?type=instant", "/competitions?type=draw",
  "/how-it-works", "/faq", "/free-entry", "/winners", "/instant-winners", "/entry-lists", "/contact",
  "/legal/terms", "/legal/free-entry", "/legal/privacy", "/legal/cookies", "/legal/complaints",
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ locals, site, url }) => {
  const base = (site ?? url).origin;
  let comps: CompetitionSummary[] = [];
  try {
    comps = (await locals.api.get<{ data: CompetitionSummary[] }>("/api/competitions?status=live")).data;
  } catch {
    // The API is down: the fixed pages are still worth listing.
  }
  const fixed = [...FIXED, ...(locals.site?.gimmeBox?.available ? ["/gimme-box"] : [])];
  const abs = (u: string) => (/^https?:/.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`);
  const entries = [
    ...fixed.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`),
    ...comps.map((c) => {
      const img = c.image ? `<image:image><image:loc>${esc(abs(c.image))}</image:loc></image:image>` : "";
      return `  <url><loc>${esc(`${base}/competitions/${encodeURIComponent(c.slug)}`)}</loc>${img}</url>`;
    }),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
};
