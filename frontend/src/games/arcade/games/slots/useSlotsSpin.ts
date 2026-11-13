import { useCallback, useEffect, useState } from "react";
import type { SlotsLayout } from "../generators";

/** When each reel stops, in ms after the spin starts. */
export const SLOT_STOP_MS = [1400, 2000, 2700] as const;

export type SlotsPhase = "ready" | "spinning" | "landed";

/**
 * The spin of the Slots game, shared by every look of it (the classic machine and
 * skinned ones such as Blankets & Banknotes). The reels, and where they stop, come
 * from generateSlots; this only decides when each reel stops.
 */
export function useSlotsSpin(
  layout: SlotsLayout,
  reducedMotion: boolean,
  onReveal: () => void,
  /** How long the landed reels stay up before the result sheet, on a win and on a miss. */
  holdMs: { win: number; lose: number } = { win: 1200, lose: 800 },
) {
  const [phase, setPhase] = useState<SlotsPhase>("ready");
  const [stopped, setStopped] = useState(0);

  // Checked inside the update, so a double tap can never start a second spin.
  const spin = useCallback(() => setPhase((p) => (p === "ready" ? "spinning" : p)), []);

  useEffect(() => {
    if (phase !== "spinning") return;
    const stops = reducedMotion ? [100, 150, 200] : SLOT_STOP_MS;
    const timers = stops.map((ms, i) => setTimeout(() => setStopped(i + 1), ms + 60));
    timers.push(setTimeout(() => setPhase("landed"), stops[2] + 150));
    return () => timers.forEach(clearTimeout);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.win ? holdMs.win : holdMs.lose);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion, layout.win, holdMs.win, holdMs.lose]);

  return {
    phase,
    /** Reels stopped so far (0 to 3). */
    stopped,
    spin,
    /** Reel r's spin length in ms: each reel stops a little after the one before. */
    reelMs: (r: number) => (reducedMotion ? 100 : SLOT_STOP_MS[r]),
  };
}
