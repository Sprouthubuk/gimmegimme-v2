import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, type Site } from "./harness";
import { text } from "./harness";

let site: Site;
beforeAll(async () => { site = await startSite(); }, 60000);
afterAll(async () => { await site?.stop(); });


const PUBLIC_PAGES: [string, RegExp][] = [
  ["/", /Instant Wins/],
  ["/competitions", /All Competitions/],
  ["/competitions?type=draw", /Live Draws 3/],
  ["/competitions?q=bush", /Bush Bucks/],
  ["/competitions/bush-bucks-jungle-trial", /Instant Wins/],
  ["/competitions/lush-snow-fairy-wonderland", /Drawn Live/],
  ["/instant-winners", /Instant Winners/],
  ["/winners", /Our Winners/],
  ["/entry-lists", /Entry Lists/],
  ["/entry-lists/lush-snow-fairy-wonderland", /\d+% sold/],
  ["/entry-lists/bush-bucks-jungle-trial", /Won Bug Bite/],
  ["/competitions/bush-bucks-jungle-trial/winning-numbers", /Winning Numbers[\s\S]*prizes won[\s\S]*#\d+/],
  ["/competitions/bush-bucks-jungle-trial/winning-numbers?show=won", /Emmie A\./],
  ["/how-it-works", /How It Works/],
  ["/faq", /Got A Question/],
  ["/contact", /Talk To Us/],
  ["/free-entry", /Free Postal Entry/],
  ["/legal/terms", /Terms &(amp;)? Conditions/],
  ["/menu", /All Competitions/],
  ["/join", /Join Gimme Gimme/],
  ["/login", /Welcome Back/],
  ["/forgot-password", /Reset Password/],
  ["/basket", /Your Basket/],
  ["/demo/claw_machine", /Try Claw Machine/],
];

const NO_FOOTER = new Set(["/menu", "/join", "/login", "/forgot-password"]);

describe("every public page renders", () => {
  for (const [path, expected] of PUBLIC_PAGES) {
    it(`${path}`, async () => {
      const b = new Browser(site.origin);
      const { res, html } = await b.page(path);
      expect(res.status, html.slice(0, 400)).toBe(200);
      const t = text(html);
      expect(t).toMatch(expected);
      expect(t).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
      expect(html).toContain('<html lang="en-GB">');
      if (!NO_FOOTER.has(path)) expect(html).toContain("GIMMEGIMMEPRIZES LTD"); // company details in the footer
    });
  }
});

describe("site-wide rules", () => {
  it("unknown pages and competitions are a 404 page", async () => {
    const b = new Browser(site.origin);
    expect((await b.page("/nope")).res.status).toBe(404);
    expect((await b.page("/competitions/not-a-real-comp")).res.status).toBe(404);
    expect((await b.page("/demo/not_a_game")).res.status).toBe(404);
  });
  it("sends security headers and loads nothing from other companies", async () => {
    const b = new Browser(site.origin);
    const { res, html } = await b.page("/");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(html).not.toMatch(/fonts\.googleapis|googletagmanager|facebook\.net/);
    expect(html).toMatch(/noindex/); // search indexing stays off until launch
  });
  it("a returning player who taps Buy while signed out can log in from the top of the join page", async () => {
    const next = "/checkout?buy=c-cash:10";
    const { html } = await new Browser(site.origin).page(`/join?next=${encodeURIComponent(next)}`);
    const notice = html.match(/data-testid="join-from-buy"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(notice).toContain("Your tickets are saved");
    expect(notice).toContain(`/login?next=${encodeURIComponent(next).replace(/&/g, "&amp;")}`);
  });
  it("How It Works never promises a ticket count", async () => {
    const t = text((await new Browser(site.origin).page("/how-it-works")).html);
    expect(t).not.toMatch(/how many tickets there are|tickets left|max(imum)? entries/i);
    expect(t).toContain("how much has sold");
  });
  it("members-only pages send visitors to log in and come back", async () => {
    const b = new Browser(site.origin);
    for (const p of ["/account", "/account/wallet", "/account/tickets", "/account/safer-play", "/account/settings", "/checkout", "/order/GG-1234", "/payment/failed?order=GG-1234", "/payment/cancelled?order=GG-1234"]) {
      const res = await b.get(p);
      expect(res.status, p).toBe(302);
      expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent(p)}`);
    }
  });
  it("the home page shows the featured comp, live countdown, every instant win and the live draws", async () => {
    const { html } = await new Browser(site.origin).page("/");
    expect(html).toContain("data-countdown=");
    expect(html).toContain("Bush Bucks – Jungle Trial");
    // Two plain titles, no filters and no See All: every instant win game, then every live draw.
    expect(html).toMatch(/<span class="np">Instant<\/span> Wins/);
    expect(html).toMatch(/<span class="nc">Live<\/span> Draws/);
    expect(html).not.toContain('aria-label="Filter games"');
    expect(html).not.toMatch(/See All \d/);
    // The featured section's strip is the live winners feed (names, prize, game, when), not the prize list.
    expect(html).toMatch(/Live <b>Winners<\/b>/);
    expect(html).toMatch(/Emmie A\.<\/b> won <b class="ny">£0\.50 site credit<\/b><small>Pop For Pennies · /);
    expect(html).not.toContain('aria-label="Prize ladder"');
  });
  it("competition cards show price, wins, highlight, time left and % sold, never a ticket count", async () => {
    const { html } = await new Browser(site.origin).page("/competitions");
    const t = text(html);
    expect(t).toMatch(/25p/);
    expect(t).toMatch(/2,516 instant wins/); // the count on the pill, with the words for screen readers
    expect(t).toMatch(/Top Prize £/);
    expect(t).toMatch(/\d+d \d+h/);
    expect(t).toMatch(/2% sold/);
    expect(t).not.toMatch(/\d ?left|tickets in total|max entries/i); // players only ever see % sold
    expect(t).toMatch(/Buy 10 Get 15 Free/); // a live draw card names its Our Pick bundle
    expect(html).toContain("data-ends=");
    // No game tag on a card (only live draws keep their Live Draw tag), and no limit per person anywhere.
    expect(html).not.toMatch(/<span class="gt">/);
    expect(html).toContain('<span class="gt cy">');
    expect(t).not.toMatch(/per person/i);
    expect(text((await new Browser(site.origin).page("/competitions/bush-bucks-jungle-trial")).html)).not.toMatch(/per person/i);
  });
  it("the competition page: prize cards, one information box, no demo link", async () => {
    const { html } = await new Browser(site.origin).page("/competitions/bush-bucks-jungle-trial");
    const t = text(html);
    expect(html).not.toContain("Try The Game Free");
    expect(html).not.toContain('class="acd"');
    expect(html).toContain('data-testid="more-information"');
    expect(t).toMatch(/Instant prizes left to win/);
    expect(t).toMatch(/Left to win/);
    expect(t).toMatch(/of 1,500 found/);
    expect(html).toContain("/competitions/bush-bucks-jungle-trial/winning-numbers?prize=Bug+Bite");
    expect(html).toContain('href="/free-entry"'); // the free postal route stays visible
    const one = text((await new Browser(site.origin).page("/competitions/bush-bucks-jungle-trial/winning-numbers?prize=Bug+Bite")).html);
    expect(one).toContain("Show every prize");
    expect(one).not.toContain("King of the Jungle");
  });
  it("game demos can be framed by this site only, and ?embed=1 is just the game", async () => {
    const b = new Browser(site.origin);
    const demo = await b.page("/demo/slots?skin=christmas&embed=1");
    expect(demo.res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(demo.html).not.toContain('class="hd"'); // no header
    expect(demo.html).not.toContain("GIMMEGIMMEPRIZES LTD"); // no footer
    expect((await b.page("/demo/slots")).html).toContain("GIMMEGIMMEPRIZES LTD");
    expect((await b.page("/")).res.headers.get("x-frame-options")).toBe("DENY");
  });
  it("a live draw's page shows its bundles, Our Pick first choice, and no ticket counts", async () => {
    const { html } = await new Browser(site.origin).page("/competitions/lush-snow-fairy-wonderland");
    const t = text(html);
    expect(t).toMatch(/Buy 10 Get 15 FREE!/);
    expect(t).toMatch(/Our Pick/);
    expect(t).toMatch(/25 tickets for £5\.90/);
    expect(t).toMatch(/Save £8\.85/);
    expect(t).toMatch(/Bundle and free tickets are entered into the draw exactly like paid tickets/);
    expect(t).toMatch(/8% SOLD/);
    expect(html).not.toMatch(/maxTickets|ticketsLeft|maxPerPerson/);
  });
  it("the competition page renders the ticket picker on the server", async () => {
    const { html } = await new Browser(site.origin).page("/competitions/bush-bucks-jungle-trial");
    expect(html).toContain('data-testid="ticket-picker"');
    expect(html).toContain("Or choose your own amount");
    expect(html).toContain("£2.50"); // 10 tickets × 25p preselected
    expect(html).toMatch(/Seed fingerprint/);
  });
});
