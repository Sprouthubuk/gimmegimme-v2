// The built Astro site against the REAL Laravel API (fresh SQLite database, DemoSeeder, fake
// payment gateway, Verity on its local beacon), behind a proxy routed like deploy/nginx.conf.
// Run: npm run build && npm run test:fullstack   (needs PHP 8.3 and `composer install` in backend/)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, text, type Site } from "../e2e/harness";

let site: Site;
beforeAll(async () => { site = await startSite("laravel"); }, 120000);
afterAll(async () => { await site?.stop(); });

// One signed-in player for the whole file (logging in six times a minute would rightly hit the rate limit).
let player: Browser | null = null;
const login = async () => {
  const b = new Browser(site.origin);
  const r = await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return b;
};
const signIn = async () => (player ??= await login());
const comps = async () => Object.fromEntries((await new Browser(site.origin).api("/api/competitions")).body.data.map((c: any) => [c.slug, c]));
const uuid = () => crypto.randomUUID();

describe("public pages from real data", () => {
  it("home, listings and competition pages render what Laravel and Verity hold", async () => {
    const b = new Browser(site.origin);
    const home = text((await b.page("/")).html);
    expect(home).toContain("Bush Bucks – Jungle Trial");
    const list = text((await b.page("/competitions")).html);
    for (const t of ["Bush Bucks – Jungle Trial", "Cash Bang", "Lush Snow Fairy Wonderland"]) expect(list).toContain(t);
    const instant = await b.page("/competitions/bush-bucks-jungle-trial");
    expect(instant.res.status).toBe(200);
    expect(text(instant.html)).toContain("£500 Cash");
    expect(instant.html).toMatch(/VTY-[A-Z0-9]{6}/);
    expect(text((await b.page("/competitions/lush-snow-fairy-wonderland")).html)).toContain("Lush Snow Fairy Wonderland");
    expect((await b.page("/competitions/not-real")).res.status).toBe(404);
    expect(text((await b.page("/legal/terms")).html)).toContain("Terms & Conditions");
  });
  it("competition pictures are served from Laravel's storage", async () => {
    const c = (await comps())["cash-bang"];
    expect(c.image).toBe("/storage/competitions/cash.webp");
    const img = await fetch(site.origin + c.image);
    expect(img.status).toBe(200);
  });
  it("anyone can check a competition with Verity's verifier", async () => {
    const c = (await new Browser(site.origin).api("/api/competitions/lush-snow-fairy-wonderland")).body;
    expect(c.verifyUrl).toBe(`/verify/${c.verityRef}`);
    const page = await new Browser(site.origin).page(c.verifyUrl);
    expect(page.res.status).toBe(200);
    expect(page.html).toContain(`/verity/competitions/${c.verityRef}/verification`);
    const record = await fetch(`${site.origin}/verity/competitions/${c.verityRef}/verification`);
    expect(record.status).toBe(200);
    expect(JSON.stringify(await record.json())).toContain(c.commitment);
    expect((await fetch(`${site.origin}/vendor/verity/verify-page/verity-verify.js`)).status).toBe(200);
    expect((await new Browser(site.origin).page("/verify/..%2Fadmin")).res.status).toBe(404);
  });
  it("the admin is served through the same domain", async () => {
    const r = await fetch(site.origin + "/admin/login");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Gimme Gimme Admin");
  });
});

