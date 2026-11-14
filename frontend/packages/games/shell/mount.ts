import type { GameConfig, MountedGame } from "../shared/types";
import { runShell, type GameScene, type ShellContext } from "./Shell";

/** Mount any game built on the shell. Safe to destroy before it has finished loading. */
export function mountGame(el: HTMLElement, config: GameConfig, makeScene: (ctx: ShellContext) => GameScene): MountedGame {
  let destroyed = false;
  let inner: { destroy(): void } | null = null;
  runShell(el, config, makeScene)
    .then((g) => {
      inner = g;
      if (destroyed) g.destroy();
    })
    .catch((err) => console.error("Game could not start", err));
  return {
    destroy() {
      destroyed = true;
      inner?.destroy();
      inner = null;
    },
  };
}
