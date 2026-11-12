import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, text, type Site } from "./harness";

let site: Site;
beforeAll(async () => { site = await startSite(); }, 60000);
afterAll(async () => { await site?.stop(); });

const uniq = () => `p${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

describe("sign up", () => {
  it("refuses under-18s and bad details with field messages", async () => {
    const b = new Browser(site.origin);
    const r = await b.api("/api/auth/register", { firstName: "", lastName: "Smith", email: "nope", password: "short", dateOfBirth: "2015-01-01" });
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.errors).sort()).toEqual(["dateOfBirth", "email", "firstName", "password"]);
  });
  it("a new player signs up, lands on the account page, and must confirm their email before playing", async () => {
    const b = new Browser(site.origin);
    const email = uniq();
    expect((await b.api("/api/auth/register", { firstName: "Sam", lastName: "Jones", email, password: "correct-horse", dateOfBirth: "1990-05-05", marketingOptIn: false })).status).toBe(201);
    const { html } = await b.page("/account");
    expect(text(html)).toContain("Hi Sam");
    expect(html).toContain("Confirm your email address");
    const blocked = await b.api("/api/checkout", { lines: [{ competitionId: "c-pop", quantity: 5 }], payWith: "card", useWallet: false, requestId: "r1" });
    expect(blocked.status).toBe(403);
    // Signed in, so the join and login pages send them on.
    expect((await b.get("/join?next=/checkout")).headers.get("location")).toBe("/checkout");
    expect((await b.get("/login?next=//evil.com")).headers.get("location")).toBe("/account");
  });
});

describe("buying and playing", () => {
  it("wallet checkout: pay, see You're In, play, winnings land in the wallet", async () => {
    const b = new Browser(site.origin);
    expect((await b.api("/api/auth/login", { email: "player@example.com", password: "password123" })).status).toBe(200);
    const before = (await b.api("/api/me")).body.wallet.totalPence;
    const price = await b.api("/api/basket/price", { lines: [{ competitionId: "c-bush", quantity: 10 }] });
    expect(price.body.totalPence).toBe(250);
    expect(price.body.walletCovers).toBe(true);
    const co = await b.api("/api/checkout", { lines: [{ competitionId: "c-bush", quantity: 10 }], payWith: "wallet", useWallet: true, requestId: "w1" });
    expect(co.status).toBe(201);
    expect(co.body.next).toBe("play");
    const n = co.body.order.number;
    const { html } = await b.page(`/order/${n}`);
    expect(html).toContain("You’re");
    expect(text(html)).toContain("Play My 10 Games");
    const play = await b.api(`/api/orders/${n}/play`, {});
    expect(play.status).toBe(200);
    expect(play.body.outcome.tickets).toHaveLength(10);
    const won = play.body.outcome.tickets.filter((t: any) => t.prize).reduce((s: number, t: any) => s + t.prize.valuePence, 0);
    expect(play.body.outcome.creditedPence).toBe(won);
    const after = (await b.api("/api/me")).body.wallet.totalPence;
    expect(after).toBe(before - 250 + won);
    // Playing again reveals nothing new: results are never shown twice as fresh wins.
    expect((await b.api(`/api/orders/${n}/play`, {})).body.outcome.tickets).toHaveLength(0);
    const tickets = await b.page("/account/tickets");
    expect(tickets.html).toContain("Bush Bucks – Jungle Trial");
  });

  it("card checkout: off to the payment page, back to a confirmed order", async () => {
    const b = new Browser(site.origin);
    await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
    const co = await b.api("/api/checkout", { lines: [{ competitionId: "c-lush", quantity: 5 }], payWith: "card", useWallet: false, requestId: "c1" });
    expect(co.status).toBe(201);
    expect(co.body.next).toBe("redirect");
    const n = co.body.order.number;
    // The order page waits for confirmation instead of saying "You're In" early.
    const waiting = await b.page(`/order/${n}`);
    expect(waiting.html).toContain("Confirming Your Payment");
    expect(waiting.html).not.toContain("You’re <span");
    const pay = await fetch(co.body.redirectUrl + "/paid", { redirect: "manual" });
    expect(pay.headers.get("location")).toContain(`/order/${n}`);
    const r = await b.api(`/api/orders/${n}/return`, {});
    expect(r.body.status).toBe("paid");
    expect(r.body.lines[0].tickets).toHaveLength(5);
    const done = await b.page(`/order/${n}`);
    expect(done.html).toContain("In The Draw");
  });

  it("a declined card payment closes the order and puts the wallet part back", async () => {
    const b = new Browser(site.origin);
    await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
    const before = (await b.api("/api/me")).body.wallet.totalPence;
    const co = await b.api("/api/checkout", { lines: [{ competitionId: "c-cash", quantity: 30 }], payWith: "card", useWallet: true, requestId: "f1" });
    expect(co.body.next).toBe("redirect");
    await fetch(co.body.redirectUrl + "/failed", { redirect: "manual" });
    const page = await b.page(`/payment/failed?order=${co.body.order.number}`);
    expect(page.res.status).toBe(200);
    const r = await b.api(`/api/orders/${co.body.order.number}/return`, { leftAs: "failed" });
    expect(r.body.status).toBe("failed");
    expect((await b.api("/api/me")).body.wallet.totalPence).toBe(before);
  });

  it("refuses a card payment under the £1 minimum", async () => {
    const b = new Browser(site.origin);
    await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
    const r = await b.api("/api/checkout", { lines: [{ competitionId: "c-pop", quantity: 5 }], payWith: "card", useWallet: false, requestId: "m1" });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/£1/);
  });
  it("needs the XSRF token for anything that changes data", async () => {
    const r = await fetch(site.origin + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: "player@example.com", password: "password123" }) });
    expect(r.status).toBe(419);
  });
});

describe("account", () => {
  it("every account page renders for a signed-in player", async () => {
    const b = new Browser(site.origin);
    await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
    for (const [p, txt] of [["/account", "Hi Liam"], ["/account/tickets", "My Tickets"], ["/account/wallet", "Your Wallet"], ["/account/safer-play", "Safer Play"], ["/account/settings", "Your Details"], ["/checkout", "Review & Pay"]] as const) {
      const { res, html } = await b.page(p);
      expect(res.status, p).toBe(200);
      expect(text(html), p).toContain(txt);
      expect(res.headers.get("cache-control"), p).toContain("no-store");
    }
  });
  it("logging out ends the session", async () => {
    const b = new Browser(site.origin);
    await b.api("/api/auth/login", { email: "player@example.com", password: "password123" });
    const res = await fetch(site.origin + "/logout", { method: "POST", headers: { Cookie: b.cookie(), Origin: site.origin, "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    expect(res.status).toBe(303);
    for (const c of res.headers.getSetCookie()) if (c.startsWith("gimme_session=")) b.jar.delete("gimme_session");
    expect((await b.get("/account")).status).toBe(302);
  });
});
