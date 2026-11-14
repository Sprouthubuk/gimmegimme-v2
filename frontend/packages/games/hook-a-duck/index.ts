import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createHookADuck } from "./scene";

/** Hook a Duck. `tickets` are results already decided on the server; the ducks only reveal them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createHookADuck);
export { createHookADuck };
