import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createBalloonPop } from "./scene";

/** Balloon Pop. `tickets` are results already decided on the server; the game only reveals them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createBalloonPop);
export { createBalloonPop };
