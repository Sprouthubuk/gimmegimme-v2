import type { ComponentType, LazyExoticComponent } from "react";

/**
 * Instant win reveal contract.
 *
 * The outcome is decided and credited on the server BEFORE a reveal renders.
 * Reveal games are presentation only: they receive a finished outcome, play it
 * back, and report when the player is done. They must never decide, influence
 * or appear to influence a result, and they only ever see the tickets in this
 * purchase, so they cannot leak winning numbers for unclaimed prizes.
 */

/** All money is integer pence (GBP). £6.66 === 666. Avoids floating point drift. */
export type Pence = number;

/**
 * "site_credit" and "cash" are paid into the player's winnings balance
 * instantly by the server. Only "physical" needs manual fulfilment
 * (delivery) and is not counted in RevealOutcome.creditedPence.
 */
export type PrizeType = "cash" | "site_credit" | "physical";

export interface RevealPrize {
  /** Display name, e.g. "£6.66 Site Credit" or "£2,000 Cash". */
  name: string;
  valuePence: Pence;
  type: PrizeType;
}

export interface RevealTicket {
  ticketNumber: number;
  /** Which competition this ticket is in — a purchase can span several. */
  competitionId: string;
  competitionTitle: string;
  /** The prize this ticket won, or null if it did not win. */
  prize: RevealPrize | null;
}

export type WinningTicket = RevealTicket & { prize: RevealPrize };

export interface RevealOutcome {
  /** Server id for the purchase. Use it as the React `key` on the reveal. */
  purchaseId: string;
  /** Every ticket in this purchase, and only this purchase. */
  tickets: readonly RevealTicket[];
  /** Total value won across all tickets, as calculated by the server. */
  totalWonPence: Pence;
  /** Amount already credited to the player's balance. Sums every prize except "physical" ones, which are sent out by hand. */
  creditedPence: Pence;
  /** Balance after crediting. Optional: if present, the reveal shows it landing. */
  balanceAfterPence?: Pence;
}

export interface RevealGameProps {
  outcome: RevealOutcome;
  /** Player has finished with the reveal (pressed "Back to competitions"). */
  onComplete: () => void;
  /** Optional: fires once when the final result is on screen (after animation or skip). */
  onResultShown?: () => void;
  /**
   * Optional override. When omitted, games follow the OS `prefers-reduced-motion`
   * setting. Pass `true` to force a static reveal (e.g. from a site setting).
   */
  reducedMotion?: boolean;
}

export type RevealGame =
  | ComponentType<RevealGameProps>
  | LazyExoticComponent<ComponentType<RevealGameProps>>;

/** Game id -> component. "classic" is required as the fallback. */
export type RevealGameRegistry = { readonly classic: RevealGame } & {
  readonly [gameId: string]: RevealGame;
};
