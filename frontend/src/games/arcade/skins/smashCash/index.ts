import { lazy } from "react";
import type { GameSkin } from "../types";

/**
 * Smash My Cash: Balloon Pop with jars of cash to smash with a golden hammer,
 * one jar per ticket. The Nth jar smashed shows the Nth ticket, as with balloons.
 */
export const SMASH_CASH_SKIN: GameSkin = {
  id: "smash_cash",
  copy: {
    winKicker: "Smashed it! You've won",
    manyWinKicker: (count, unitPlural) => `${count} winning ${unitPlural}!`,
    noWinTitle: "Not this time",
    summaryWinKicker: (count) => `Smashed it! You won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  games: {
    balloon_pop: {
      id: "balloon_pop", name: "Smash My Cash", kind: "batch", unit: ["jar", "jars"], theme: "pink",
      noWinLine: "Just shards in that jar.",
      BatchBoard: lazy(() => import("./SmashBoard").then((m) => ({ default: m.SmashBoard }))),
    },
  },
};
