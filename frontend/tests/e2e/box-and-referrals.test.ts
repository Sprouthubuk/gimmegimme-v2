import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, text, type Site } from "./harness";

let site: Site;
beforeAll(async () => { site = await startSite(); }, 60000);
afterAll(async () => { await site?.stop(); });

const uniq = () => `p${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const COUNT_KEYS = ["maxTickets", "ticketsSold", "ticketsLeft", "remaining", "maxPerPerson", "maxEntries"];

describe("Gimme Box", () => {
  it("the home page, the box page and draw pages show it while it's on", async () => {
    const b = new Browser(site.origin);
    expect((await b.page("/")).html).toContain('data-testid="gimme-box"');
    const page = await b.page("/gimme-box");
    expect(page.res.status).toBe(200);
    expect(text(page.html)).toContain("Gimme Box");
    expect((await b.page("/competitions/ninja-possiblecooker")).html).toContain('data-testid="gb-link"');
    // Not on instant wins: boxes are live draws only.
    expect((await b.page("/competitions/fruity-fortunes")).html).not.toContain('data-testid="gb-link"');
  });

  it("a box is never over budget, carries no ticket counts, and its bonus shows in the basket", async () => {
    const b = new Browser(site.origin);
    const r = await b.api("/api/gimme-box", { budgetPence: 2000, mode: "surprise" });
    expect(r.status).toBe(201);
    expect(r.body.totalPence).toBeLessThanOrEqual(2000);
    expect(r.body.totalPence + r.body.unusedPence).toBe(2000);
    for (const k of COUNT_KEYS) expect(JSON.stringify(r.body)).not.toContain(k);
    expect((await b.api(`/api/gimme-box/${r.body.id}/added`, {})).status).toBe(200);
    const priced = await b.api("/api/basket/price", { lines: r.body.basketLines });
    expect(priced.body.totalPence).toBe(r.body.totalPence);
    expect(priced.body.ticketCount).toBe(r.body.tickets);
    expect(priced.body.lines.filter((l: any) => l.bonusQuantity > 0).every((l: any) => l.source === "gimme_box")).toBe(true);
    // Shaking again releases the old box.
    const again = await b.api("/api/gimme-box", { budgetPence: 2000, mode: "big", replaces: r.body.id });
    expect(again.status).toBe(201);
  });

  it("refuses a budget outside the limits", async () => {
    const b = new Browser(site.origin);
    expect((await b.api("/api/gimme-box", { budgetPence: 250, mode: "surprise" })).status).toBe(422);
    expect((await b.api("/api/gimme-box", { budgetPence: 2000, mode: "cheapest" })).status).toBe(422);
  });
});

describe("Refer a Friend", () => {
  it("a share link fills in the join page with who invited you, and both sides get a voucher to use", async () => {
    const a = new Browser(site.origin);
    expect((await a.api("/api/auth/register", { firstName: "Alex", lastName: "Ref", email: uniq(), password: "correct-horse", dateOfBirth: "1990-05-05" })).status).toBe(201);
    const page = await a.page("/account/refer");
    expect(page.res.status).toBe(200);
    const mine = (await a.api("/api/me/referrals")).body;
    expect(mine.link).toContain(`/r/${mine.code}`);

    const f = new Browser(site.origin);
    const share = await f.get(`/r/${mine.code}`);
    expect(share.status).toBe(302);
    expect(share.headers.get("location")).toBe(`/join?ref=${mine.code}`);
    const join = await f.page(`/join?ref=${mine.code}`);
    expect(join.html).toContain('data-testid="invite-banner"');
    expect(text(join.html)).toContain("Alex invited you");
    expect((await f.api("/api/auth/register", { firstName: "Fran", lastName: "Friend", email: uniq(), password: "correct-horse", dateOfBirth: "1991-05-05", referralCode: mine.code, deviceId: "dev-test-1" })).status).toBe(201);

    const v = (await a.api("/api/me/referrals")).body.vouchers[0];
    expect(v.status).toBe("available");
    const draws = await a.api(`/api/me/vouchers/${v.id}/draws`);
    // The draw picker lists competitions, whose ticket counts are public since 22 Nov 2026; never a per-person limit.
    for (const k of ["maxPerPerson", "maxEntries"]) expect(JSON.stringify(draws.body)).not.toContain(k);
    const used = await a.api(`/api/me/vouchers/${v.id}/redeem`, { competitionId: "c-ninja" });
    expect(used.status).toBe(201);
    expect((await a.api(`/api/me/vouchers/${v.id}/redeem`, { competitionId: "c-ninja" })).status).toBe(422);
  });

  it("an unknown code is ignored on the join page", async () => {
    const b = new Browser(site.origin);
    const join = await b.page("/join?ref=NOTACODE");
    expect(join.res.status).toBe(200);
    expect(join.html).not.toContain('data-testid="invite-banner"');
  });
});
