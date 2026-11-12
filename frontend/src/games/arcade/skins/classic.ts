import type { GameSkin } from "./types";

/** The original look. Its words are the ones the result screens have always used. */
export const CLASSIC_SKIN: GameSkin = {
  id: "classic",
  copy: {
    manyWinKicker: (count, unitPlural) => `${count} winning ${unitPlural}!`,
    noWinTitle: "No win this time",
    summaryWinKicker: (count) => `You won ${count === 1 ? "a prize" : `${count} prizes`}!`,
  },
  games: {},
};
