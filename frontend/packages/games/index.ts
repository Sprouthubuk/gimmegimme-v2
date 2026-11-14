/**
 * The premium games library. Each game is loaded on demand, so a page only downloads the one it shows.
 *   const game = await mountPremiumGame("scratch_card", el, config);
 */
import type { GameConfig, MountedGame } from "./shared/types";

export const PREMIUM_GAMES = {
  scratch_card: () => import("./scratch-card"),
  balloon_pop: () => import("./balloon-pop"),
  gems: () => import("./gems"),
  spin_wheel: () => import("./spin-wheel"),
  slots: () => import("./slots"),
  claw_machine: () => import("./claw-machine"),
  coin_drop: () => import("./coin-drop"),
  hook_a_duck: () => import("./hook-a-duck"),
  bingo_card: () => import("./bingo-card"),
} as const;

export type PremiumGameId = keyof typeof PREMIUM_GAMES;

export const isPremiumGame = (id: string | null | undefined): id is PremiumGameId => !!id && id in PREMIUM_GAMES;

export async function mountPremiumGame(id: PremiumGameId, el: HTMLElement, config: GameConfig): Promise<MountedGame> {
  const mod = await PREMIUM_GAMES[id]();
  return mod.mount(el, config);
}

export { fromRevealOutcome, tierFor } from "./shared/adapter";
export { THEMES, resolveTheme } from "./shared/theme";
export type { GameConfig, GameLinks, GameTicket, GamePrize, MountedGame, PrizeTier } from "./shared/types";
