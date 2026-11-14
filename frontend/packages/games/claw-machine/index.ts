import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createClawMachine } from "./scene";

/** Claw Machine. `tickets` are results already decided on the server; the claw only reveals them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createClawMachine);
export { createClawMachine };
