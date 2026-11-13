import { lazy } from "react";
import type { GameSkin } from "../types";

/**
 * Drop It Like It's Hot: Coin Drop on a graffiti wall with gold chains and
 * speaker bins. Plays the same generator as the classic coin drop.
 */
export const HIP_HOP_SKIN: GameSkin = {
  id: "hip_hop",
  copy: {
    winKicker: "Big win! You've won",
    manyWinKicker: (count, unitPlural) => `${count} winning ${unitPlural}!`,
    noWinTitle: "Not this time",
    summaryWinKicker: (count) => `Big win! You won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  games: {
    coin_drop: {
      id: "coin_drop", name: "Drop It Like It's Hot", kind: "single", noun: "Drop", playNextLabel: "Next drop", theme: "pink", winKicker: "YOU DROPPED ON",
      noWinLine: "The coin landed on an empty speaker.",
      Board: lazy(() => import("./DropItBoard").then((m) => ({ default: m.DropItBoard }))),
    },
  },
};
