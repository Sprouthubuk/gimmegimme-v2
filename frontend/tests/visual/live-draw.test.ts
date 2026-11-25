// The live-stream draw screen in a real browser (mock API): the Ninja draw is drawn with two winners.
// "Reveal Winner" plays 3-2-1 and the spinning reel, lands on Verity's ticket and shows the masked name;
// "Next Winner" does the second place. Screenshots go to $SHOTS_DIR/live-draw (default /tmp/gg-shots).
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser as PW } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSite, type Site } from "../e2e/harness";

const OUT = path.join(process.env.SHOTS_DIR ?? "/tmp/gg-shots", "live-draw");
let site: Site;
let browser: PW;
beforeAll(async () => {
  site = await startSite("mock");
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  fs.mkdirSync(OUT, { recursive: true });
}, 180000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

describe("live draw screen", () => {
  it("reveals Verity's winners in order, with no errors", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/media/")) errs.push(m.text()); }); // the mock serves pictures from its own port
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${site.origin}/live-draw/ninja-possiblecooker`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="live-draw"]').getAttribute("data-phase")).resolves.toBe("drawn");
    expect(await page.locator("meta[name=robots]").getAttribute("content")).toContain("noindex");
    await page.screenshot({ path: path.join(OUT, "1-ready.png") });

    await page.click('[data-testid="reveal"]', { force: true }); // the button gently pulses, so it is never "stable"
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "2-countdown.png") });
    await page.waitForSelector('[data-stage="roll"]');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "3-rolling.png") });
    await page.waitForSelector('[data-stage="landed"]', { timeout: 10000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, "4-winner.png") });
    const first = await page.locator(".ld-msg").innerText();
    expect(first).toContain("Natalie B.");
    expect(await page.locator(".sr").innerText()).toBe("Ticket 4271");
    expect(first).toMatch(/winning ticket 1 of 2/i);

    await page.getByRole("button", { name: "Next Winner" }).click({ force: true });
    await page.click('[data-testid="reveal"]', { force: true }); // the button gently pulses, so it is never "stable"
    await page.waitForSelector('[data-stage="landed"]', { timeout: 10000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, "5-second.png") });
    expect(await page.locator(".ld-msg").innerText()).toContain("Postal entrant");
    expect(await page.locator(".ld-list").innerText()).toMatch(/#4271[\s\S]*Natalie B\.[\s\S]*#128[\s\S]*Postal entrant/);
    expect(await page.locator('[data-testid="reveal"]').count()).toBe(0);
    expect(errs).toEqual([]);
    await page.close();
  }, 60000);

  it("holds a result from the public, and the presenter reveals then publishes it", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/media/")) errs.push(m.text()); });
    page.on("pageerror", (e) => errs.push(e.message));
    // A viewer without the key: still "drawing".
    await page.goto(`${site.origin}/live-draw/250-tax-free-cash`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="live-draw"]').getAttribute("data-phase")).resolves.toBe("waiting");
    expect(await page.locator('[data-testid="reveal"]').count()).toBe(0);
    expect(await page.content()).not.toContain("Sam P.");
    // The presenter (opened from the admin): sees it, and the key leaves the address bar.
    await page.goto(`${site.origin}/live-draw/250-tax-free-cash?key=test-key`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="live-draw"]').getAttribute("data-phase")).resolves.toBe("drawn");
    expect(new URL(page.url()).search).toBe("");
    expect(await page.locator(".ld-pres").innerText()).toMatch(/presenter/i);
    expect(await page.locator('[data-testid="publish"]').count()).toBe(0); // only after the reveal
    await page.click('[data-testid="reveal"]', { force: true });
    await page.waitForSelector('[data-stage="landed"]', { timeout: 10000 });
    expect(await page.locator(".ld-msg").innerText()).toContain("Sam P.");
    await page.click('[data-testid="publish"]', { force: true });
    expect(await page.locator('[data-testid="publish"]').innerText()).toMatch(/tap again/i); // a second press confirms
    await page.screenshot({ path: path.join(OUT, "7-publish-confirm.png") });
    await page.click('[data-testid="publish"]', { force: true });
    await page.waitForSelector('[data-testid="published"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "8-published.png") });
    // Now a viewer without the key sees it too.
    const viewer = await browser.newPage();
    await viewer.goto(`${site.origin}/live-draw/250-tax-free-cash`, { waitUntil: "networkidle" });
    await expect(viewer.locator('[data-testid="live-draw"]').getAttribute("data-phase")).resolves.toBe("drawn");
    await viewer.close();
    expect(errs).toEqual([]);
    await page.close();
  }, 60000);

  it("counts down before the close, on a phone too, and 404s for an instant game", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${site.origin}/live-draw/lush-snow-fairy-wonderland`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="live-draw"]').getAttribute("data-phase")).resolves.toBe("open");
    expect(await page.locator('[role="timer"]').count()).toBe(1);
    expect(await page.locator('[data-testid="reveal"]').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(OUT, "6-phone-countdown.png"), fullPage: true });
    const res = await page.goto(`${site.origin}/live-draw/bush-bucks-jungle-trial`);
    expect(res?.status()).toBe(404);
    await page.close();
  }, 60000);
});
