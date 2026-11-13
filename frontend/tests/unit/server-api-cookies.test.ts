// Staging bug, 13 Nov 2026: nginx answered 502 "upstream sent too big header" because every API
// call during one page view added its own copy of Laravel's two cookies to the page's response,
// and a first-time visitor got a new Laravel session for every call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { latestSetCookies, parseCookieHeader, serverApi } from "../../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("serverApi cookies", () => {
  it("uses the session from the first call on every later call, and keeps one line per cookie", async () => {
    let n = 0;
    const sentCookies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        n++;
        sentCookies.push(String((init.headers as Record<string, string>).Cookie ?? ""));
        const headers = new Headers({ "Content-Type": "application/json" });
        headers.append("Set-Cookie", `XSRF-TOKEN=x${n}; path=/; secure; samesite=lax`);
        headers.append("Set-Cookie", `gimme_session=s${n}; path=/; secure; httponly; samesite=lax`);
        return new Response("{}", { status: 200, headers });
      }),
    );

    const setCookies: string[] = [];
    const api = serverApi(new Request("https://example.test/"), setCookies);
    await api.get("/api/site");
    await api.get("/api/competitions");
    await api.get("/api/winners");

    expect(sentCookies[0]).toBe("");
    expect(sentCookies[1]).toBe("XSRF-TOKEN=x1; gimme_session=s1");
    expect(sentCookies[2]).toBe("XSRF-TOKEN=x2; gimme_session=s2");

    const out = latestSetCookies(setCookies);
    expect(out).toHaveLength(2);
    expect(out).toContain("XSRF-TOKEN=x3; path=/; secure; samesite=lax");
    expect(out).toContain("gimme_session=s3; path=/; secure; httponly; samesite=lax");
  });

  it("keeps the visitor's other cookies and sends the newest XSRF token on a write", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        const headers = new Headers();
        if (calls.length === 1) headers.append("Set-Cookie", "XSRF-TOKEN=new%3D; path=/");
        return new Response("{}", { status: 200, headers });
      }),
    );
    const api = serverApi(new Request("https://example.test/", { headers: { cookie: "gg_consent=1; XSRF-TOKEN=old; gimme_session=abc" } }));
    await api.get("/api/me");
    await api.post("/api/basket", {});
    const h = calls[1].headers as Record<string, string>;
    expect(h.Cookie).toBe("gg_consent=1; XSRF-TOKEN=new%3D; gimme_session=abc");
    expect(h["X-XSRF-TOKEN"]).toBe("new=");
  });

  it("parses a cookie header", () => {
    expect([...parseCookieHeader("a=1; b=x=y;  c=")]).toEqual([["a", "1"], ["b", "x=y"], ["c", ""]]);
  });
});
