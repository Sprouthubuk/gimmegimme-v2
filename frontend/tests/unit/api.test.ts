// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiFailure, errorText } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("browser api", () => {
  it("fetches a fresh security token and retries a write once after a 419", async () => {
    let posts = 0;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("csrf-cookie")) { document.cookie = `XSRF-TOKEN=t${calls.length}`; return new Response(null, { status: 204 }); }
      posts++;
      return posts === 1 ? Response.json({ message: "CSRF token mismatch." }, { status: 419 }) : Response.json({ ok: true });
    }));
    await expect(api("/api/me/break", { json: { days: 1 } })).resolves.toEqual({ ok: true });
    expect(calls.filter((c) => c.includes("csrf-cookie")).length).toBe(2);
    expect(posts).toBe(2);
  });
  it("gives up after one retry and explains", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("csrf-cookie") ? new Response(null, { status: 204 }) : Response.json({}, { status: 419 }))));
    const e = await api("/api/x", { json: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiFailure);
    expect(errorText(e)).toMatch(/session expired/);
  });
  it("shows Laravel's field message, and a plain message when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Bad", errors: { email: ["Enter an email."] } }, { status: 422 })));
    const e = await api("/api/x").catch((x) => x);
    expect(errorText(e, "email")).toBe("Enter an email.");
    expect(errorText(new TypeError("Failed to fetch"))).toMatch(/couldn't reach the server/);
  });
});
