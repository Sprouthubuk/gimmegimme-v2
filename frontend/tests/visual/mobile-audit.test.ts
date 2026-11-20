import { it, expect } from "vitest";

// Crawls every page a visitor can reach on a phone (390px, then 320px) and the member pages signed in,
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

async function audit(ctx: BrowserContext, base: string, path: string, width: number, who: string) {
  const p = await ctx.newPage();
  const add = (kind: string, detail: string) => findings.push({ page: path, width, who, kind, detail });
  p.on("console", (m) => { if (m.type() === "error") add("console", m.text().slice(0, 200)); });
  p.on("pageerror", (e) => add("pageerror", e.message.slice(0, 200)));
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !u.includes("/api/me") ) add(`http${r.status()}`, `${r.request().method()} ${u.replace(base, "")}`); });
  p.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) add("reqfail", `${r.url().replace(base, "")} ${r.failure()?.errorText}`); });
  const t = Date.now();
  const res = await p.goto(base + path, { waitUntil: "networkidle" }).catch((e) => { add("goto", String(e).slice(0, 200)); return null; });
  const ms = Date.now() - t;
  if (res && res.status() >= 400 && path !== "/this-page-does-not-exist") add(`status${res.status()}`, path);
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) {
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.right > de.clientWidth + 1 && b.width > 0 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().slice(0, 40)}`);
      out.push({ kind: "sideways-scroll", detail: `${de.scrollWidth}>${de.clientWidth} ${wide.join(" | ")}` });
    }
    const visible = (e: Element) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !e.closest("[aria-hidden=true]"); };
    const label = (e: Element) => (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.getAttribute("href") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    // Tap targets: buttons and standalone links (not links inside running text).
    for (const e of document.querySelectorAll("button, a[href], [role=button], select, summary")) {
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
  });
  for (const f of r.out) add(f.kind, f.detail);
  perf.push({ page: path, who, ms, kb: r.kb, jsKb: r.jsKb, imgKb: r.imgKb, requests: r.requests });
  await p.close();
  return r.links;
}

it("every page works and fits a phone", async () => {
  const site = await startSite("laravel", { features: true });
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  try {
    const seen = new Set<string>();
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
    // Narrowest phones.
    const tiny = await b.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    for (const u of [...seen].slice(0, 60)) await audit(tiny, site.origin, u, 320, "visitor");
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
    fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(perf, null, 1));
    fs.writeFileSync(`${OUT}/pages.txt`, [...seen].join("\n"));
    expect(seen.size, "pages crawled").toBeGreaterThan(40);
    // The 404 page answers 404 on purpose; an unknown order on the payment pages is refused on purpose.
    const expected = (f: Finding) => (f.page === "/this-page-does-not-exist" && /404/.test(f.kind + f.detail)) || (f.page.includes("GG-NOPE") && /40[34]/.test(f.kind + f.detail));
    const left = findings.filter((f) => !expected(f)).map((f) => `${f.who} ${f.width}px ${f.page}: ${f.kind} ${f.detail}`);
    expect([...new Set(left)]).toEqual([]);
    for (const x of perf) expect(x.kb, `${x.page} weight (kB)`).toBeLessThan(600);
  } finally {
    await b.close();
    await site.stop();
  }
}, 900000);
