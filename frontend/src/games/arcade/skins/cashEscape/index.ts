import { lazy } from "react";
import type { GameSkin } from "../types";

/**
 * The Great Cash Escape: Spin the Wheel as a bank vault door with an alarm on
 * top. Plays the same generator as the classic wheel.
 */
export const CASH_ESCAPE_SKIN: GameSkin = {
  id: "cash_escape",
  copy: {
    winKicker: "Cash escaped! You've won",
    manyWinKicker: (count, unitPlural) => `${count} winning ${unitPlural}!`,
    noWinTitle: "Not this time",
    summaryWinKicker: (count) => `Cash escaped! You won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  games: {
    spin_wheel: {
      id: "spin_wheel", name: "The Great Cash Escape", kind: "single", noun: "Vault", playNextLabel: "Crack the next vault", theme: "pink",
      noWinLine: "The vault stayed shut.",
      Board: lazy(() => import("./VaultWheelBoard").then((m) => ({ default: m.VaultWheelBoard }))),
    },
  },
};
