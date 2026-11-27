// The cookie banner on a phone, as an ad visitor first sees it (real Laravel, a Pixel ID set): in the page from the
// first paint, one sentence, Reject and Accept the same size and style, above the competition page's buy bar,
// and nothing from Meta asked for before a choice. Screenshots go to $SHOTS_DIR/cookie-banner (default /tmp/gg-shots).
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser as PW, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSite, type Site } from "../e2e/harness";

const OUT = path.join(process.env.SHOTS_DIR ?? "/tmp/gg-shots", "cookie-banner");
let site: Site;
let browser: PW;
let comp = "";
beforeAll(async () => {
  site = await startSite("laravel", { pixel: "977064968058757" });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  fs.mkdirSync(OUT, { recursive: true });
  const list = await (await fetch(`${site.origin}/api/competitions`, { headers: { Accept: "application/json" } })).json();
  comp = list.data.find((c: { isFree?: boolean; status: string }) => !c.isFree && c.status === "live")?.slug ?? list.data[0].slug;
}, 180000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

const counts = () => JSON.parse(site.artisan!(["tinker", "--execute", "echo json_encode(App\\Support\\ConsentChoices::daily(1));"]).trim().split("\n").pop()!);

async function open(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-GB", timezoneId: "Europe/London" });
  const page = await ctx.newPage();
  const meta: string[] = [];
  const errs: string[] = [];
  page.on("request", (r) => { if (/facebook\.(net|com)/.test(r.url())) meta.push(r.url()); });
  page.on("pageerror", (e) => errs.push(e.message));
  // Ad tracking on the end, as a visitor from an ad arrives.
  await page.goto(`${site.origin}/competitions/${comp}?utm_source=facebook&utm_medium=paid&fbclid=test123`, { waitUntil: "load" });
  return { ctx, page, meta, errs };
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

describe("cookie banner on a phone", () => {
  for (const [w, h] of [[390, 844], [320, 568]] as const) {
    it(`${w}px: shown at once, equal buttons, above the buy bar, nothing from Meta before a choice`, async () => {
      const { ctx, page, meta, errs } = await open(w, h);
      const banner = page.locator("#cookie-banner");
      await expect(banner.isVisible()).resolves.toBe(true);
      await page.screenshot({ path: path.join(OUT, `${w}-competition.png`) });

      const text = (await page.locator("#cookie-banner .ck-t").innerText()).replace(/Cookie policy$/, "").trim();
      expect(text.split(/[.?!](\s|$)/).filter((s) => s && s.trim()).length).toBe(1); // one sentence

      const [rej, acc] = [await box(page, '[data-choice="rejected"]'), await box(page, '[data-choice="accepted"]')];
      expect(Math.abs(rej.width - acc.width)).toBeLessThan(1);
      expect(Math.abs(rej.height - acc.height)).toBeLessThan(1);
      expect(rej.height).toBeGreaterThanOrEqual(44);
      const style = (sel: string) => page.locator(sel).evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, s.borderColor, s.fontSize, s.fontWeight].join(); });
      expect(await style('[data-choice="rejected"]')).toBe(await style('[data-choice="accepted"]'));

      // Nothing fixed to the bottom (the buy bar, the menu) covers any part of it.
      const b = await box(page, "#cookie-banner");
      for (const sel of [".buybar", ".bn"]) {
        const el = page.locator(sel).first();
        if (await el.count() && await el.isVisible()) expect(b.y + b.height).toBeLessThanOrEqual((await el.boundingBox())!.y + 0.5);
      }
      expect(b.y).toBeGreaterThanOrEqual(0);

      // Scroll until the buy bar slides in: the banner moves up and stays clear of it.
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(900);
      const b2 = await box(page, "#cookie-banner");
      expect(b2.y).toBeGreaterThanOrEqual(0); // still on screen
      expect(b2.y + b2.height).toBeLessThanOrEqual(h);
      for (const sel of [".buybar", ".bn"]) {
        const el = page.locator(sel).first();
        const bb = await el.count() ? await el.boundingBox() : null;
        if (bb && bb.y >= 0 && bb.y < h && bb.y + bb.height >= h - 4) expect(b2.y + b2.height).toBeLessThanOrEqual(bb.y + 0.5);
      }
      await page.screenshot({ path: path.join(OUT, `${w}-scrolled.png`) });
      // And with the buy bar in: scroll back to where it shows (above the picker it slides in).
      await page.mouse.wheel(0, -900);
      await page.waitForTimeout(900);
      const b3 = await box(page, "#cookie-banner");
      expect(b3.y).toBeGreaterThanOrEqual(0);
      for (const sel of [".buybar", ".bn"]) {
        const el = page.locator(sel).first();
        const bb = await el.count() ? await el.boundingBox() : null;
        if (bb && bb.y >= 0 && bb.y < h && bb.y + bb.height >= h - 4) expect(b3.y + b3.height).toBeLessThanOrEqual(bb.y + 0.5);
      }
      await page.screenshot({ path: path.join(OUT, `${w}-scrolled-back.png`) });

      await page.waitForTimeout(800);
      expect(meta).toEqual([]); // no Meta script or pixel before a choice
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }

  it("Reject: banner goes, nothing from Meta, counted once; Accept: the Pixel starts, counted once", async () => {
    const before = Object.values(counts())[0] as { accepted: number; rejected: number };

    const r = await open(390, 844);
    await r.page.click('[data-choice="rejected"]');
    await expect(r.page.locator("#cookie-banner").isVisible()).resolves.toBe(false);
    await r.page.waitForTimeout(800);
    expect(r.meta).toEqual([]);
    await r.page.reload({ waitUntil: "load" });
    await expect(r.page.locator("#cookie-banner").isVisible()).resolves.toBe(false); // remembered, not asked again
    expect(r.meta).toEqual([]);
    await r.ctx.close();

    const a = await open(390, 844);
    await a.page.click('[data-choice="accepted"]');
    await expect(a.page.locator("#cookie-banner").isVisible()).resolves.toBe(false);
    await a.page.waitForTimeout(500);
    expect(a.meta.some((u) => u.includes("connect.facebook.net"))).toBe(true);
    await a.page.screenshot({ path: path.join(OUT, "390-after-accept.png") });
    await a.ctx.close();

    await new Promise((res) => setTimeout(res, 500));
    const after = Object.values(counts())[0] as { accepted: number; rejected: number };
    expect(after).toEqual({ accepted: before.accepted + 1, rejected: before.rejected + 1 });
  });
});
