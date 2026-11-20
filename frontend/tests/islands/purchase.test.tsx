// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TicketPicker, { type PickerProps } from "../../src/islands/TicketPicker";
import CheckoutView from "../../src/islands/CheckoutView";
import { readBasket } from "../../src/lib/basket";
import type { PricedBasket } from "../../src/lib/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const base: PickerProps = { competitionId: "c1", slug: "c1", type: "instant", pricePence: 25, presets: [5, 10, 25, 50], soldPercent: 0, soldOut: false, open: true, salesOpen: true, signedIn: true, playBlock: null };
const qty = () => screen.getByTestId("qty").textContent;
const total = () => screen.getByTestId("total").textContent;

describe("ticket picker", () => {
  it("starts on the Most popular button, marks it, and keeps to the competition's minimum", () => {
    render(<TicketPicker {...base} pricePence={1} presets={[500, 1000, 2000, 3000]} popularPreset={1000} minTickets={100} />);
    expect(qty()).toBe("1000");
    expect(total()).toBe("£10.00");
    expect(screen.getAllByTestId("most-popular")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Most popular/ }).textContent).toContain("1,000");
    const input = screen.getByLabelText("Or choose your own amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "150" } });
    expect(total()).toBe("£1.50");
    fireEvent.change(input, { target: { value: "20" } });
    expect(total()).toBe("£1.50"); // under the minimum: not taken
    for (let i = 0; i < 60; i++) fireEvent.click(screen.getByLabelText("One fewer ticket"));
    expect(total()).toBe("£1.00");
    expect((screen.getByLabelText("One fewer ticket") as HTMLButtonElement).disabled).toBe(true);
  });
  it("starts on the second preset and keeps the total in step", () => {
    render(<TicketPicker {...base} />);
    expect(qty()).toBe("10");
    expect(total()).toBe("£2.50");
    fireEvent.click(screen.getByLabelText("One more ticket"));
    expect(qty()).toBe("11");
    expect(total()).toBe("£2.75");
    fireEvent.click(screen.getByRole("button", { name: /^50/ }));
    expect(total()).toBe("£12.50");
  });
  it("never shows how many tickets are left, and never goes below one", () => {
    render(<TicketPicker {...base} />);
    const input = screen.getByLabelText("Or choose your own amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    expect(qty()).toBe("500"); // the server decides what's available; the picker shows no count
    fireEvent.change(input, { target: { value: "0" } });
    expect(qty()).toBe("500"); // ignored while typing
    expect(screen.queryByLabelText("Number of tickets")).toBeNull();
    expect(document.body.textContent).not.toMatch(/left|limit/i);
  });
  it("sends a signed-out visitor to join first, then straight to checkout", () => {
    render(<TicketPicker {...base} signedIn={false} />);
    const href = screen.getByTestId("buy-now").getAttribute("href")!;
    expect(href).toBe("/join?next=" + encodeURIComponent("/checkout?buy=" + encodeURIComponent("c1:10")));
  });
  it("the phone's sticky buy bar steps aside while the picker's own buttons are on screen", async () => {
    let fire: (on: boolean) => void = () => {};
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: { isIntersecting: boolean }[]) => void) { fire = (on) => cb([{ isIntersecting: on }]); } observe() {} disconnect() {} });
    render(<TicketPicker {...base} />);
    const bar = screen.getByTestId("buy-bar");
    expect(bar.className).not.toContain("buybar-away");
    act(() => fire(true));
    expect(bar.className).toContain("buybar-away");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    act(() => fire(false));
    expect(bar.className).not.toContain("buybar-away");
    vi.unstubAllGlobals();
  });

  it("adds to the basket", () => {
    render(<TicketPicker {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Add To Basket" }));
    expect(readBasket()).toEqual([{ competitionId: "c1", quantity: 10 }]);
    expect(screen.getByText(/Added 10 tickets/)).toBeTruthy();
  });
  it.each([
    [{ salesOpen: false }, "Entries open soon."],
    [{ open: false }, "This competition isn't open for entries."],
    [{ soldOut: true }, "Sold out."],
    [{ playBlock: "self_excluded" }, "Your account is self-excluded, so you can't enter right now."],
    [{ playBlock: "staff" }, "Staff accounts can't enter competitions."],
  ])("shows why a player can't buy (%o) and offers no buy button", (over, msg) => {
    render(<TicketPicker {...base} {...(over as Partial<PickerProps>)} />);
    expect(screen.getByText(msg)).toBeTruthy();
    expect(screen.queryByTestId("buy-now")).toBeNull();
    expect(screen.queryByTestId("buy-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add To Basket" })).toBeNull();
  });
});

