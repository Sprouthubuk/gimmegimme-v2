import type { APIRoute } from "astro";
import type { CompetitionSummary } from "../lib/types";

/** The public pages and every live competition, for search engines (listed in robots.txt once indexing is on). */
const FIXED = ["/", "/competitions", "/how-it-works", "/faq", "/free-entry", "/winners", "/instant-winners", "/entry-lists", "/contact", "/legal/terms", "/legal/free-entry", "/legal/privacy", "/legal/cookies", "/legal/complaints"];

export const GET: APIRoute = async ({ locals, site, url }) => {
  const base = (site ?? url).origin;
  let comps: CompetitionSummary[] = [];
  try {
    comps = (await locals.api.get<{ data: CompetitionSummary[] }>("/api/competitions")).data;
  } catch {
    // The API is down: the fixed pages are still worth listing.
  }
  const urls = [...FIXED, ...comps.map((c) => `/competitions/${encodeURIComponent(c.slug)}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
};
