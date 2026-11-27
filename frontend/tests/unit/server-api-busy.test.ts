// 26 Nov 2026: busy evenings gave players nginx's white "504 Gateway Time-out". A page waiting on a slow API
// now gives up after 10s and shows the site's own busy page; nginx's HTML in place of JSON is a busy answer,
// not a crash; and signed-out page views no longer start a Laravel session for every visit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure, BUSY, isBusy, serverApi } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

const capture = (reply: () => Response | Promise<Response>) => {
  const calls: RequestInit[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { calls.push(init); return reply(); }));
  return calls;
};
const headers = (init: RequestInit) => init.headers as Record<string, string>;

describe("serverApi when the site is busy", () => {
  it("treats nginx's HTML error page as busy, not a crash", async () => {
    capture(() => new Response("<html><body><h1>504 Gateway Time-out</h1></body></html>", { status: 504, headers: { "Content-Type": "text/html" } }));
    const err = (await serverApi(new Request("https://example.test/")).get("/api/competitions").catch((e: unknown) => e)) as ApiFailure;
    expect(err).toBeInstanceOf(ApiFailure);
    expect(err.status).toBe(504);
    expect(err.body?.message).toBe(BUSY);
    expect(isBusy(err)).toBe(true);
  });

  it("gives up instead of waiting forever when the API doesn't answer", async () => {
    capture(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    const err = (await serverApi(new Request("https://example.test/")).get("/api/site").catch((e: unknown) => e)) as ApiFailure;
    expect(err.status).toBe(503);
    expect(isBusy(err)).toBe(true);
  });

  it("passes on every call a time limit", async () => {
    const calls = capture(() => new Response("{}"));
    await serverApi(new Request("https://example.test/")).get("/api/site");
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("a 404 or a refusal is still an ordinary answer, not busy", async () => {
    capture(() => new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
    const api = serverApi(new Request("https://example.test/"));
    expect(await api.maybe("/api/competitions/nope")).toBeNull();
    const err = (await api.get("/api/competitions/nope").catch((e: unknown) => e)) as ApiFailure;
    expect(isBusy(err)).toBe(false);
  });
});

describe("serverApi sessions", () => {
  it("a signed-out page view reads without asking Laravel for a session", async () => {
    const calls = capture(() => new Response("{}"));
    await serverApi(new Request("https://example.test/", { headers: { cookie: "gg_consent=accepted" } })).get("/api/competitions");
    expect(headers(calls[0]).Origin).toBeUndefined();
    expect(headers(calls[0]).Referer).toBeUndefined();
  });

  it("a visitor with a session, and every write, still go as the site", async () => {
    const calls = capture(() => new Response("{}"));
    await serverApi(new Request("https://example.test/", { headers: { cookie: "gimme_session=abc" } })).get("/api/me");
    await serverApi(new Request("https://example.test/")).post("/api/orders/GG-1/return");
    for (const c of calls) {
      expect(headers(c).Origin).toBeTruthy();
      expect(headers(c).Referer).toBeTruthy();
    }
  });
});
