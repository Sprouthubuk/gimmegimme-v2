import { lazy } from "react";
import type { RevealGameDefinition } from "./games/types";
import { skinForGame } from "./skins/registry";
import type { GameSkin } from "./skins/types";

/**
 * Every arcade reveal game, keyed by competitions.reveal_game. Each board is
 * its own lazy chunk, so a player only downloads the games in their basket.
 * Ids and labels for pickers live in ../gameIds.ts (no component imports).
 */
export const ARCADE_GAMES: Readonly<Record<string, RevealGameDefinition>> = {
  scratch_card: {
    id: "scratch_card", name: "Scratch Card", kind: "single", noun: "Ticket", playNextLabel: "Play next ticket", theme: "pink",
    Board: lazy(() => import("./games/scratch/ScratchBoard").then((m) => ({ default: m.ScratchBoard }))),
  },
  spin_wheel: {
    id: "spin_wheel", name: "Spin the Wheel", kind: "single", noun: "Spin", playNextLabel: "Spin next ticket", theme: "blue", winKicker: "YOU LANDED ON",
    Board: lazy(() => import("./games/wheel/WheelBoard").then((m) => ({ default: m.WheelBoard }))),
  },
  bingo_card: {
    id: "bingo_card", name: "Bingo Card", kind: "single", noun: "Card", playNextLabel: "Play next card", theme: "yellow",
    Board: lazy(() => import("./games/bingo/BingoBoard").then((m) => ({ default: m.BingoBoard }))),
  },
  balloon_pop: {
    id: "balloon_pop", name: "Balloon Pop", kind: "batch", unit: ["balloon", "balloons"], theme: "yellow",
    BatchBoard: lazy(() => import("./games/balloonPop/BalloonPopBoard").then((m) => ({ default: m.BalloonPopBoard }))),
  },
  hook_a_duck: {
    id: "hook_a_duck", name: "Hook a Duck", kind: "single", noun: "Duck", playNextLabel: "Play next duck", theme: "blue",
    Board: lazy(() => import("./games/hookADuck/HookADuckBoard").then((m) => ({ default: m.HookADuckBoard }))),
  },
  claw_machine: {
    id: "claw_machine", name: "Claw Machine", kind: "single", noun: "Grab", playNextLabel: "Play next grab", theme: "pink",
    Board: lazy(() => import("./games/claw/ClawBoard").then((m) => ({ default: m.ClawBoard }))),
  },
  coin_drop: {
    id: "coin_drop", name: "Coin Drop", kind: "single", noun: "Drop", playNextLabel: "Play next drop", theme: "blue", winKicker: "YOU LANDED ON",
    Board: lazy(() => import("./games/coinDrop/CoinDropBoard").then((m) => ({ default: m.CoinDropBoard }))),
  },
  slots: {
    id: "slots", name: "Slots", kind: "single", noun: "Spin", playNextLabel: "Play next spin", theme: "pink",
    Board: lazy(() => import("./games/slots/SlotsBoard").then((m) => ({ default: m.SlotsBoard }))),
  },
  gems: {
    id: "gems", name: "Gems", kind: "single", noun: "Board", playNextLabel: "Play next board", theme: "yellow",
    Board: lazy(() => import("./games/gems/GemsBoard").then((m) => ({ default: m.GemsBoard }))),
  },
};

/**
 * The board for a competition inside an arcade reveal. A competition still on
 * "classic" (which the site labels "Scratch Card") or an unknown id plays the
 * scratch card, so a mixed basket never drops back to a different screen.
 */
export function definitionFor(game: string | null | undefined): RevealGameDefinition {
  return (game && ARCADE_GAMES[game]) || ARCADE_GAMES.scratch_card;
}

/**
 * The game and the skin it is drawn in. A skin only swaps the board and its
 * words for a re-drawn version of the same game; when the skin has no version
 * of this game, the classic one is played.
 */
export function skinnedDefinitionFor(game: string | null | undefined, skinId: string | null | undefined): { def: RevealGameDefinition; skin: GameSkin } {
  const base = definitionFor(game);
  const skin = skinForGame(base.id, skinId);
  return { def: skin.games[base.id] ?? base, skin };
}
