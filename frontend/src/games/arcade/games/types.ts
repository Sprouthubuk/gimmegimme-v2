import type { ComponentType, LazyExoticComponent } from "react";
import type { RevealTicket } from "../contract";

/**
 * What a competition tells the reveal about itself. Read from public
 * competition data by useRevealContext; nothing here affects a result.
 */
export interface RevealCompetitionInfo {
  /** competitions.reveal_game */
  game: string | null;
  /** Only instant-win competitions are played. Standard competitions have no instant result to show. */
  isInstantWin: boolean;
  /** The competition's published instant-win prizes as short labels. Used to dress boards, never invented. */
  prizeLabels: readonly string[];
  /** True when this competition's tickets also go into a live draw. */
  inLiveDraw: boolean;
  /** Instant-win competitions with an end prize: what that draw is for. */
  endPrizeName?: string;
  /** competitions.game_skin: the look the game is drawn in. Missing = classic. Never affects a result. */
  skin?: string | null;
}
export type RevealContext = Readonly<Record<string, RevealCompetitionInfo>>;

/** A board that plays exactly ONE ticket. */
export interface BoardProps {
  ticket: RevealTicket;
  /** Stable per ticket — feed to createRng() for the board layout. */
  seed: string;
  reducedMotion: boolean;
  /** The competition's other real prize labels. Never includes this ticket's own prize. May be empty. */
  decoys: readonly string[];
  /** Call once, when the board has visually landed on the result. */
  onReveal: () => void;
}

/** A board that plays ALL of a competition's tickets at once (balloon pop). */
export interface BatchBoardProps {
  tickets: readonly RevealTicket[];
  seed: string;
  reducedMotion: boolean;
  /** How many tickets have been shown so far, so the shell can move the wallet. */
  onProgress: (revealed: number) => void;
  /** Call once, when every ticket has been shown. */
  onReveal: () => void;
}

export type RevealTheme = "pink" | "yellow" | "blue";
type Loadable<P> = ComponentType<P> | LazyExoticComponent<ComponentType<P>>;

interface DefinitionBase {
  /** Matches competitions.reveal_game. */
  id: string;
  name: string;
  theme: RevealTheme;
  /** Kicker above the prize on a win. Defaults to "WINNER!". */
  winKicker?: string;
  /** A line added after the plain explanation on a no-win (skinned games). */
  noWinLine?: string;
}

export type RevealGameDefinition =
  | (DefinitionBase & {
      kind: "single";
      /** "Duck" → "Duck 1 of 8" */
      noun: string;
      /** "Play next duck" */
      playNextLabel: string;
      Board: Loadable<BoardProps>;
    })
  | (DefinitionBase & {
      kind: "batch";
      /** ["balloon", "balloons"] */
      unit: readonly [string, string];
      BatchBoard: Loadable<BatchBoardProps>;
    });
