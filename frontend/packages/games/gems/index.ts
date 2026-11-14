import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createGems } from "./scene";

/** Gems. `tickets` are results already decided on the server; the game only reveals them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createGems);
export { createGems };
