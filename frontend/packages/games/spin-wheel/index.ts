import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createSpinWheel } from "./scene";

/** Spin the Wheel. `tickets` are results already decided on the server; the wheel only shows them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createSpinWheel);
export { createSpinWheel, landingSegments, wheelSegments } from "./scene";
