import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, type Site } from "./harness";

/**
 * Search: every public page has its own title (≤ 60 characters) and description (70–160), one h1, a
 * canonical link and valid structured data; the sitemap lists only pages worth a search result.
 */
let site: Site;
beforeAll(async () => { site = await startSite(); }, 60000);
afterAll(async () => { await site?.stop(); });

const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') ?? "";
const meta = (html: string) => ({
  title: attr(html, /<title>([^<]*)<\/title>/),
  description: attr(html, /<meta name="description" content="([^"]*)"/),
  canonical: attr(html, /<link rel="canonical" href="([^"]*)"/),
  robots: attr(html, /<meta name="robots" content="([^"]*)"/),
  h1: (html.match(/<h1[\s>]/g) ?? []).length,
  ld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flat(),
});

describe("search titles, descriptions and the sitemap", () => {
  it("every page in the sitemap has its own title and description, one h1 and a canonical link", async () => {
    const b = new Browser(site.origin);
    const xml = await (await b.get("/sitemap.xml")).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => !/\.(png|jpe?g|webp)(\?|$)/.test(u));
    expect(urls.length).toBeGreaterThan(16);
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const u of urls) {
      const path = new URL(u).pathname + new URL(u).search;
      const { res, html } = await b.page(path);
      expect(res.status, path).toBe(200);
      const m = meta(html);
      expect(m.title.length, `${path} title "${m.title}"`).toBeLessThanOrEqual(60);
      expect(m.description.length, `${path} description "${m.description}"`).toBeGreaterThanOrEqual(70);
      expect(m.description.length, `${path} description "${m.description}"`).toBeLessThanOrEqual(160);
      expect(m.h1, `${path} h1 count`).toBe(1);
      expect(new URL(m.canonical).pathname + new URL(m.canonical).search, `${path} canonical`).toBe(path);
      expect(titles.get(m.title), `${path} has the same title as ${titles.get(m.title)}`).toBeUndefined();
      expect(descriptions.get(m.description), `${path} has the same description as ${descriptions.get(m.description)}`).toBeUndefined();
      titles.set(m.title, path);
      descriptions.set(m.description, path);
      expect(m.ld.some((x) => x["@type"] === "Organization"), `${path} organisation`).toBe(true);
      // Never a ticket count in what search engines see (owner's rule).
      expect(`${m.title} ${m.description}`, path).not.toMatch(/\b(tickets? (left|sold|remaining)|max(imum)? (entries|tickets)|odds)\b/i);
    }
  }, 120000);

  it("a competition page says Win …, its price, and has breadcrumbs", async () => {
    const b = new Browser(site.origin);
    const xml = await (await b.get("/sitemap.xml")).text();
    const comp = xml.match(/<loc>[^<]*(\/competitions\/[^<]+)<\/loc><image:image>/)?.[1];
    expect(comp).toBeTruthy();
    const m = meta((await b.page(comp!)).html);
    expect(m.title).toMatch(/^Win /);
    expect(m.description).toMatch(/a ticket\..*18\+ UK, free postal entry\.$/);
    expect(m.ld.find((x) => x["@type"] === "BreadcrumbList")?.itemListElement).toHaveLength(3);
  });

  it("searches and re-sorts are not separate search results; categories are", async () => {
    const b = new Browser(site.origin);
    const search = meta((await b.page("/competitions?q=cash")).html);
    expect(search.robots).toContain("noindex");
    const sorted = meta((await b.page("/competitions?type=instant&sort=price")).html);
    expect(new URL(sorted.canonical).search).toBe("?type=instant");
    expect(sorted.title).toContain("Instant Win Competitions");
  });

  it("private pages are kept out of the sitemap, and the FAQ carries its questions", async () => {
    const b = new Browser(site.origin);
    const xml = await (await b.get("/sitemap.xml")).text();
    for (const p of ["/account", "/checkout", "/basket", "/login", "/join", "/order/", "/payment/"]) expect(xml).not.toContain(`${site.origin}${p}`);
    const faq = meta((await b.page("/faq")).html);
    expect(faq.ld.find((x) => x["@type"] === "FAQPage")?.mainEntity.length).toBeGreaterThan(5);
  });

  it("stays closed to search engines until launch", async () => {
    const robots = await (await new Browser(site.origin).get("/robots.txt")).text();
    expect(robots).toBe("User-agent: *\nDisallow: /\n");
    expect(meta((await new Browser(site.origin).page("/")).html).robots).toBe("noindex, nofollow");
  });
});
