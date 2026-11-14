import type { GameTicket, PrizeTier } from "./types";

/**
 * Turns a site's reveal response into the game's ticket list. Kept separate from the games so another site
 * (a RaffleLabs client) only needs its own adapter. Order and outcomes are taken exactly as given.
 */

/** Gimme Gimme's `POST /api/orders/{number}/play` response (see docs/api.md). */
export interface RevealOutcomeLike {
  outcome: {
    tickets: readonly {
      readonly ticketNumber: number;
      readonly competitionId: string;
      readonly prize: { readonly name: string; readonly valuePence: number } | null;
      readonly proofUrl?: string | null;
    }[];
  };
}

/** How big a celebration to play. Presentation only; it never affects what was won. */
export function tierFor(valuePence: number, thresholds = { medium: 2000, big: 10000 }): PrizeTier {
  return valuePence >= thresholds.big ? "big" : valuePence >= thresholds.medium ? "medium" : "small";
}

export function fromRevealOutcome(play: RevealOutcomeLike, competitionId?: string): GameTicket[] {
  return play.outcome.tickets
    .filter((t) => !competitionId || t.competitionId === competitionId)
    .map((t): GameTicket => ({
      ticketNumber: t.ticketNumber,
      result: t.prize ? "win" : "lose",
      prize: t.prize ? { label: t.prize.name, value: t.prize.valuePence / 100, tier: tierFor(t.prize.valuePence) } : undefined,
      proofUrl: t.proofUrl ?? undefined,
    }));
}
