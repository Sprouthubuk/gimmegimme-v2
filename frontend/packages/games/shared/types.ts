/**
 * The public contract of the games library. A game is handed results that were already decided on the
 * server (Laravel + Verity); it only presents them. Nothing here can create or change a result.
 */

export type PrizeTier = "small" | "medium" | "big";

export interface GamePrize {
  /** As the server named it, e.g. "£10 Site Credit". */
  label: string;
  /** In pounds, for counting up the total. */
  value: number;
  /** Presentation only: how big a celebration to play. */
  tier: PrizeTier;
}

export interface GameTicket {
  ticketNumber: number;
  result: "win" | "lose";
  prize?: GamePrize;
  /** The fairness record for this ticket's competition. */
  proofUrl?: string;
}

export interface GameLinks {
  /** Where "Back" goes. */
  back?: string;
  /** Where "Play again" goes (usually the competition page). */
  playAgain?: string;
  /** Where "View wallet" goes. */
  wallet?: string;
}

export interface GameConfig {
  tickets: readonly GameTicket[];
  /** "default", "christmas", or a full theme object (see shared/theme.ts). */
  theme?: string | Partial<import("./theme").Theme>;
  /** Shown in the top bar, e.g. "Scratch Card". Defaults to the theme's title. */
  title?: string;
  /**
   * The competition's real prize names (largest first), for games that show a prize board (wheel segments,
   * slot symbols). Never invented: leave it out and games show their own neutral board.
   */
  prizeLabels?: readonly string[];
  /** Printed on each card, e.g. the competition name. */
  competitionTitle?: string;
  links?: GameLinks;
  /** Force reduced motion on or off; by default follows the device setting. */
  reducedMotion?: boolean;
  /**
   * Tells the server the player has watched their results. Called at most once per session, when the
   * first ticket is revealed; must be safe to repeat (the Gimme Gimme endpoint is).
   */
  onReveal?: () => Promise<unknown>;
  /** Called when the session ends (summary shown). */
  onComplete?: (summary: { wins: number; tickets: number; totalWon: number }) => void;
  /** Replace any asset listed in assets/manifest.json by its key, e.g. { "foil-texture": "/art/foil.webp" }. */
  assets?: Record<string, string>;
}

export interface MountedGame {
  destroy(): void;
}
