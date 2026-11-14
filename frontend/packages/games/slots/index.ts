import { mountGame } from "../shell/mount";
import type { GameConfig, MountedGame } from "../shared/types";
import { createSlots } from "./scene";

/** Slots. `tickets` are results already decided on the server; the reels only show them. */
export const mount = (el: HTMLElement, config: GameConfig): MountedGame => mountGame(el, config, createSlots);
export { createSlots, paylineFor, SYMBOLS } from "./scene";