describe("accounts", () => {
  it("refuses a write without the XSRF token", async () => {
    const r = await fetch(site.origin + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Referer: site.origin + "/" }, body: JSON.stringify({ email: "player@example.com", password: "password123" }) });
    expect(r.status).toBe(419);
  });
  it("signs up, sees the account page, and can't play until the email is confirmed", async () => {
    const b = new Browser(site.origin);
    const bad = await b.api("/api/auth/register", { firstName: "", lastName: "S", email: "nope", password: "short", dateOfBirth: "2015-01-01" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.errors).sort()).toEqual(["dateOfBirth", "email", "firstName", "password"]);
    const email = `p${Date.now()}@example.com`;
    expect((await b.api("/api/auth/register", { firstName: "Sam", lastName: "Jones", email, password: "correct-horse", dateOfBirth: "1990-05-05", marketingOptIn: false })).status).toBe(201);
    expect(text((await b.page("/account")).html)).toContain("Hi Sam");
    const c = (await comps())["cash-bang"];
    const blocked = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 10 }], payWith: "card", useWallet: false, requestId: uuid() });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("email_unverified");
  });
  it("every account page renders, then logging out ends the session", async () => {
    const b = await login();
    for (const [p, t] of [["/account", "Hi Liam"], ["/account/tickets", "My Tickets"], ["/account/wallet", "Your Wallet"], ["/account/safer-play", "Safer Play"], ["/account/settings", "Your Details"]] as const) {
      const { res, html } = await b.page(p);
      expect(res.status, p).toBe(200);
      expect(text(html), p).toContain(t);
    }
    const out = await fetch(site.origin + "/logout", { method: "POST", headers: { Cookie: b.cookie(), Origin: site.origin, "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    expect(out.status).toBe(303);
    for (const c of out.headers.getSetCookie()) { const [pair] = c.split(";"); const [k, v] = pair.split("="); if (!v || /max-age=0|expires=Thu, 01 Jan 1970/i.test(c)) b.jar.delete(k); else b.jar.set(k, v); }
    expect((await b.get("/account")).status).toBe(302);
    expect((await b.api("/api/me")).status).toBe(401);
  });
});

describe("buying and playing", () => {
  it("wallet checkout: Verity issues the tickets, the reveal shows them, winnings are already in the wallet", async () => {
    const b = await signIn();
    const c = (await comps())["bush-bucks-jungle-trial"];
    const before = (await b.api("/api/me")).body.wallet;
    const price = await b.api("/api/basket/price", { lines: [{ competitionId: c.id, quantity: 10 }] });
    expect(price.body).toMatchObject({ totalPence: 250, walletCovers: true, problems: [] });
    const co = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 10 }], payWith: "wallet", useWallet: true, requestId: uuid() });
    expect(co.status).toBe(201);
    expect(co.body.next).toBe("play");
    const n = co.body.order.number;
    expect(n).toMatch(/^GG-[A-Z0-9]{8}$/);
    const page = text((await b.page(`/order/${n}`)).html);
    expect(page).toContain("Play My 10 Games");
    const play = await b.api(`/api/orders/${n}/play`, {});
    expect(play.status).toBe(200);
    expect(play.body.outcome.tickets).toHaveLength(10);
    expect(new Set(play.body.outcome.tickets.map((t: any) => t.ticketNumber)).size).toBe(10);
    const won = play.body.outcome.tickets.filter((t: any) => t.prize).reduce((s: number, t: any) => s + t.prize.valuePence, 0);
    expect(play.body.outcome.creditedPence).toBe(won);
    expect(play.body.context[c.id]).toMatchObject({ game: "balloon_pop", isInstantWin: true });
    const after = (await b.api("/api/me")).body.wallet;
    expect(after.totalPence).toBe(before.totalPence - 250 + won);
    expect(after.winningsPence).toBe(before.winningsPence + won);
    expect((await b.api(`/api/orders/${n}/play`, {})).body.outcome.tickets).toEqual(play.body.outcome.tickets);
    expect((await b.api("/api/me")).body.wallet.totalPence).toBe(after.totalPence);
    expect(text((await b.page("/account/tickets")).html)).toContain("Bush Bucks – Jungle Trial");
  });

  it("card checkout: the payment page, back to the order, confirmed only after asking the gateway", async () => {
    const b = await signIn();
    const c = (await comps())["lush-snow-fairy-wonderland"];
    const co = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 5 }], payWith: "card", useWallet: false, requestId: uuid() });
    expect(co.status).toBe(201);
    expect(co.body.next).toBe("redirect");
    const n = co.body.order.number;
    const waiting = await b.page(`/order/${n}`);
    expect(waiting.html).toContain("Confirming Your Payment");
    const payPage = new URL(co.body.redirectUrl);
    const paid = await fetch(site.origin + payPage.pathname + "/paid", { redirect: "manual" });
    expect(paid.headers.get("location")).toBe(`${site.origin}/order/${n}`);
    const r = await b.api(`/api/orders/${n}/return`, {});
    expect(r.body.status).toBe("paid");
    expect(r.body.lines[0].tickets).toHaveLength(5);
    expect(text((await b.page(`/order/${n}`)).html)).toContain("In The Draw");
  });

  it("a declined card payment closes the order and puts the wallet part back", async () => {
    const b = await signIn();
    const c = (await comps())["cash-bang"];
    const before = (await b.api("/api/me")).body.wallet.totalPence;
    const co = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 200 }], payWith: "card", useWallet: true, requestId: uuid() });
    expect(co.body.next).toBe("redirect");
    expect((await b.api("/api/me")).body.wallet.totalPence).toBe(Math.max(0, before - 2000));
    const declined = await fetch(site.origin + new URL(co.body.redirectUrl).pathname + "/failed", { redirect: "manual" });
    expect(declined.headers.get("location")).toContain(`/payment/failed?order=${co.body.order.number}`);
    expect((await b.page(`/payment/failed?order=${co.body.order.number}`)).res.status).toBe(200);
    const r = await b.api(`/api/orders/${co.body.order.number}/return`, { leftAs: "failed" });
    expect(r.body.status).toBe("failed");
    expect((await b.api("/api/me")).body.wallet.totalPence).toBe(before);
  });

  it("refuses a card part under the £1 minimum", async () => {
    const b = await signIn();
    const c = (await comps())["cash-bang"];
    const r = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 5 }], payWith: "card", useWallet: false, requestId: uuid() });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/£1/);
  });

  it("a card top up lands in the wallet when the player comes back to the wallet page", async () => {
    const b = await signIn();
    const before = (await b.api("/api/me")).body.wallet.depositPence;
    const d = await b.api("/api/me/deposits", { amountPence: 1000 });
    expect(d.status).toBe(201);
    const back = await fetch(site.origin + new URL(d.body.redirectUrl).pathname + "/paid", { redirect: "manual" });
    const to = new URL(back.headers.get("location")!);
    expect(to.pathname + to.search).toMatch(/^\/account\/wallet\?deposit=GD-[A-Z0-9]{8}$/);
    const page = await b.page(to.pathname + to.search);
    expect(text(page.html)).toContain("Top up received");
    expect((await b.api("/api/me")).body.wallet.depositPence).toBe(before + 1000);
  });

  it("safer play: a break blocks buying at once", async () => {
    const b = new Browser(site.origin);
    const email = `brk${Date.now()}@example.com`;
    await b.api("/api/auth/register", { firstName: "Bo", lastName: "Break", email, password: "correct-horse", dateOfBirth: "1990-05-05" });
    expect((await b.api("/api/me/break", { days: 1 })).status).toBe(200);
    expect((await b.api("/api/me")).body.playBlock).toBe("cool_off");
    expect(text((await b.page("/competitions/cash-bang")).html)).toMatch(/break/i);
  });
});
