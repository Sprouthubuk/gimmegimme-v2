// Runs the built site the way Forge will: Astro's Node server for pages, the API
// behind the same origin (here the mock API instead of Laravel), and a small
// front proxy standing in for nginx's routing rules in deploy/nginx.conf.
import http from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const API_ROUTES = /^\/(api|sanctum|media|mock-pay|webhooks|admin|livewire|storage|verity)(\/|$)|^\/(css|js|fonts)\/filament\/|^\/vendor\/verity\//;

export interface Site { origin: string; stop: () => Promise<void> }

async function free(): Promise<number> {
  return new Promise((r) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)); }); });
}

async function waitFor(url: string, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/**
 * backend "mock": the in-memory mock API. backend "laravel": the real Laravel app on PHP's built-in
 * server, with a fresh SQLite database seeded by DemoSeeder, the fake payment gateway and Verity's
 * local beacon.
 */
export async function startSite(backend: "mock" | "laravel" = "mock"): Promise<Site> {
  const [apiPort, astroPort, proxyPort] = [await free(), await free(), await free()];
  const origin = `http://127.0.0.1:${proxyPort}`;
  const env = { ...process.env, MOCK_API_PORT: String(apiPort), PUBLIC_SITE_URL: origin, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`, HOST: "127.0.0.1", PORT: String(astroPort) };
  let api: ChildProcess;
  let dbFile = "";
  if (backend === "laravel") {
    const be = path.resolve(ROOT, "../backend");
    dbFile = path.join(os.tmpdir(), `gg-fullstack-${process.pid}-${Date.now()}.sqlite`);
    fs.writeFileSync(dbFile, "");
    const lenv = {
      ...env, APP_ENV: "local", APP_DEBUG: "true", APP_URL: origin, FRONTEND_URL: origin, DB_CONNECTION: "sqlite", DB_DATABASE: dbFile,
      SESSION_DRIVER: "file", SESSION_COOKIE: "gimme_session", SESSION_DOMAIN: "", SANCTUM_STATEFUL_DOMAINS: `127.0.0.1:${proxyPort}`,
      CACHE_STORE: "file", QUEUE_CONNECTION: "sync", MAIL_MAILER: "log", CASHFLOWS_DRIVER: "fake", VERITY_BEACON: "local",
      VERITY_OWNER_PEPPER: "fullstack-test-pepper-0123456789", PHP_CLI_SERVER_WORKERS: "4", LOG_CHANNEL: "single",
      // Every request in a test comes from one IP; the limits themselves are covered by the PHP tests.
      API_RATE_PER_MINUTE: "100000", VERITY_ROUTES: "true",
      // Pages make side-by-side API calls; SQLite has one writer, so it waits briefly for it instead of failing.
      DB_BUSY_TIMEOUT: "5000",
    };
    const run = (args: string[]) => {
      const r = spawnSync("php", ["artisan", ...args], { cwd: be, env: lenv, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`php artisan ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
    };
    run(["migrate:fresh", "--seed", "--seeder=Database\\Seeders\\DemoSeeder", "--force"]);
    run(["storage:link", "--force"]);
    run(["vendor:publish", "--tag=verity-assets", "--force"]);
    // Laravel's own router script for PHP's built-in server; it expects to run from public/.
    api = spawn("php", ["-S", `127.0.0.1:${apiPort}`, "-t", ".", path.join(be, "vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php")], { cwd: path.join(be, "public"), env: lenv, stdio: "pipe" });
  } else {
    api = spawn(process.execPath, [path.join(ROOT, "mock-api/server.mjs")], { env, stdio: "pipe" });
  }
  const astro: ChildProcess = spawn(process.execPath, [path.join(ROOT, "dist/server/entry.mjs")], { env, stdio: "pipe" });
  let astroErr = "";
  astro.stderr?.on("data", (d) => { astroErr += d; });
  await waitFor(`http://127.0.0.1:${apiPort}/api/site`);
  await waitFor(`http://127.0.0.1:${astroPort}/`).catch((e) => { throw new Error(`${e.message}\n${astroErr}`); });

  const proxy = http.createServer((req, res) => {
    const port = API_ROUTES.test(req.url ?? "/") ? apiPort : astroPort;
    const up = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((r) => proxy.listen(proxyPort, "127.0.0.1", () => r()));
  return {
    origin,
    stop: async () => {
      api.kill(); astro.kill();
      if (dbFile) fs.rmSync(dbFile, { force: true });
      await new Promise<void>((r) => proxy.close(() => r()));
    },
  };
}

/** A tiny browser: keeps cookies, sends the XSRF header like the site's api() helper. */
export class Browser {
  jar = new Map<string, string>();
  constructor(public origin: string) {}
  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (/max-age=0/i.test(c) || value === "") this.jar.delete(name); else this.jar.set(name, value);
    }
  }
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async get(p: string, redirect: RequestRedirect = "manual") {
    const res = await fetch(this.origin + p, { headers: { Cookie: this.cookie(), Accept: "text/html" }, redirect });
    this.store(res);
    return res;
  }
  async page(p: string) {
    const res = await this.get(p);
    return { res, html: await res.text() };
  }
  async api<T = any>(p: string, json?: unknown, method?: string): Promise<{ status: number; body: T }> {
    // Like a real browser on the site: same-origin requests carry a Referer (Sanctum needs it for cookie sessions).
    const referer = this.origin + "/";
    if (!this.jar.has("XSRF-TOKEN")) this.store(await fetch(this.origin + "/sanctum/csrf-cookie", { headers: { Cookie: this.cookie(), Referer: referer } }));
    const res = await fetch(this.origin + p, {
      method: method ?? (json === undefined ? "GET" : "POST"),
      headers: { Cookie: this.cookie(), Referer: referer, Accept: "application/json", "Content-Type": "application/json", "X-XSRF-TOKEN": decodeURIComponent(this.jar.get("XSRF-TOKEN") ?? "") },
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect: "manual",
    });
    this.store(res);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

/**
 * Visible text of a page: no scripts, styles, tags or comments; spaces collapsed; &amp; decoded.
 * Inline tags (span, b, a…) add no space, as in a browser, so "Hi<span>Liam</span>" reads "HiLiam"
 * and a test catches the missing space. Block tags and React's <!-- --> markers count as breaks.
 */
const INLINE = /^<\/?(span|b|i|em|strong|a|small|code|sup|sub|mark|abbr|time|label)\b[^>]*>$/i;
export const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--\s*-->/g, "").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, (tag) => (INLINE.test(tag) ? "" : " ")).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
