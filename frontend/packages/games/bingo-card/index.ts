import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createBingoCard } from "./scene";

/** Bingo Card. `tickets` are results already decided on the server; the card only reveals them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createBingoCard);
export { createBingoCard };
