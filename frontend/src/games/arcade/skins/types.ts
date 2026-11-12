import type { ComponentType } from "react";
import type { GameSkinId } from "../../skinIds";
import type { RevealGameDefinition } from "../games/types";

/**
 * Words a skin may change on the result screens. The layout stays the same;
 * only these lines differ. Every result figure is still read from the ticket.
 */
export interface SkinCopy {
  /** Kicker above the prize on a win. Unset: the game's own kicker, else "WINNER!". */
  winKicker?: string;
  /** Kicker when several tickets on one batch board won: "3 winning balloons!". */
  manyWinKicker: (count: number, unitPlural: string) => string;
  /** Big line on a no-win. */
  noWinTitle: string;
  /** Optional line added after the plain no-win explanation. */
  noWinLine?: string;
  /** Kicker on the last screen when something was won: "You won 2 prizes!". */
  summaryWinKicker: (count: number) => string;
}

/**
 * A seasonal look for the reveal games. Presentation only: a skin swaps a game's
 * board for a re-drawn one that plays the SAME generator (../games/generators.ts),
 * so a skinned board can only ever show the result the server decided.
 *
 * To add a skin (Easter, summer…): make a folder next to ./christmas with its
 * boards and a GameSkin, add it to ./registry.ts, and add its id to
 * ../../skinIds.ts and supabase's competitions_game_skin_check. No game logic changes.
 */
export interface GameSkin {
  id: GameSkinId;
  /** Hat on the mascot wherever it appears under this skin. */
  hat?: "santa";
  copy: SkinCopy;
  /** Drawn behind the whole reveal (snow…). Must follow reducedMotion and ignore taps. */
  Backdrop?: ComponentType<{ reducedMotion: boolean }>;
  /**
   * The skin's own version of a game, keyed by the classic game's id
   * (definitions.ts). Same kind (single or batch) as the classic one. A game
   * not listed plays its classic look under this skin.
   */
  games: Readonly<Record<string, RevealGameDefinition>>;
}
