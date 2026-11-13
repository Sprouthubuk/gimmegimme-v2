import { useCallback, useEffect, useMemo, useState } from "react";
import { WHEEL_SEGMENTS, type WheelLayout } from "../generators";
import { createRng } from "../../rng";

export type WheelPhase = "ready" | "spinning" | "landed";
const SEG = 360 / WHEEL_SEGMENTS;

/**
 * The spin of Spin the Wheel, shared by every look of it (the classic wheel and
 * skinned ones such as The Great Cash Escape). The segments, and which one the
 * wheel lands on, come from generateWheel; this only turns the wheel there.
 * Rotation is in degrees, clockwise; segment i sits at i × 30° from the top.
 */
export function useWheelSpin(
  layout: WheelLayout,
  seed: string,
  reducedMotion: boolean,
  onReveal: () => void,
  { spinMs = 4600, turns = 6, holdMs = 900 }: { spinMs?: number; turns?: number; holdMs?: number } = {},
) {
  const [phase, setPhase] = useState<WheelPhase>("ready");

  // Land somewhere inside the target segment, not dead centre every time.
  const finalRotation = useMemo(() => {
    const rng = createRng(`wheel-land:${seed}`);
    const jitter = (rng() - 0.5) * SEG * 0.6;
    return 360 * turns - layout.target * SEG + jitter;
  }, [seed, layout.target, turns]);

  // Checked inside the update, so a double tap can never start a second spin.
  const spin = useCallback(() => setPhase((p) => (p === "ready" ? "spinning" : p)), []);

  useEffect(() => {
    if (phase !== "spinning") return;
    const t = setTimeout(() => setPhase("landed"), reducedMotion ? 250 : spinMs + 100);
    return () => clearTimeout(t);
  }, [phase, reducedMotion, spinMs]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : holdMs);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion, holdMs]);

  return {
    phase,
    /** The wheel is painted at 0° until the spin, so the CSS transition runs from there. */
    rotation: phase === "ready" ? 0 : finalRotation,
    spin,
    /** The CSS transition for the rotor while it spins. */
    transition: phase === "spinning" && !reducedMotion ? `transform ${spinMs}ms cubic-bezier(0.12, 0.6, 0.08, 1)` : "none",
    landed: layout.segments[layout.target],
  };
}
