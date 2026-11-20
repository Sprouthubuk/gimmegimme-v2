/**
 * The whole buying journey in a real browser, on a phone, against the real Laravel API (fake card
 * gateway): a new visitor picks tickets, joins, confirms their email from the link, pays by card,
 * plays their games; a player buys a bundle from their wallet, tops up by card, and has a card
 * declined and cancelled. Screenshots of every step go to /tmp/gg-shots/journey. It fails on any
 * page error, console error, failed request or 4xx/5xx answer.
 */
import { expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startSite } from "../e2e/harness";

const OUT = "/tmp/gg-shots/journey";
const log: string[] = [];
let step = 0;
async function shot(p: Page, name: string) {
  step++;
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-${name}.png`, fullPage: true });
  log.push(`STEP ${step} ${name}: ${p.url()}`);
}
function watch(p: Page, who: string) {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.push(`[${who} console.${m.type()}] ${m.text().slice(0, 300)} @ ${p.url()}`); });
  p.on("pageerror", (e) => log.push(`[${who} PAGEERROR] ${e.message.slice(0, 300)} @ ${p.url()}`));
  p.on("response", (r) => { if (r.status() >= 400) log.push(`[${who} HTTP ${r.status()}] ${r.request().method()} ${r.url()}`); });
  p.on("requestfailed", (r) => log.push(`[${who} REQFAIL] ${r.url()} ${r.failure()?.errorText}`));
}
/** Taps the picker's own buy button the way a thumb would: scrolled to the middle of the screen. */
async function buyNow(p: Page) {
  const b = p.locator('[data-testid="buy-now"]');
  await b.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(500); // the sticky buy bar slides away
  // Nothing (sticky bar, tab bar, header) sits on top of it. The button gently pulses, so Playwright's
  // "stable" wait never ends: check it's on top ourselves, then tap.
  const onTop = await b.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === e || e.contains(hit));
  });
  expect(onTop, "the buy button is not covered").toBe(true);
  await b.click({ force: true });
}
/** Waits until the page's forms are live (Astro removes "ssr" from an island once it has started). */
const hydrated = (p: Page) => p.waitForFunction(() => document.querySelectorAll("astro-island[ssr]").length === 0, null, { timeout: 15000 });
const verifyLink = (be: string, email: string) => {
  const t = fs.readFileSync(path.join(be, "storage/logs/laravel.log"), "utf8");
  const i = t.lastIndexOf(email);
  const m = t.slice(i).match(/https?:\/\/[^\s"<)\]]+\/email\/verify\/[^\s"<)\]]+/);
  return m ? m[0].replace(/&amp;/g, "&") : null;
};

it("a new player and a regular player can buy, pay, play and recover from a failed card", async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const be = path.resolve("../backend");
  fs.writeFileSync(path.join(be, "storage/logs/laravel.log"), "");
  const site = await startSite("laravel", { features: true });
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  watch(p, "new");
  const t0 = Date.now();
  const timed = async (label: string, fn: () => Promise<unknown>) => { const s = Date.now(); await fn(); log.push(`  time ${label}: ${Date.now() - s}ms`); };
  try {
    // A — a new visitor buys an instant win by card on a phone.
    await timed("home", () => p.goto(site.origin + "/"));
    await shot(p, "home");
    await p.locator('a[href^="/competitions/cash-bang"]').first().click();
    await p.waitForURL(/cash-bang/);
    await shot(p, "comp-instant");
    await buyNow(p);
    await p.waitForLoadState("networkidle");
    await shot(p, "after-buy-now");
    if (!/join/.test(p.url())) {
      const j = p.locator('a[href*="/join"]').first();
      if (await j.count()) { await j.click(); await p.waitForLoadState("networkidle"); }
    }
    await shot(p, "join");
    await hydrated(p);
    const email = `newbie${Date.now()}@example.com`;
    await p.fill("#fn", "Jo"); await p.fill("#ln", "Bloggs"); await p.fill("#em", email); await p.fill("#pw", "a-good-password-1");
    await p.fill('[aria-label="Day"]', "05"); await p.fill('[aria-label="Month"]', "06"); await p.fill('[aria-label="Year"]', "1992");
    await shot(p, "join-filled");
    await timed("join submit", async () => { await p.locator('[data-testid="join-form"] button[type="submit"]').click(); await p.waitForURL((u) => !u.pathname.startsWith("/join"), { timeout: 20000 }); await p.waitForLoadState("networkidle"); });
    await shot(p, "after-join");
    const link = verifyLink(be, email);
    expect(link, "the confirmation email has a link").toBeTruthy();
    if (link) {
      await p.goto(link); await p.waitForLoadState("networkidle"); await shot(p, "after-verify");
      const go = p.locator('[data-testid="verified-go"]');
      expect(await go.textContent()).toBe("Carry On To Checkout");
      expect(await go.getAttribute("href")).toMatch(/^\/checkout\?buy=/);
      await go.click(); await p.waitForLoadState("networkidle");
    }
    if (!/checkout/.test(p.url())) {
      await p.goto(site.origin + "/basket");
      await shot(p, "basket");
      const go = p.locator('main a[href^="/checkout"]').first();
      if (await go.count()) { await go.click(); await p.waitForLoadState("networkidle"); }
    }
    await shot(p, "checkout");
    const pay = p.locator('main button.gg-cta').last();
    log.push(`checkout button: ${await pay.textContent()} disabled=${await pay.isDisabled()}`);
    await timed("checkout submit", async () => { await pay.click(); await p.waitForLoadState("networkidle"); });
    await shot(p, "after-pay-click");
    if (/fake-pay/.test(p.url())) { await p.click("#pay"); await p.waitForLoadState("networkidle"); await shot(p, "after-card-paid"); }
    await p.waitForTimeout(1500);
    expect(p.url()).toMatch(/\/order\/GG-/);
    await shot(p, "order-page");
    const play = p.locator('[data-testid="play"]');
    expect(await play.count()).toBe(1);
    {
      await play.first().click();
      await p.waitForTimeout(2500);
      await shot(p, "game-open");
      // Tap around the board to play it, then look at the result.
      for (let i = 0; i < 25; i++) { await p.mouse.click(120 + (i % 5) * 40, 300 + Math.floor(i / 5) * 60).catch(() => {}); await p.waitForTimeout(150); }
      await p.waitForTimeout(3000);
      await shot(p, "game-after-play");
    }
    await p.goto(site.origin + "/account/tickets");
    expect(await p.locator("main").textContent()).toContain("10 tickets");
    await shot(p, "my-tickets");

    // B — the demo player buys the live draw's bundle with their wallet.
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const q = await ctx2.newPage();
    watch(q, "player");
    await q.goto(site.origin + "/login");
    await hydrated(q);
    await q.fill('[data-testid="login-form"] input[type="email"]', "player@example.com");
    await q.fill('[data-testid="login-form"] input[type="password"]', "password123");
    await q.locator('[data-testid="login-form"] button[type="submit"]').click();
    await q.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
    await q.waitForLoadState("networkidle");
    await shot(q, "player-after-login");
    await q.goto(site.origin + "/competitions/lush-snow-fairy-wonderland");
    await shot(q, "comp-draw");
    const bundle = q.locator('.bcard').first();
    if (await bundle.count()) { await bundle.click(); await shot(q, "draw-bundle-picked"); }
    await buyNow(q);
    await q.waitForLoadState("networkidle");
    await shot(q, "draw-after-buy-now");
    if (!/checkout/.test(q.url())) { await q.goto(site.origin + "/checkout"); }
    await shot(q, "draw-checkout");
    await q.locator('main button.gg-cta').last().click();
    await q.waitForLoadState("networkidle");
    if (/fake-pay/.test(q.url())) { await q.click("#pay"); await q.waitForLoadState("networkidle"); }
    await q.waitForTimeout(1500);
    expect(q.url()).toMatch(/\/order\/GG-/);
    expect(await q.locator('[data-testid="draw-line"]').count()).toBe(1);
    await shot(q, "draw-order-page");
    await q.goto(site.origin + "/account/wallet");
    await shot(q, "wallet");
    await q.goto(site.origin + "/account");
    await shot(q, "account");
    await q.goto(site.origin + "/gimme-box");
    await shot(q, "gimme-box");
    // D — top up £5 by card, then a card that's declined, then one that's cancelled.
    await q.goto(site.origin + "/account/wallet");
    await q.locator('main button.gg-cta').first().click();
    await q.waitForURL(/fake-pay/, { timeout: 15000 });
    await q.click("#pay");
    await q.waitForURL((u) => !/fake-pay/.test(u.pathname), { timeout: 15000 });
    await q.waitForTimeout(2500);
    expect(await q.locator("main").textContent()).toContain("Top up received");
    // The header's balance matches the page's (it used to show the balance from before the top up).
    const shown = (await q.locator("[data-wallet]").first().textContent())?.trim();
    expect(await q.locator("main").textContent()).toContain(shown!);
    await shot(q, "after-topup");
    for (const result of ["fail", "cancel"]) {
      await q.goto(site.origin + "/competitions/cash-bang");
      await buyNow(q);
      await q.waitForLoadState("networkidle");
      await q.getByText("Debit Or Credit Card").click();
      await shot(q, `checkout-before-${result}`);
      log.push(`pay button: ${await q.locator('main button.gg-cta').last().textContent()}`);
      await q.locator('main button.gg-cta').last().click();
      await q.waitForURL(/fake-pay/, { timeout: 15000 });
      await q.click("#" + result);
      await q.waitForURL((u) => !/fake-pay/.test(u.pathname), { timeout: 15000 });
      await q.waitForTimeout(2500);
      expect(q.url()).toContain(result === "fail" ? "/payment/failed" : "/payment/cancelled");
      await shot(q, `after-card-${result}`);
      await q.goto(site.origin + "/basket");
      // "Enter Now" skips the basket; after a failed card the tickets wait in it for "Try Again".
      await q.locator('[data-testid="basket-line"]').first().waitFor({ timeout: 10000 });
      await shot(q, `basket-after-${result}`);
      await q.evaluate(() => localStorage.removeItem("gg-basket-v1"));
    }

    // C — desktop pass over the main pages.
    const d = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    watch(d, "desktop");
    for (const u of ["/", "/competitions", "/competitions/lush-snow-fairy-wonderland", "/competitions/bush-bucks-jungle-trial", "/basket", "/winners", "/free-entry", "/faq", "/how-it-works"]) {
      await timed(`desktop ${u}`, () => d.goto(site.origin + u));
      await shot(d, "desktop" + u.replace(/\//g, "_"));
    }
    const problems = log.filter((l) => /PAGEERROR|console\.error|REQFAIL|HTTP [45]\d\d/.test(l));
    expect(problems, problems.join("\n")).toEqual([]);
  } catch (e) {
    // Leave a picture of where it stopped.
    for (const pg of b.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: `${OUT}/zz-stopped-${b.contexts().indexOf(pg.context())}.png`, fullPage: true }).catch(() => {});
    throw e;
  } finally {
    log.push(`total ${Date.now() - t0}ms`);
    fs.writeFileSync(`${OUT}/log.txt`, log.join("\n"));
    await b.close();
    await site.stop();
  }
}, 400000);
