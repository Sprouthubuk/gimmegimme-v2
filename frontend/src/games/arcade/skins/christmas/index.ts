import { lazy } from "react";
import type { GameSkin } from "../types";
import { Snowfall } from "./Snowfall";

/**
 * The Christmas skin, named after the four Christmas competitions. Four of the
 * games have a Christmas version; the others play their classic look. Each
 * board below draws the same generator as the classic game it replaces, and is
 * its own lazy chunk. Every miss line is neutral: it says what happened, never
 * "try again".
 */
export const CHRISTMAS_SKIN: GameSkin = {
  id: "christmas",
  hat: "santa",
  copy: {
    winKicker: "Ho ho ho, you've won",
    manyWinKicker: (count, unitPlural) => `Ho ho ho, ${count} winning ${unitPlural}!`,
    noWinTitle: "Not this time",
    summaryWinKicker: (count) => `Ho ho ho, you won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  Backdrop: Snowfall,
  games: {
    balloon_pop: {
      id: "balloon_pop", name: "Chris Cracker's Cash Bang", kind: "batch", unit: ["cracker", "crackers"], theme: "pink",
      noWinLine: "Just a joke and a paper hat inside.",
      BatchBoard: lazy(() => import("./CrackerBoard").then((m) => ({ default: m.CrackerBoard }))),
    },
    spin_wheel: {
      id: "spin_wheel", name: "Dasher's Dosh Drop", kind: "single", noun: "Drop", playNextLabel: "Next drop", theme: "blue",
      noWinLine: "Dasher flew straight past.",
      Board: lazy(() => import("./SleighBoard").then((m) => ({ default: m.SleighBoard }))),
    },
    scratch_card: {
      id: "scratch_card", name: "Scrooge's Secret Stash", kind: "single", noun: "Vault", playNextLabel: "Open next vault", theme: "pink",
      noWinLine: "Nothing in those boxes.",
      Board: lazy(() => import("./VaultScratchBoard").then((m) => ({ default: m.VaultScratchBoard }))),
    },
    bingo_card: {
      id: "bingo_card", name: "Jingle Bell Bingo Bonanza", kind: "single", noun: "Card", playNextLabel: "Play next card", theme: "yellow",
      noWinLine: "The bells didn't line up.",
      Board: lazy(() => import("./JingleBingoBoard").then((m) => ({ default: m.JingleBingoBoard }))),
    },
  },
};
