import { lazy } from "react";
import type { GameSkin } from "../types";
import { Snowfall } from "./Snowfall";

/**
 * The Christmas skin, named after the Christmas competitions. Seven of the
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
    gems: {
      id: "gems", name: "Liam's Humbug Heist", kind: "single", noun: "Heist", playNextLabel: "Next heist", theme: "yellow",
      noWinLine: "No three the same in those bags.",
      Board: lazy(() => import("./HeistBoard").then((m) => ({ default: m.HeistBoard }))),
    },
    claw_machine: {
      id: "claw_machine", name: "Demi's Grinchmas Gold", kind: "single", noun: "Grab", playNextLabel: "Next grab", theme: "pink",
      noWinLine: "That bauble was empty.",
      Board: lazy(() => import("./GrinchClawBoard").then((m) => ({ default: m.GrinchClawBoard }))),
    },
    slots: {
      id: "slots", name: "Blankets & Banknotes", kind: "single", noun: "Spin", playNextLabel: "Next spin", theme: "pink",
      noWinLine: "No three in a row on the payline.",
      Board: lazy(() => import("./BlanketsSlotsBoard").then((m) => ({ default: m.BlanketsSlotsBoard }))),
    },
  },
};
