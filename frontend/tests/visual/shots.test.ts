// Visual sweep: every page at phone, small phone, tablet and desktop, against the real Laravel stack.
// Fails on console errors, failed same-site requests, sideways scrolling and broken pictures, and
// saves full-page screenshots to $SHOTS_DIR (default /tmp/gg-shots) for a person to look at.
// Run: npm run build && npm run test:visual   (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser as PW, type BrowserContext, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSite, type Site } from "../e2e/harness";

const OUT = process.env.SHOTS_DIR ?? "/tmp/gg-shots";
const VIEWPORTS = { phone: { width: 390, height: 844 }, small: { width: 320, height: 640 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } } as const;
const PUBLIC = ["/", "/competitions", "/competitions?type=instant", "/competitions/bush-bucks-jungle-trial", "/competitions/lush-snow-fairy-wonderland", "/instant-winners", "/winners", "/entry-lists", "/how-it-works", "/faq", "/contact", "/free-entry", "/legal/terms", "/menu", "/join", "/login", "/forgot-password", "/basket", "/demo/balloon_pop", "/payment/failed", "/verify-email?status=verified", "/nope-404"];
const MEMBER = ["/account", "/account/tickets", "/account/wallet", "/account/safer-play", "/account/settings", "/checkout"];

let site: Site;
let browser: PW;
const problems: string[] = [];
beforeAll(async () => {
  site = await startSite("laravel");
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  fs.mkdirSync(OUT, { recursive: true });
}, 180000);
afterAll(async () => {
  fs.writeFileSync(path.join(OUT, "problems.txt"), problems.join("\n") + "\n");
  await browser?.close();
  await site?.stop();
});

const slug = (p: string) => (p === "/" ? "home" : p.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_"));

async function check(ctx: BrowserContext, vp: string, p: string, expectStatus = 200): Promise<Page> {
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !(expectStatus === 404 && m.text().includes("404"))) errs.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { const u = new URL(r.url()); if (u.origin === site.origin && r.status() >= 400 && !(p === "/nope-404" && r.url().endsWith(p))) errs.push(`${r.status()} ${u.pathname}`); });
  const res = await page.goto(site.origin + p, { waitUntil: "networkidle" });
  expect(res?.status(), `${vp} ${p}`).toBe(expectStatus);
  await page.waitForTimeout(400);
  const layout = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const clipped = (e: Element) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (o.overflowX !== "visible" || o.overflow !== "visible") return true; } return false; };
    const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && getComputedStyle(e).position !== "fixed" && !clipped(e); })
      .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]}`);
    const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src);
    // Tap targets under 32px tall, ignoring links inside a sentence (those sit in running text).
    const smallTapEls = [...document.querySelectorAll("a, button, input, select, [role=button]")].filter((e) => {
      const r = e.getBoundingClientRect();
      const inText = e.tagName === "A" && e.parentElement && ["P", "SPAN", "LI", "DIV"].includes(e.parentElement.tagName) && (e.parentElement.textContent ?? "").trim().length > (e.textContent ?? "").trim().length + 3 && getComputedStyle(e).display === "inline";
      return r.width > 0 && r.height > 0 && r.height < 32 && getComputedStyle(e).visibility !== "hidden" && !e.classList.contains("sr-only") && !inText;
    });
    const smallTaps = smallTapEls.length;
    const smallTapNames = smallTapEls.slice(0, 6).map((e) => `${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).split(" ")[0] : ""}"${(e.textContent ?? "").trim().slice(0, 18)}"(${Math.round(e.getBoundingClientRect().height)})`);
    const smallInputs = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && parseFloat(getComputedStyle(e).fontSize) < 16; }).length;
    // Words run together in a heading ("MyTickets"): a space lost between a word and a styled word.
    const joined = [...document.querySelectorAll("h1, h2, h3, .btn")].map((e) => (e as HTMLElement).innerText.trim()).filter((t) => /[a-z][A-Z]/.test(t.replace(/BeGambleAware|GamCare|GamStop|McD\w+/g, "")));
    return { overflow: document.documentElement.scrollWidth > w + 1, wide, broken, smallTaps, smallTapNames, smallInputs, joined };
  });
  if (layout.overflow) errs.push(`scrolls sideways (${layout.wide.join(", ")})`);
  for (const b of layout.broken) errs.push(`broken image ${b}`);
  for (const j of layout.joined) errs.push(`words run together: "${j}"`);
  if (vp !== "desktop" && layout.smallInputs) errs.push(`${layout.smallInputs} input(s) under 16px (iOS zooms)`);
  fs.mkdirSync(path.join(OUT, vp), { recursive: true });
  await page.screenshot({ path: path.join(OUT, vp, `${slug(p)}.png`), fullPage: vp !== "desktop" || true });
  for (const e of errs) problems.push(`[${vp}] ${p}: ${e}`);
  if (layout.smallTaps && vp === "phone") problems.push(`[note ${vp}] ${p}: ${layout.smallTaps} tap target(s) under 32px tall: ${layout.smallTapNames.join(" ")}`);
  expect(errs, `${vp} ${p}`).toEqual([]);
  return page;
}

for (const [vp, size] of Object.entries(VIEWPORTS)) {
  describe(vp, () => {
    let ctx: BrowserContext;
    beforeAll(async () => { ctx = await browser.newContext({ viewport: size, deviceScaleFactor: vp === "desktop" ? 1 : 2, locale: "en-GB", timezoneId: "Europe/London", reducedMotion: "reduce" }); });
    afterAll(async () => { await ctx?.close(); });
    for (const p of PUBLIC) it(p, async () => { await (await check(ctx, vp, p, p === "/nope-404" ? 404 : 200)).close(); });
    it("sign in through the form", async () => {
      const page = await check(ctx, vp, "/login");
      await page.fill("input[type=email]", "player@example.com");
      await page.fill("input[type=password]", "password123");
      await Promise.all([page.waitForURL(/\/account/), page.click("button[type=submit]")]);
      await page.close();
    });
    for (const p of MEMBER) it(p, async () => { await (await check(ctx, vp, p)).close(); });
    it("buy from the wallet and play the reveal", async () => {
      const page = await check(ctx, vp, "/competitions/cash-bang");
      const xsrf = decodeURIComponent((await ctx.cookies()).find((c) => c.name === "XSRF-TOKEN")?.value ?? "");
      const comps = await (await page.request.get(site.origin + "/api/competitions")).json();
      const id = comps.data.find((c: any) => c.slug === "cash-bang").id;
      const co = await page.request.post(site.origin + "/api/checkout", { headers: { "X-XSRF-TOKEN": xsrf, Referer: site.origin + "/" }, data: { lines: [{ competitionId: id, quantity: 10 }], payWith: "wallet", useWallet: true, requestId: crypto.randomUUID() } });
      expect(co.status(), await co.text()).toBe(201);
      const n = (await co.json()).order.number;
      await page.close();
      const order = await check(ctx, vp, `/order/${n}`);
      const errs: string[] = [];
      order.on("pageerror", (e) => errs.push(e.message));
      order.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await order.getByRole("button", { name: /Play My 10 Games/ }).click();
      await order.waitForTimeout(2500);
      await order.screenshot({ path: path.join(OUT, vp, "reveal.png") });
      expect(errs, `${vp} reveal`).toEqual([]);
      await order.close();
    });
  });
}
