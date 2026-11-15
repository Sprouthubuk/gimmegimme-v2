// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Meta Pixel loads only after "Accept", only with a real Pixel ID, and Purchase counts once per order. */
describe("marketing cookies and the Meta Pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
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
    expect(purchases[0][2]).toEqual({ value: 2.5, currency: "GBP" });
  });
});
