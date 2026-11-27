import { createHash, randomUUID as uuid } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, startSite, type Site } from "../e2e/harness";

/**
 * Meta tracking through the real stack: the cookie banner's choice reaches Laravel as the gg_consent cookie,
 * a sale is kept for the Conversions API only with consent, and a signed-in page gives the Pixel hashes only.
 */
let site: Site;
beforeAll(async () => { site = await startSite("laravel", { pixel: "977064968058757" }); }, 120000);
afterAll(async () => { await site?.stop(); });

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const rows = () => JSON.parse(site.artisan!(["tinker", "--execute", "echo json_encode(App\\Models\\MetaEvent::query()->orderBy('id')->get(['event_name','event_id','status','context']));"]).trim().split("\n").pop()!);

async function player(consent: boolean) {
  const b = new Browser(site.origin);
  if (consent) { b.jar.set("gg_consent", "accepted"); b.jar.set("_fbp", "fb.1.1763700000000.1234567890"); }
  expect((await b.api("/api/auth/login", { email: "player@example.com", password: "password123" })).status).toBe(200);
  return b;
}

describe("Meta tracking", () => {
  it("a signed-in page gives the Pixel the player's hashed email and id, never the email itself", async () => {
    const b = await player(false);
    const me = (await b.api("/api/me")).body;
    const { html } = await b.page("/competitions");
    const banner = html.match(/<div[^>]*id="cookie-banner"[^>]*>/)?.[0] ?? "";
    expect(banner).toContain(`data-pixel="977064968058757"`);
    expect(banner).toContain(`data-em="${sha(me.email.toLowerCase())}"`);
    expect(banner).toContain(`data-xid="${sha(String(me.id))}"`);
    expect(banner).not.toContain(me.email);
  });

  it("a sale is kept for Meta only when the visitor accepted cookies, with the same id the Pixel sends", async () => {
    const c = (await new Browser(site.origin).api("/api/competitions")).body.data.find((x: { type: string; isFree?: boolean }) => x.type === "draw" && !x.isFree);
    const buy = async (b: Browser) => {
      const r = await b.api("/api/checkout", { lines: [{ competitionId: c.id, quantity: 2 }], payWith: "wallet", useWallet: true, requestId: uuid() });
      expect(r.status).toBe(201);
      return r.body.order.number as string;
    };
    await buy(await player(false));
    expect(rows()).toEqual([]);

    const b = await player(true);
    const number = await buy(b);
    const kept = rows();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ event_name: "Purchase", event_id: number, status: "ready" });
    expect(kept[0].context.fbp).toBe("fb.1.1763700000000.1234567890");
    // Nothing is sent without the server token, and the order tells the Pixel the same real-money value.
    site.artisan!(["gimme:meta-events"]);
    expect(rows()[0].status).toBe("ready");
    const order = (await b.api(`/api/orders/${number}`)).body;
    expect(order.trackValuePence).toBe(order.totalPence);
  });
  it("the cookie banner is in the page from the start with two equal buttons, and goes once a choice is made", async () => {
    const fresh = await new Browser(site.origin).page("/competitions");
    const banner = fresh.html.match(/<div[^>]*id="cookie-banner"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(banner).not.toMatch(/<div[^>]*id="cookie-banner"[^>]*\shidden/);
    const buttons = [...banner.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-choice="(\w+)"[^>]*>([^<]*)</g)].map((m) => ({ cls: m[1], choice: m[2], text: m[3].trim() }));
    expect(buttons.map((b) => b.choice).sort()).toEqual(["accepted", "rejected"]);
    expect(new Set(buttons.map((b) => b.cls)).size).toBe(1); // same size and style: neither is picked for you
    expect(banner).not.toMatch(/checked/);

    for (const choice of ["accepted", "rejected"]) {
      const b = new Browser(site.origin);
      b.jar.set("gg_consent", choice);
      const { html } = await b.page("/competitions");
      expect(html).toMatch(/<div[^>]*id="cookie-banner"[^>]*\shidden/);
    }
  });

  it("a banner choice is counted as a daily total, with nothing set on the visitor's device", async () => {
    const r = await fetch(`${site.origin}/api/consent-choice`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Origin: site.origin, Referer: `${site.origin}/` }, body: JSON.stringify({ choice: "accepted" }) });
    expect(r.status).toBe(204);
    expect(r.headers.getSetCookie?.() ?? []).toEqual([]);
    const counts = JSON.parse(site.artisan!(["tinker", "--execute", "echo json_encode(App\\Support\\ConsentChoices::daily(1));"]).trim().split("\n").pop()!);
    expect(Object.values(counts)[0]).toEqual({ accepted: 1, rejected: 0 });
  });
});
