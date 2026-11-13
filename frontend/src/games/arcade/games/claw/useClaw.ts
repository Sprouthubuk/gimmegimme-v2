import { useCallback, useEffect, useRef, useState } from "react";

/** A prize in the claw machine's glass: its centre as % of the glass. Later items sit on top. */
export interface ClawItem {
  x: number;
  y: number;
}

export type ClawPhase = "aim" | "descend" | "close" | "ascend" | "open";

const REST_LEN = 12;
const MIN_X = 12;
const MAX_X = 88;
/** The head's bottom meets the item's top. Matches the rig in claw.css. */
const lenFor = (y: number) => y - 25;

/**
 * The claw machine's controls and sequence, shared by every look of it (the
 * classic capsule machine and skinned ones such as Demi's Grinchmas Gold).
 * Steering and which item the claw picks up are cosmetic: every item holds this
 * ticket's result, which the board shows when the item opens.
 */
export function useClaw(
  pile: readonly ClawItem[],
  reducedMotion: boolean,
  onReveal: () => void,
  /** How long the opened item stays up before the result sheet. */
  openMs = 1300,
) {
  const [x, setX] = useState(50);
  const [phase, setPhase] = useState<ClawPhase>("aim");
  const [target, setTarget] = useState<number | null>(null);
  const [tilt, setTilt] = useState(0);
  const hold = useRef<number | null>(null);
  const glassRef = useRef<HTMLDivElement>(null);

  const move = useCallback((dx: number) => setX((v) => Math.max(MIN_X, Math.min(MAX_X, v + dx))), []);
  const stopHold = useCallback(() => {
    if (hold.current) window.clearInterval(hold.current);
    hold.current = null;
    setTilt(0);
  }, []);
  const startHold = (dir: -1 | 1) => {
    if (phase !== "aim") return;
    stopHold();
    setTilt(dir);
    hold.current = window.setInterval(() => move(dir * 1.2), 30);
  };
  useEffect(() => stopHold, [stopHold]);

  const grab = () => {
    if (phase !== "aim") return;
    stopHold();
    // Top-most item under the claw, else the nearest one.
    const all = pile.map((c, i) => ({ ...c, i }));
    const under = all.filter((c) => Math.abs(c.x - x) <= 9);
    const chosen = under.length ? under.sort((a, b) => a.y - b.y)[0] : all.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    setTarget(chosen.i);
    setX(pile[chosen.i].x);
    setPhase("descend");
  };

  useEffect(() => {
    if (phase === "aim") return;
    const rm = reducedMotion;
    const steps: Partial<Record<ClawPhase, [number, ClawPhase | "reveal"]>> = {
      descend: [rm ? 80 : 950, "close"],
      close: [rm ? 80 : 350, "ascend"],
      // Win or lose, the item comes up and opens. A loss is simply an empty one.
      ascend: [rm ? 80 : 1050, "open"],
      open: [rm ? 300 : openMs, "reveal"],
    };
    const step = steps[phase];
    if (!step) return;
    const t = setTimeout(() => (step[1] === "reveal" ? onReveal() : setPhase(step[1])), step[0]);
    return () => clearTimeout(t);
  }, [phase, reducedMotion, onReveal, openMs]);

  const onGlassPointer = (e: React.PointerEvent) => {
    if (phase !== "aim" || !(e.buttons & 1) || !glassRef.current) return;
    const r = glassRef.current.getBoundingClientRect();
    setX(Math.max(MIN_X, Math.min(MAX_X, ((e.clientX - r.left) / r.width) * 100)));
  };

  const item = target != null ? pile[target] : null;
  const down = phase === "descend" || phase === "close";
  return {
    x,
    phase,
    target,
    tilt,
    glassRef,
    move,
    startHold,
    stopHold,
    grab,
    onGlassPointer,
    /** The claw is holding its item above the pile. */
    carrying: !!item && (phase === "ascend" || phase === "open"),
    /** Cable length, as % of the glass. */
    len: item && down ? lenFor(item.y) : REST_LEN,
    closed: phase === "close" || phase === "ascend" || phase === "open",
  };
}
