// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Meta Pixel loads only after "Accept", only with a real Pixel ID, and Purchase counts once per order. */
describe("marketing cookies and the Meta Pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.cookie.split("; ").forEach((c) => (document.cookie = `${c.split("=")[0]}=; Max-Age=0; Path=/`));
    delete window.fbq;
    delete window._fbq;
  });
  const metaScripts = () => [...document.querySelectorAll("script")].filter((s) => s.src.includes("facebook"));

  it("loads nothing before a choice, or after Reject", async () => {
    const c = await import("../../src/lib/consent");
    c.startPixel("123456789012345");
    expect(metaScripts()).toHaveLength(0);
    c.saveConsent("rejected");
    c.startPixel("123456789012345");
    expect(metaScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  });

  it("loads once after Accept, never with a made-up ID", async () => {
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    c.startPixel("not-an-id");
    expect(metaScripts()).toHaveLength(0);
    c.startPixel("123456789012345");
    c.startPixel("123456789012345");
    expect(metaScripts()).toHaveLength(1);
    expect(window.fbq!.queue.map((q) => q[0])).toEqual(["init", "track"]);
  });

  it("counts a purchase once per order", async () => {
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    c.startPixel("123456789012345");
    c.trackPurchaseOnce("GG-ABCD1234", 250);
    c.trackPurchaseOnce("GG-ABCD1234", 250);
    const purchases = window.fbq!.queue.filter((q) => q[1] === "Purchase");
    expect(purchases).toHaveLength(1);
    // order_id is the same order number the server's Conversions API sends (27 Nov 2026).
    expect(purchases[0][2]).toEqual({ value: 2.5, currency: "GBP", content_type: "product", order_id: "GG-ABCD1234" });
    // The order number is the event id the server also uses, so Meta counts the sale once.
    expect(purchases[0][3]).toEqual({ eventID: "GG-ABCD1234" });
  });

  it("sends the contents of a purchase and never a sale worth nothing", async () => {
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    c.startPixel("123456789012345");
    c.trackPurchaseOnce("GG-FREE0001", 0);
    c.trackPurchaseOnce("GG-ABCD9999", 1050, [{ slug: "cash-bang", quantity: 10 }, { slug: "cash-bang", quantity: 5 }, { slug: "lush", quantity: 2 }]);
    const purchases = window.fbq!.queue.filter((q) => q[1] === "Purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0][2]).toMatchObject({ value: 10.5, content_ids: ["cash-bang", "lush"], num_items: 17, order_id: "GG-ABCD9999" });
    expect(purchases[0][3]).toEqual({ eventID: "GG-ABCD9999" });
  });

  it("tells the server about the choice with a cookie, and Reject removes Meta's cookies", async () => {
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    expect(document.cookie).toContain("gg_consent=accepted");
    document.cookie = "_fbp=fb.1.1763700000000.1234567890; Path=/";
    document.cookie = "_fbc=fb.1.1763700000000.IwAR0abcdefghijklmnop; Path=/";
    c.saveConsent("rejected");
    expect(document.cookie).toContain("gg_consent=rejected");
    expect(document.cookie).not.toContain("_fbp");
    expect(document.cookie).not.toContain("_fbc");
  });

  it("gives a visitor who chose before the cookie existed the cookie on their next page", async () => {
    localStorage.setItem("gg-cookie-consent", JSON.stringify({ choice: "accepted", at: "2026-11-01T00:00:00Z", version: 1 }));
    const c = await import("../../src/lib/consent");
    c.syncConsentCookie();
    expect(document.cookie).toContain("gg_consent=accepted");
  });

  it("matches a signed-in player with hashes only, the same external id as the server", async () => {
    const em = "a".repeat(64);
    const xid = "b".repeat(64);
    document.body.innerHTML = `<div id="cookie-banner" data-pixel="123456789012345" data-em="${em}" data-xid="${xid}"></div>`;
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    c.startPixel("123456789012345");
    expect(window.fbq!.queue[0]).toEqual(["init", "123456789012345", { em, external_id: xid }]);
  });

  it("sends add to cart, checkout with its value, a top up and a sign-up with the server's id", async () => {
    const c = await import("../../src/lib/consent");
    c.saveConsent("accepted");
    c.startPixel("123456789012345");
    c.trackAddToCart("cash-bang", 10, 250);
    c.trackInitiateCheckout(250, [{ slug: "cash-bang", quantity: 10 }]);
    c.trackInitiateCheckout(250, [{ slug: "cash-bang", quantity: 10 }]);
    c.trackDepositOnce("GD-ABCD1234", 1000);
    c.trackDepositOnce("GD-ABCD1234", 1000);
    c.track("CompleteRegistration", {}, "reg-42");
    const q = window.fbq!.queue;
    expect(q.find((x) => x[1] === "AddToCart")![2]).toMatchObject({ value: 2.5, content_ids: ["cash-bang"] });
    expect(q.filter((x) => x[1] === "InitiateCheckout")).toHaveLength(1);
    expect(q.filter((x) => x[1] === "Deposit")).toEqual([["trackCustom", "Deposit", { value: 10, currency: "GBP" }, { eventID: "GD-ABCD1234" }]]);
    expect(q.find((x) => x[1] === "CompleteRegistration")![3]).toEqual({ eventID: "reg-42" });
  });

  it("sends nothing at all without consent", async () => {
    document.body.innerHTML = `<div id="cookie-banner" data-pixel="123456789012345"></div>`;
    const c = await import("../../src/lib/consent");
    c.trackAddToCart("cash-bang", 10, 250);
    c.trackPurchaseOnce("GG-ABCD1234", 250);
    c.trackDepositOnce("GD-ABCD1234", 1000);
    expect(window.fbq).toBeUndefined();
    expect(metaScripts()).toHaveLength(0);
  });
});
