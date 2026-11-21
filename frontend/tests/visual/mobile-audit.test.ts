import { afterAll, beforeAll, it, expect } from "vitest";

// Crawls every page a visitor can reach on a phone (390px, then 320px, then tablets and a desktop) and the member pages signed in,
// and fails on page or console errors, broken requests, sideways scroll, taps under 40px, inputs under 16px
// or without a label, images with no size/alt or broken, and pages without exactly one h1.
// Writes what it found and page weights to $AUDIT_DIR (default /tmp/gg-audit).
const OUT = process.env.AUDIT_DIR ?? "/tmp/gg-audit";
import { chromium, type Page, type BrowserContext } from "playwright";
import fs from "node:fs";
import { startSite } from "../e2e/harness";

type Finding = { page: string; width: number; who: string; kind: string; detail: string };
const findings: Finding[] = [];
const perf: { page: string; who: string; ms: number; kb: number; jsKb: number; imgKb: number; requests: number }[] = [];

async function audit(ctx: BrowserContext, base: string, path: string, width: number, who: string, touch = true, until: "networkidle" | "load" = "networkidle") {
  const p = await ctx.newPage();
  const add = (kind: string, detail: string) => findings.push({ page: path, width, who, kind, detail });
  p.on("console", (m) => { if (m.type() === "error") add("console", m.text().slice(0, 200)); });
  p.on("pageerror", (e) => add("pageerror", e.message.slice(0, 200)));
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !u.includes("/api/me") ) add(`http${r.status()}`, `${r.request().method()} ${u.replace(base, "")}`); });
  p.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) add("reqfail", `${r.url().replace(base, "")} ${r.failure()?.errorText}`); });
  const t = Date.now();
  const res = await p.goto(base + path, { waitUntil: until }).catch((e) => { add("goto", String(e).slice(0, 200)); return null; });
  const ms = Date.now() - t;
  if (res && res.status() >= 400 && path !== "/this-page-does-not-exist") add(`status${res.status()}`, path);
  await p.waitForTimeout(until === "load" ? 900 : 400);
  const run = () => p.evaluate((touch) => {
    const out: { kind: string; detail: string }[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) {
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.right > de.clientWidth + 1 && b.width > 0 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().slice(0, 40)}`);
      out.push({ kind: "sideways-scroll", detail: `${de.scrollWidth}>${de.clientWidth} ${wide.join(" | ")}` });
    }
    const visible = (e: Element) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !e.closest("[aria-hidden=true]"); };
    const label = (e: Element) => (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.getAttribute("href") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    // Tap targets: buttons and standalone links (not links inside running text).
    for (const e of touch ? document.querySelectorAll("button, a[href], [role=button], select, summary") : []) {
      if (!visible(e) || e.classList.contains("skip")) continue;
      if (e.tagName === "A" && e.closest("p, li.txt, .hint, small, figcaption, td, .notice span, .legal") && !e.classList.contains("tap") && !e.classList.contains("btn")) continue;
      const b = e.getBoundingClientRect();
      if (b.height < 39.5 || b.width < 39.5) out.push({ kind: "small-tap", detail: `${Math.round(b.width)}x${Math.round(b.height)} "${label(e)}"` });
    }
    for (const e of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea")) {
      if (!visible(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 16) out.push({ kind: "input-under-16px", detail: `${fs}px ${e.getAttribute("aria-label") || e.id || e.getAttribute("name") || e.tagName}` });
      const id = e.id;
      const named = e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${id}"]`)) || e.closest("label");
      if (!named) out.push({ kind: "input-no-label", detail: `${e.tagName} ${e.getAttribute("placeholder") ?? ""}` });
    }
    for (const img of document.querySelectorAll("img")) {
      if (!img.getAttribute("width") && !img.getAttribute("height") && !img.style.width) out.push({ kind: "img-no-size", detail: (img.getAttribute("src") ?? "").slice(0, 60) });
      if (!img.hasAttribute("alt")) out.push({ kind: "img-no-alt", detail: (img.getAttribute("src") ?? "").slice(0, 60) });
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) out.push({ kind: "img-broken", detail: (img.getAttribute("src") ?? "").slice(0, 80) });
    }
    if (!document.querySelector("h1")) out.push({ kind: "no-h1", detail: document.title });
    if (document.querySelectorAll("h1").length > 1) out.push({ kind: "many-h1", detail: String(document.querySelectorAll("h1").length) });
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const kb = (xs: PerformanceResourceTiming[]) => Math.round(xs.reduce((s, x) => s + (x.transferSize || x.encodedBodySize || 0), 0) / 1024);
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).filter((h) => h.startsWith("/") && !h.startsWith("//"));
    return { out, links, kb: kb(res) + Math.round((nav?.transferSize ?? 0) / 1024), jsKb: kb(res.filter((x) => /\.m?js(\?|$)/.test(x.name))), imgKb: kb(res.filter((x) => x.initiatorType === "img" || /\.(webp|png|jpe?g|avif|svg)(\?|$)/.test(x.name))), requests: res.length };
  }, touch);
  let r: Awaited<ReturnType<typeof run>>;
  try {
    r = await run();
  } catch {
    // The page moved on by itself (a redirect after load): note where it went, then check that page.
    await p.waitForLoadState("networkidle").catch(() => {});
    add("navigated", `went to ${p.url().replace(base, "")}`);
    r = await run();
  }
  for (const f of r.out) add(f.kind, f.detail);
  perf.push({ page: path, who, ms, kb: r.kb, jsKb: r.jsKb, imgKb: r.imgKb, requests: r.requests });
  await p.close();
  return r.links;
}