describe("bundles", () => {
  const bundles = [
    { id: 1, label: "Buy 5 Get 5 Free", paid: 5, free: 5, tickets: 10, pricePence: 295, savePence: 295, ourPick: false },
    { id: 2, label: "Buy 10 Get 15 Free", paid: 10, free: 15, tickets: 25, pricePence: 590, savePence: 885, ourPick: true },
    { id: 3, label: "Buy 20 Get 40 Free", paid: 20, free: 40, tickets: 60, pricePence: 1180, savePence: 2360, ourPick: false },
  ];
  const draw: PickerProps = { ...base, type: "draw", pricePence: 59, bundles };

  it("shows the bundles, preselects Our Pick, and prices from the server's figures", () => {
    render(<TicketPicker {...draw} />);
    expect(screen.getAllByTestId("bundle")).toHaveLength(3);
    expect(screen.getByText("Our Pick")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Buy 10 Get 15 FREE/ }).getAttribute("aria-checked")).toBe("true");
    expect(total()).toBe("£5.90");
    expect(screen.getByText("10 paid + 15 free = 25 tickets")).toBeTruthy();
    expect(screen.getByText("Save £8.85")).toBeTruthy();
    expect(screen.getByText("Bundle and free tickets are entered into the draw exactly like paid tickets.")).toBeTruthy();
    expect(screen.getByTestId("buy-bar").textContent).toContain("25 tickets · £5.90");
  });
  it("offers one nudge to the next bundle up, and tapping it switches", () => {
    render(<TicketPicker {...draw} />);
    expect(screen.getAllByTestId("nudge")).toHaveLength(1);
    expect(screen.getByTestId("nudge").textContent).toBe("Add 10 more paid tickets (£5.90) and get 40 FREE");
    fireEvent.click(screen.getByTestId("nudge"));
    expect(total()).toBe("£11.80");
    expect(screen.queryByTestId("nudge")).toBeNull(); // nothing bigger
  });
  it("singles: the nudge suggests the smallest bundle that gives more", () => {
    render(<TicketPicker {...draw} />);
    fireEvent.click(screen.getByLabelText("One more ticket")); // switch to singles
    fireEvent.click(screen.getByLabelText("One more ticket"));
    fireEvent.click(screen.getByLabelText("One more ticket"));
    expect(qty()).toBe("3");
    expect(screen.getByTestId("nudge").textContent).toBe("Add 2 more paid tickets (£1.18) and get 5 FREE");
  });
  it("buys and adds bundles by id only", () => {
    render(<TicketPicker {...draw} />);
    expect(screen.getByTestId("buy-now").getAttribute("href")).toBe("/checkout?buy=" + encodeURIComponent("c1:b2"));
    fireEvent.click(screen.getByRole("button", { name: "Add To Basket" }));
    expect(readBasket()).toEqual([{ competitionId: "c1", quantity: 0, bundleId: 2 }]);
  });
});

function priced(totalPence: number, walletCovers: boolean, extra: Partial<PricedBasket> = {}): PricedBasket {
  return { lines: [{ competitionId: "c1", title: "Cash Bang", image: "/x.webp", type: "instant", quantity: totalPence / 25, unitPence: 25, linePence: totalPence, problem: null }], subtotalPence: totalPence, discountPence: 0, totalPence, walletCovers, problems: [], promo: null, ...extra } as PricedBasket;
}

