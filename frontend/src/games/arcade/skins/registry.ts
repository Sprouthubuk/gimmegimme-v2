import { normaliseGameSkin } from "../../skinIds";
import { CHRISTMAS_SKIN } from "./christmas";
import { CLASSIC_SKIN } from "./classic";
import type { GameSkin } from "./types";

/** Every skin, keyed by competitions.game_skin. To add one, add a line here (see ./types.ts). */
export const GAME_SKINS: Readonly<Record<string, GameSkin>> = {
  classic: CLASSIC_SKIN,
  christmas: CHRISTMAS_SKIN,
};

/** A skin by id. Unknown or missing ids are the classic skin. */
export const skinFor = (id: string | null | undefined): GameSkin => GAME_SKINS[normaliseGameSkin(id)] ?? CLASSIC_SKIN;

/**
 * The skin a game is actually drawn in: the chosen skin when it has its own
 * version of that game, otherwise the classic look (words included), so a
 * game is never half dressed.
 */
export function skinForGame(gameDefinitionId: string, skinId: string | null | undefined): GameSkin {
  const skin = skinFor(skinId);
  return skin.games[gameDefinitionId] ? skin : CLASSIC_SKIN;
}
