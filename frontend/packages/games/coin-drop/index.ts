import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createCoinDrop } from "./scene";

/** Coin Drop. `tickets` are results already decided on the server; the board only reveals them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createCoinDrop);
export { createCoinDrop };
