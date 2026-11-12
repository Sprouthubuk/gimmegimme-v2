import type { Pence, RevealPrize } from "./contract";

function assertPence(p: Pence): void {
  if (!Number.isSafeInteger(p)) throw new TypeError(`Expected integer pence, got ${p}`);
}

/** 666 → "£6.66", 1000 → "£10", 125000 → "£1,250". Whole pounds drop the ".00". */
export function formatPence(p: Pence): string {
  assertPence(p);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100).toLocaleString("en-GB");
  const pennies = abs % 100;
  return pennies === 0 ? `${sign}£${pounds}` : `${sign}£${pounds}.${String(pennies).padStart(2, "0")}`;
}

/** Always two decimals, for balances: 1250 → "£12.50", 2000 → "£20.00". */
export function formatBalance(p: Pence): string {
  assertPence(p);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  return `${sign}£${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Site rule: every prize with a cash value ("site_credit" or "cash") is paid into
 * the winnings balance by the server. Only "physical" prizes are sent out by hand.
 */
export const isCredited = (prize: RevealPrize): boolean => prize.type !== "physical";

/** Short label that fits on a coin, tile or wheel segment. */
export function prizeShortLabel(prize: RevealPrize): string {
  return prize.type === "physical" ? prize.name : formatPence(prize.valuePence);
}

/** Headline for the result sheet: "£10 credit", "£50 cash", "AirPods Pro". */
export function prizeHeadline(prize: RevealPrize): string {
  if (prize.type === "site_credit") return `${formatPence(prize.valuePence)} credit`;
  if (prize.type === "cash") return `${formatPence(prize.valuePence)} cash`;
  return prize.name;
}

/** Same format as the rest of the site (reveal-utils.ts). */
export function formatTicketNumber(n: number): string {
  return `#${n}`;
}
