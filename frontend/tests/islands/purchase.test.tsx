// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TicketPicker, { type PickerProps } from "../../src/islands/TicketPicker";
import CheckoutView from "../../src/islands/CheckoutView";
import { readBasket } from "../../src/lib/basket";
import type { PricedBasket } from "../../src/lib/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const base: PickerProps = { competitionId: "c1", slug: "c1", type: "instant", pricePence: 25, presets: [5, 10, 25, 50], maxPerPerson: 100, heldByMe: 0, ticketsLeft: 1000, open: true, salesOpen: true, signedIn: true, playBlock: null };
const qty = () => screen.getByTestId("qty").textContent;
const total = () => screen.getByTestId("total").textContent;

describe("ticket picker", () => {
  it("starts on the Most popular button, marks it, and keeps to the competition's minimum", () => {
    render(<TicketPicker {...base} pricePence={1} presets={[500, 1000, 2000, 3000]} popularPreset={1000} minTickets={100} maxPerPerson={1000000} />);
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
  it("when fewer than the minimum are left, the last ones can still be bought together", () => {
    render(<TicketPicker {...base} pricePence={1} minTickets={100} ticketsLeft={30} />);
    expect(qty()).toBe("30");
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
  it("never goes past what the player may still buy, or below one", () => {
    render(<TicketPicker {...base} maxPerPerson={30} heldByMe={18} />);
    const input = screen.getByLabelText("Or choose your own amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    expect(qty()).toBe("12");
    fireEvent.change(input, { target: { value: "0" } });
    expect(qty()).toBe("12"); // ignored while typing
    fireEvent.change(screen.getByLabelText("Number of tickets"), { target: { value: "1" } });
    expect(qty()).toBe("1");
    expect((screen.getByLabelText("One fewer ticket") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^25/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("caps at the tickets left", () => {
    render(<TicketPicker {...base} ticketsLeft={3} />);
    expect(qty()).toBe("3");
    expect((screen.getByLabelText("One more ticket") as HTMLButtonElement).disabled).toBe(true);
  });
  it("sends a signed-out visitor to join first, then straight to checkout", () => {
    render(<TicketPicker {...base} signedIn={false} />);
    const href = screen.getByRole("link", { name: /Buy & Play/ }).getAttribute("href")!;
    expect(href).toBe("/join?next=" + encodeURIComponent("/checkout?buy=" + encodeURIComponent("c1:10")));
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
    [{ ticketsLeft: 0 }, "Sold out."],
    [{ heldByMe: 100 }, "You've reached the 100 ticket limit for this competition."],
    [{ playBlock: "self_excluded" }, "Your account is self-excluded, so you can't enter right now."],
    [{ playBlock: "staff" }, "Staff accounts can't enter competitions."],
  ])("shows why a player can't buy (%o) and offers no buy button", (over, msg) => {
    render(<TicketPicker {...base} {...(over as Partial<PickerProps>)} />);
    expect(screen.getByText(msg)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Buy & Play/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add To Basket" })).toBeNull();
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
