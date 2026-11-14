import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createScratchCard } from "./card";

/**
 * The premium scratch card. Framework-agnostic:
 *   const game = mount(el, { tickets, theme: "christmas" }); ... game.destroy();
 * `tickets` are results already decided on the server; the game only reveals them.
 */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createScratchCard);
export { createScratchCard };
