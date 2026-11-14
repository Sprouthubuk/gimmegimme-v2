import { useCallback, useEffect, useRef, useState } from "react";

/** A prize in the claw machine's glass: its centre as % of the glass. Later items sit on top. */
export interface ClawItem {
  x: number;
  y: number;
}

/**
 * aim: the player steers. descend/close/ascend: the claw picks up an item. carry: it swings over to the
 * chute. drop: it lets go and the item falls into the chute. open: the item is shown centre stage and
 * opens on this ticket's result.
 */
export type ClawPhase = "aim" | "descend" | "close" | "ascend" | "carry" | "drop" | "open";

const REST_LEN = 12;
const MIN_X = 12;
const MAX_X = 88;
/** Where the chute sits under the glass, as % of its width. */
export const CHUTE_X = 50;
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
  /** The head's swing in degrees: it lags behind the carriage like a pendulum. */
  const [swing, setSwing] = useState(0);
  const hold = useRef<number | null>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const lastX = useRef(50);

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

  // Pendulum: moving the carriage kicks the head the other way, then it settles.
  useEffect(() => {
    const dx = x - lastX.current;
    lastX.current = x;
    if (reducedMotion || dx === 0) return;
    setSwing((s) => Math.max(-14, Math.min(14, s - dx * 1.6)));
  }, [x, reducedMotion]);
  useEffect(() => {
    if (swing === 0) return;
    const t = window.setTimeout(() => setSwing((s) => (Math.abs(s) < 0.6 ? 0 : -s * 0.55)), 140);
    return () => window.clearTimeout(t);
  }, [swing]);

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
      close: [rm ? 80 : 420, "ascend"],
      // Win or lose, the item comes up, goes to the chute and opens. A loss is simply an empty one.
      ascend: [rm ? 80 : 900, "carry"],
      carry: [rm ? 80 : 750, "drop"],
      drop: [rm ? 80 : 650, "open"],
      open: [rm ? 400 : openMs, "reveal"],
    };
    const step = steps[phase];
    if (!step) return;
    if (phase === "carry") setX(CHUTE_X);
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
  /** Items next to the one being grabbed give a little wobble when the claw closes. */
  const jostled = (i: number) => phase === "close" && item != null && i !== target && Math.abs(pile[i].x - item.x) <= 18 && Math.abs(pile[i].y - item.y) <= 16;
  return {
    x,
    phase,
    target,
    tilt,
    swing,
    glassRef,
    move,
    startHold,
    stopHold,
    grab,
    onGlassPointer,
    jostled,
    /** The claw is holding its item above the pile. */
    carrying: !!item && (phase === "ascend" || phase === "carry"),
    /** The item has left the claw: it is falling into the chute or open centre stage. */
    released: !!item && (phase === "drop" || phase === "open"),
    /** Cable length, as % of the glass. */
    len: item && down ? lenFor(item.y) : REST_LEN,
    closed: phase === "close" || phase === "ascend" || phase === "carry",
  };
}
