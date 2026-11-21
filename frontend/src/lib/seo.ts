/**
 * Search titles, descriptions and structured data. Google shows about 60 characters of a title and
 * about 155 of a description, so everything here is written to fit, with the keywords UK players
 * search for ("competitions", "prize competitions", "instant win competitions", "raffles", "win …").
 *
 * Rules: never a ticket count (total, sold, left, odds), never a claim we can't back up, and
 * "18+ UK" plus the free postal route on money pages.
 */
import { formatPence } from "./money";
import { ukDate } from "./time";
import type { CompetitionDetail } from "./types";

export const BRAND = "Gimme Gimme Prizes";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** Cut at a word and add "…" when too long. */
export function clamp(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** "Title | Gimme Gimme Prizes", dropping the brand (then shortening) rather than going over. */
export function pageTitle(title: string): string {
  const withBrand = `${title} | ${BRAND}`;
  if (withBrand.length <= TITLE_MAX) return withBrand;
  const short = `${title} | Gimme Gimme`;
  return short.length <= TITLE_MAX ? short : clamp(title, TITLE_MAX);
}

const price = (pence: number) => formatPence(pence);

/** "Win …" title for a competition. */
export function competitionTitle(c: Pick<CompetitionDetail, "title">): string {
  const t = c.title.replace(/\s+/g, " ").trim();
  return /^win\b/i.test(t) ? t : `Win ${t}`;
}

/** A competition's search description: the prize, the price, how it's won, the date. No ticket counts. */
export function competitionDescription(c: Pick<CompetitionDetail, "title" | "type" | "pricePence" | "closesAt" | "drawAt" | "gameLabel" | "endPrize">): string {
  const win = competitionTitle(c);
  const how = c.type === "instant"
    ? `Instant win${c.gameLabel ? ` ${c.gameLabel}` : ""} game: see if you've won the moment you buy${c.endPrize ? `, plus an end prize draw` : ""}.`
    : `Live draw ${ukDate(c.drawAt ?? c.closesAt)}.`;
  return clamp(`${win} from ${price(c.pricePence)} a ticket. ${how} 18+ UK, free postal entry.`, DESCRIPTION_MAX);
}

type Json = Record<string, unknown>;

export function organisationLd(site: string, social: (string | null | undefined)[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: BRAND,
    url: `${site}/`,
    logo: `${site}/logo.png`,
    ...(social.filter(Boolean).length ? { sameAs: social.filter(Boolean) } : {}),
  };
}

export function websiteLd(site: string): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site}/#website`,
    name: BRAND,
    alternateName: "Gimme Gimme",
    url: `${site}/`,
    inLanguage: "en-GB",
    publisher: { "@id": `${site}/#organization` },
    potentialAction: { "@type": "SearchAction", target: `${site}/competitions?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
}

export function breadcrumbLd(site: string, trail: [string, string][]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${site}${path}` })),
  };
}

export function faqLd(items: { q: string; a: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export const ldJson = (data: Json | Json[]) => JSON.stringify(data).replace(/</g, "\\u003c");