function stubApi(price: PricedBasket, onCheckout?: (body: any) => unknown) {
  const calls: { url: string; body: any }[] = [];
  document.cookie = "XSRF-TOKEN=tok";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url.includes("csrf-cookie")) return new Response(null, { status: 204 });
    if (url.endsWith("/api/basket/price")) return Response.json(price);
    if (url.endsWith("/api/checkout")) return Response.json(onCheckout?.(body) ?? { order: { number: "GG-9" }, next: "play" });
    return new Response("{}", { status: 404 });
  }));
  return calls;
}

describe("checkout", () => {
  beforeEach(() => { vi.stubGlobal("location", { ...window.location, assign: vi.fn() }); });

  it("pays from the wallet when it covers the order", async () => {
    const calls = stubApi(priced(250, true));
    render(<CheckoutView buy="c1:10" walletPence={1250} minCardPence={100} />);
    const btn = await screen.findByTestId("pay");
    expect(btn.textContent).toBe("Pay £2.50 From Wallet");
    fireEvent.click(btn);
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/order/GG-9"));
    const co = calls.find((c) => c.url.endsWith("/api/checkout"))!.body;
    expect(co).toMatchObject({ lines: [{ competitionId: "c1", quantity: 10 }], payWith: "wallet", useWallet: true });
    expect(typeof co.requestId).toBe("string");
  });

  it("choosing the card when the wallet could pay it all pays by card, never 'Pay £0.00 By Card'", async () => {
    const calls = stubApi(priced(100, true), () => ({ order: { number: "GG-11" }, next: "redirect", redirectUrl: "https://gateway-int.cashflows.com/y" }));
    render(<CheckoutView buy="c1:10" walletPence={3005} minCardPence={100} />);
    await screen.findByTestId("pay");
    fireEvent.click(screen.getByText("Debit Or Credit Card"));
    const btn = screen.getByTestId("pay");
    expect(btn.textContent).toBe("Pay £1.00 By Card");
    expect(screen.queryByRole("checkbox")).toBeNull(); // no "use my wallet first" when it isn't a split
    fireEvent.click(btn);
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("https://gateway-int.cashflows.com/y"));
    expect(calls.find((c) => c.url.endsWith("/api/checkout"))!.body).toMatchObject({ payWith: "card", useWallet: false });
    // A "buy now" keeps its tickets aside too, so a failed card can put them in the basket.
    expect(localStorage.getItem("gg-basket-v1:aside:GG-11")).toContain('"add"');
  });

  it("splits wallet and card, and refuses a card part under the minimum", async () => {
    stubApi(priced(1300, false));
    render(<CheckoutView buy="c1:52" walletPence={1250} minCardPence={100} />);
    const btn = await screen.findByTestId("pay");
    expect(btn.textContent).toBe("Pay £0.50 By Card");
    expect(screen.getByRole("alert").textContent).toMatch(/Card payments start at £1.00/);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn.textContent).toBe("Pay £13.00 By Card");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("puts the basket aside before leaving for the card page", async () => {
    localStorage.setItem("gg-basket-v1", JSON.stringify([{ competitionId: "c1", quantity: 40 }]));
    stubApi(priced(1000, false), () => ({ order: { number: "GG-10" }, next: "redirect", redirectUrl: "https://gateway-int.cashflows.com/x" }));
    render(<CheckoutView buy={null} walletPence={0} minCardPence={100} />);
    fireEvent.click(await screen.findByTestId("pay"));
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("https://gateway-int.cashflows.com/x"));
    expect(localStorage.getItem("gg-basket-v1:aside:GG-10")).toContain("c1");
  });

  it("won't pay while the server reports a problem with a line", async () => {
    stubApi(priced(250, true, { lines: [{ competitionId: "c1", title: "X", image: "", type: "instant", quantity: 10, unitPence: 25, linePence: 250, problem: "Sold out" }] as any }));
    render(<CheckoutView buy="c1:10" walletPence={1250} minCardPence={100} />);
    expect(((await screen.findByTestId("pay")) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Sold out")).toBeTruthy();
  });

  it("ignores a malformed buy link and falls back to the basket", async () => {
    stubApi(priced(250, true));
    render(<CheckoutView buy="../../etc:1" walletPence={0} minCardPence={100} />);
    expect(await screen.findByText("Nothing To Pay For")).toBeTruthy();
  });
});
