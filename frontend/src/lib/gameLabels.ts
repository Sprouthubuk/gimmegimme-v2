// What a competition's reveal game is called on cards and pages. A skin (Christmas, pirates…)
// gives a game its own name and badge (src/games/skinIds.ts); otherwise the game's own label.
import { skinnedGameBadge, skinnedGameName } from "../games/skinIds";

interface WithGame {
  game: string | null;
  skin?: string | null;
  gameLabel: string | null;
}

/** The short word on a card's game badge, e.g. "Treasure" for Pirates of the Prizeibbean. */
export const gameBadge = (c: WithGame): string | null => skinnedGameBadge(c.game, c.skin) ?? c.gameLabel;

/** The game's name on a competition page, e.g. "Pirates of the Prizeibbean". */
export const gameName = (c: WithGame): string | null => skinnedGameName(c.game, c.skin) ?? c.gameLabel;
