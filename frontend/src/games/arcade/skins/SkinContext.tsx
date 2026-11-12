import { createContext, useContext } from "react";
import { CLASSIC_SKIN } from "./classic";
import type { GameSkin } from "./types";

/** The skin the reveal on screen is drawn in. Shell pieces (mascot, result sheet) read their words and hat from it. */
export const SkinContext = createContext<GameSkin>(CLASSIC_SKIN);

export const useSkin = (): GameSkin => useContext(SkinContext);
