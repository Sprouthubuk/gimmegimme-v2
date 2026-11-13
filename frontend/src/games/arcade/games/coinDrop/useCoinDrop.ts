import { useEffect, useMemo, useRef, useState } from "react";
import { COIN_BINS, type CoinDropLayout } from "../generators";
import { createRng } from "../../rng";

/*
 * The Coin Drop game's board and drop, shared by every look of it (the classic
 * board and skinned ones such as Drop It Like It's Hot). Which bins hold which
 * prize, and the bins the coin may land in, come from generateCoinDrop; aiming
 * only picks the nearest of those bins, so where the player aims is cosmetic.
 */

// Board geometry, in SVG units.
export const W = 320;
export const ROWS = 7;
export const ROW_Y0 = 30;
export const ROW_DY = 36;
export const PEG_R = 5.5;
export const COIN_R = 12;
export const BIN_TOP = ROW_Y0 + ROW_DY * (ROWS - 1) + 26;
export const LABEL_TOP = BIN_TOP + 40;
export const H = LABEL_TOP + 52;
export const BIN_W = W / COIN_BINS;
export const binX = (b: number) => BIN_W * (b + 0.5);

export const pegsFor = (row: number) =>
  row % 2 === 0 ? Array.from({ length: 8 }, (_, i) => 20 + i * 40) : Array.from({ length: 7 }, (_, i) => 40 + i * 40);

export type Pt = { x: number; y: number };
export type CoinDropPhase = "aim" | "dropping" | "landed";

/** Keyframes from the aim point to the target bin, glancing off one peg per row. */
function buildPath(aim: number, target: number, seed: string): Pt[] {
  const rng = createRng(`coin-path:${seed}:${aim}`);
  const x0 = binX(aim);
  const x1 = binX(target);
  const pts: Pt[] = [{ x: x0, y: -COIN_R }];
  for (let r = 0; r < ROWS; r++) {
    const t = (r + 1) / (ROWS + 1);
    const eased = t * t * (3 - 2 * t);
    const ideal = x0 + (x1 - x0) * eased + (rng() - 0.5) * 16;
    const pegs = pegsFor(r);
    const peg = pegs.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a));
    const toward = x1 - peg;
    const dir = Math.abs(toward) < 4 ? (rng() < 0.5 ? -1 : 1) : Math.sign(toward);
    pts.push({ x: peg + dir * (PEG_R + COIN_R) * 0.62, y: ROW_Y0 + r * ROW_DY - (PEG_R + COIN_R) * 0.8 });
  }
  pts.push({ x: x1, y: LABEL_TOP - COIN_R - 2 });
  return pts;
}

export function useCoinDrop(
  layout: CoinDropLayout,
  seed: string,
  reducedMotion: boolean,
  onReveal: () => void,
  /** How long the landed coin stays up before the result sheet. */
  holdMs = 1000,
) {
  const [aim, setAim] = useState(3);
  const [phase, setPhase] = useState<CoinDropPhase>("aim");
  const [coin, setCoin] = useState<Pt | null>(null);
  const [trail, setTrail] = useState<Pt[]>([]);
  const [landedBin, setLandedBin] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const target = useMemo(
    () => layout.targets.reduce((a, b) => (Math.abs(b - aim) < Math.abs(a - aim) ? b : a)),
    [layout.targets, aim],
  );

  // Checked inside the update, so a double tap can never drop twice.
  const drop = () => setPhase((p) => (p === "aim" ? "dropping" : p));

  useEffect(() => {
    if (phase !== "dropping") return;
    const path = buildPath(aim, target, seed);
    const land = () => {
      setTrail([]);
      setCoin(path[path.length - 1]);
      setLandedBin(target);
      setPhase("landed");
    };
    if (reducedMotion) {
      land();
      return;
    }
    const SEG_MS = 250;
    const total = SEG_MS * (path.length - 1);
    let start = 0;
    let raf = 0;
    let lastTrail = 0;
    // If frames stall (backgrounded tab), still land on time.
    const fallback = setTimeout(() => {
      cancelAnimationFrame(raf);
      land();
    }, total + 600);
    const frame = (now: number) => {
      if (!start) start = now;
      const elapsed = Math.min(now - start, total);
      const seg = Math.min(Math.floor(elapsed / SEG_MS), path.length - 2);
      const t = (elapsed - seg * SEG_MS) / SEG_MS;
      const a = path[seg];
      const b = path[seg + 1];
      const hop = seg === 0 ? 0 : 9;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t * t - hop * Math.sin(Math.PI * t) * (1 - t) };
      setCoin(p);
      if (now - lastTrail > 70) {
        lastTrail = now;
        setTrail((tr) => [...tr.slice(-3), p]);
      }
      if (elapsed < total) raf = requestAnimationFrame(frame);
      else {
        clearTimeout(fallback);
        land();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [phase, aim, target, seed, reducedMotion]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : holdMs);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion, holdMs]);

  const aimFromPointer = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setAim(Math.max(0, Math.min(COIN_BINS - 1, Math.round(frac * (COIN_BINS - 1)))));
  };

  return { aim, setAim, phase, coin, trail, landedBin, target, drop, railRef, trackRef, aimFromPointer };
}
