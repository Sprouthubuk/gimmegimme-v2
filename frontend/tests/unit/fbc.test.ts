// 27 Nov 2026: Meta's click id (_fbc) set by the server, only for visitors who already accepted marketing cookies.
import { describe, expect, it } from "vitest";
import { cookieDomain, fbcCookie } from "../../src/lib/fbc";

const CLICK = "IwAR2xYzAbCdEfGhIjKlMnOp_qrStUv-1234567890";
const NOW = 1764260000123;
const url = (q: string) => new URL(`https://gimmegimmeprizes.co.uk/competitions/the-great-cash-escape?utm_source=facebook&${q}`);

describe("server-set _fbc", () => {
  it("accepted, with fbclid: sets fb.1.<ms>.<fbclid> for 90 days on the site's domain", () => {
    const c = fbcCookie(url(`fbclid=${CLICK}`), "gg_consent=accepted", NOW, "gimmegimmeprizes.co.uk")!;
    expect(c).toBe(`_fbc=fb.1.${NOW}.${CLICK}; Max-Age=7776000; Path=/; Domain=gimmegimmeprizes.co.uk; SameSite=Lax; Secure`);
  });

  it("not accepted, with fbclid: nothing set", () => {
    expect(fbcCookie(url(`fbclid=${CLICK}`), "", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url(`fbclid=${CLICK}`), "gg_consent=rejected", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url(`fbclid=${CLICK}`), "gimme_session=abc; _fbp=fb.1.1.2", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url(`fbclid=${CLICK}`), "gg_consent=acceptedx", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
  });

  it("no fbclid (or not a real one): nothing set", () => {
    expect(fbcCookie(url("utm_medium=paid"), "gg_consent=accepted", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url("fbclid="), "gg_consent=accepted", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url("fbclid=short"), "gg_consent=accepted", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    expect(fbcCookie(url("fbclid=bad%3Bvalue%3DXXXXXXXX"), "gg_consent=accepted", NOW, "gimmegimmeprizes.co.uk")).toBeNull();
  });

  it("an _fbc already holding this fbclid is kept; a different click replaces it", () => {
    const older = `fb.1.1764000000000.${CLICK}`;
    expect(fbcCookie(url(`fbclid=${CLICK}`), `gg_consent=accepted; _fbc=${older}`, NOW, "gimmegimmeprizes.co.uk")).toBeNull();
    const c = fbcCookie(url(`fbclid=${CLICK}NEW`), `gg_consent=accepted; _fbc=${older}`, NOW, "gimmegimmeprizes.co.uk");
    expect(c).toContain(`_fbc=fb.1.${NOW}.${CLICK}NEW;`);
  });

  it("domain: shared with the Pixel on the real site, none on localhost or an IP", () => {
    expect(cookieDomain("www.gimmegimmeprizes.co.uk")).toBe("gimmegimmeprizes.co.uk");
    expect(cookieDomain("localhost")).toBeNull();
    expect(cookieDomain("127.0.0.1")).toBeNull();
    const local = fbcCookie(new URL(`http://127.0.0.1:4321/?fbclid=${CLICK}`), "gg_consent=accepted", NOW, "127.0.0.1")!;
    expect(local).toBe(`_fbc=fb.1.${NOW}.${CLICK}; Max-Age=7776000; Path=/; SameSite=Lax`);
  });
});
