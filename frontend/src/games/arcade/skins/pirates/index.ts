import { lazy } from "react";
import type { GameSkin } from "../types";

/**
 * Pirates of the Prizeibbean: Gems on a ship's deck at sunset, with treasure
 * chests for tiles. Plays the same generator as the classic gem board.
 */
export const PIRATES_SKIN: GameSkin = {
  id: "pirates",
  copy: {
    winKicker: "Treasure! You've won",
    manyWinKicker: (count, unitPlural) => `${count} winning ${unitPlural}!`,
    noWinTitle: "Not this time",
    summaryWinKicker: (count) => `Treasure! You won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  games: {
    gems: {
      id: "gems", name: "Pirates of the Prizeibbean", kind: "single", noun: "Chest", playNextLabel: "Next chest", theme: "yellow",
      noWinLine: "No three the same in those chests.",
      Board: lazy(() => import("./PiratesBoard").then((m) => ({ default: m.PiratesBoard }))),
    },
  },
};