// One site and browser for the three passes; each pass checks only what it found.
let site: Awaited<ReturnType<typeof startSite>>;
let b: Awaited<ReturnType<typeof chromium.launch>>;
const seen = new Set<string>();
// The 404 page answers 404 on purpose; an unknown order on the payment pages is refused on purpose.
const expected = (f: Finding) => (f.page === "/this-page-does-not-exist" && /404/.test(f.kind + f.detail)) || (f.page.includes("GG-NOPE") && /40[34]/.test(f.kind + f.detail));
const problems = (widths: number[]) => [...new Set(findings.filter((f) => widths.includes(f.width) && !expected(f)).map((f) => `${f.who} ${f.width}px ${f.page}: ${f.kind} ${f.detail}`))];

beforeAll(async () => {
  site = await startSite("laravel", { features: true });
  b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
}, 180000);
afterAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
  fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(perf, null, 1));
  fs.writeFileSync(`${OUT}/pages.txt`, [...seen].join("\n"));
  await b?.close();
  await site?.stop();
});

it("every page works and fits a phone", async () => {
  const queue = ["/", "/menu", "/this-page-does-not-exist", "/gimme-box", "/instant-winners", "/entry-lists", "/verify-email", "/forgot-password", "/reset-password?token=x&email=a@b.c", "/checkout", "/basket"];
  const skip = (u: string) => /^\/(api|admin|logout|sanctum|r\/)/.test(u) || /\.(xml|txt|png|webp|jpg|pdf)$/.test(u) || u.includes("#");
  const norm = (u: string) => u.split("#")[0];
  const anon = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  while (queue.length && seen.size < 120) {
    const u = norm(queue.shift()!);
    if (seen.has(u) || skip(u)) continue;
    seen.add(u);
    const links = await audit(anon, site.origin, u, 390, "visitor");
    for (const l of links) { const n = norm(l); if (!seen.has(n) && !skip(n)) queue.push(n); }
  }
  await anon.close();
  // Signed in.
  const member = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const lp = await member.newPage();
  await lp.goto(site.origin + "/login");
  await lp.waitForFunction(() => document.querySelectorAll("astro-island[ssr]").length === 0);
  await lp.fill('[data-testid="login-form"] input[type="email"]', "player@example.com");
  await lp.fill('[data-testid="login-form"] input[type="password"]', "password123");
  await lp.locator('[data-testid="login-form"] button[type="submit"]').click();
  await lp.waitForURL((u) => !u.pathname.startsWith("/login"));
  await lp.close();
  const mem = ["/account", "/account/tickets", "/account/wallet", "/account/settings", "/account/safer-play", "/account/refer", "/", "/competitions", "/competitions/lush-snow-fairy-wonderland", "/competitions/cash-bang", "/basket", "/checkout", "/gimme-box", "/payment/failed?order=GG-NOPE", "/payment/cancelled?order=GG-NOPE"];
  for (const u of mem) await audit(member, site.origin, u, 390, "player");
  await member.close();
  expect(seen.size, "pages crawled").toBeGreaterThan(40);
  expect(problems([390])).toEqual([]);
  for (const x of perf) expect(x.kb, `${x.page} weight (kB)`).toBeLessThan(600);
}, 900000);

it("the narrowest phones (320px) fit too", async () => {
  const tiny = await b.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  for (const u of [...seen].slice(0, 60)) await audit(tiny, site.origin, u, 320, "visitor");
  await tiny.close();
  expect(problems([320])).toEqual([]);
}, 600000);

it("tablets and desktops fit and work", async () => {
  // A fresh test server: PHP's built-in one (tests only) runs short of workers after a few hundred pages.
  await site.stop();
  site = await startSite("laravel", { features: true });
  // Tablets are touch screens (taps checked); a desktop uses a mouse.
  for (const [w, h, touch] of [[768, 1024, true], [1024, 1366, true], [1440, 900, false]] as const) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
    // Network errors were caught on phones; here it's about layout, so wait for the page and a moment more.
    for (const u of [...seen].slice(0, 30)) {
      // A page that never settles is a finding, not a hung test.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stuck = new Promise<void>((r) => { timer = setTimeout(() => { findings.push({ page: u, width: w, who: "visitor", kind: "stuck", detail: "no answer in 60s" }); r(); }, 60000); });
      await Promise.race([audit(ctx, site.origin, u, w, "visitor", touch, "load"), stuck]);
      clearTimeout(timer);
    }
    await ctx.close();
  }
  expect(problems([768, 1024, 1440])).toEqual([]);
}, 900000);
