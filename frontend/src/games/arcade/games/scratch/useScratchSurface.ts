import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { symbolKey, type ScratchCardLayout, type ScratchSymbol } from "../generators";

/**
 * The scratching itself, shared by every scratch card look (the classic card and
 * skinned ones such as Scrooge's Secret Stash). A look supplies only how its cover
 * is painted. Which cells count as uncovered, and when, is the same for all of
 * them, and none of it has anything to do with what a cell holds.
 */
const BRUSH = 22; // px radius on screen, whatever size the board is drawn at
const SAMPLES = 7; // per side, per cell
/** A square opens once this much of it has been scratched. */
const OPEN_AT = 0.3;
/** When the finger lifts, any square scratched at least this much opens too, so a quick swipe through a row is enough. */
const OPEN_ON_LIFT = 0.18;

type Rect = { x: number; y: number; w: number; h: number };

/** Paints the cover over the whole card. Called on mount, on resize and once the display font has loaded. */
export type PaintCover = (c: CanvasRenderingContext2D, width: number, height: number) => void;

export function useScratchSurface(cellCount: number, paintCover: PaintCover) {
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(cellCount).fill(false));
  const [started, setStarted] = useState(false);
  const allRevealed = revealed.every(Boolean);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rects = useRef<Rect[]>([]);
  const erased = useRef<Set<number>[]>(Array.from({ length: cellCount }, () => new Set()));
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const last = useRef<{ x: number; y: number } | null>(null);
  /** Every scratch so far, in the card's own layout units, so a repaint (resize, font load) puts them back. */
  const strokes = useRef<{ x1: number; y1: number; x2: number; y2: number; r: number }[]>([]);
  /** Screen pixels per layout pixel: below 1 when the board is drawn smaller (short phones, the result screen). */
  const scale = useRef(1);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const clearCell = (c: CanvasRenderingContext2D, i: number) => {
    const r = rects.current[i];
    if (r) c.clearRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    // Everything is worked out in the card's layout units (offsetWidth), not screen pixels, so it
    // stays right when the board is shrunk with CSS zoom or a transform, in every browser.
    const width = wrap.offsetWidth;
    const height = wrap.offsetHeight;
    const base = wrap.getBoundingClientRect();
    scale.current = width > 0 && base.width > 0 ? base.width / width : 1;
    const dpr = (window.devicePixelRatio || 1) * scale.current;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const c = canvas.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";

    rects.current = cellRefs.current.map((el) => {
      const r = el!.getBoundingClientRect();
      return { x: (r.left - base.left) / scale.current, y: (r.top - base.top) / scale.current, w: r.width / scale.current, h: r.height / scale.current };
    });

    paintCover(c, width, height);
    // Put back what has been scratched, then clear the squares already open.
    c.globalCompositeOperation = "destination-out";
    c.lineCap = "round";
    for (const k of strokes.current) {
      c.lineWidth = k.r * 2;
      c.beginPath();
      c.moveTo(k.x1, k.y1);
      c.lineTo(k.x2 + 0.01, k.y2);
      c.stroke();
    }
    c.globalCompositeOperation = "source-over";
    revealedRef.current.forEach((r, i) => r && clearCell(c, i));
  }, [paintCover]);

  useLayoutEffect(() => {
    paint();
    const ro = new ResizeObserver(() => paint());
    if (wrapRef.current) ro.observe(wrapRef.current);
    // Repaint once the display font has loaded so the lettering on the cover matches.
    document.fonts?.ready.then(() => paint());
    return () => ro.disconnect();
  }, [paint]);

  const scratchTo = (x: number, y: number) => {
    const c = ctx();
    if (!c) return;
    const from = last.current ?? { x, y };
    const brush = BRUSH / scale.current;
    strokes.current.push({ x1: from.x, y1: from.y, x2: x, y2: y, r: brush });
    c.globalCompositeOperation = "destination-out";
    c.lineCap = "round";
    c.lineWidth = brush * 2;
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(x + 0.01, y);
    c.stroke();
    c.globalCompositeOperation = "source-over";
    last.current = { x, y };

    // Track coverage with sample points rather than reading pixels back.
    const dx = x - from.x;
    const dy = y - from.y;
    const len2 = dx * dx + dy * dy || 1;
    const newly: number[] = [];
    rects.current.forEach((r, i) => {
      if (revealedRef.current[i]) return;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = r.x + (r.w * (sx + 0.5)) / SAMPLES;
          const py = r.y + (r.h * (sy + 0.5)) / SAMPLES;
          const t = Math.max(0, Math.min(1, ((px - from.x) * dx + (py - from.y) * dy) / len2));
          const qx = from.x + t * dx - px;
          const qy = from.y + t * dy - py;
          if (qx * qx + qy * qy <= brush * brush) erased.current[i].add(sy * SAMPLES + sx);
        }
      }
      if (erased.current[i].size / (SAMPLES * SAMPLES) >= OPEN_AT) newly.push(i);
    });
    open(newly);
  };

  const open = (cells: number[]) => {
    const c = ctx();
    if (!cells.length || !c) return;
    cells.forEach((i) => clearCell(c, i));
    revealedRef.current = revealedRef.current.map((v, i) => v || cells.includes(i));
    setRevealed((prev) => prev.map((v, i) => v || cells.includes(i)));
  };

  /** On lifting the finger: open every square that has been properly scratched. */
  const openTouched = () =>
    open(erased.current.map((e, i) => (!revealedRef.current[i] && e.size / (SAMPLES * SAMPLES) >= OPEN_ON_LIFT ? i : -1)).filter((i) => i >= 0));

  const point = (e: ReactPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale.current, y: (e.clientY - r.top) / scale.current };
  };

  const scratching = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (allRevealed) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; scratching still works without it */
    }
    // Measure again at the start of every stroke. A new card can appear while the board is still
    // growing back from the small result view, so sizes taken when it was first drawn can be stale,
    // and a transform never triggers the ResizeObserver. Repainting replays every scratch so far.
    const wrap = wrapRef.current;
    const box = wrap?.getBoundingClientRect();
    if (wrap && box && Math.abs(box.width / (wrap.offsetWidth || 1) - scale.current) > 0.001) paint();
    scratching.current = true;
    setStarted(true);
    last.current = null;
    const p = point(e);
    scratchTo(p.x, p.y);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scratching.current) return;
    const p = point(e);
    scratchTo(p.x, p.y);
  };
  const onPointerUp = () => {
    if (scratching.current) openTouched();
    scratching.current = false;
    last.current = null;
  };

  const revealAll = () => {
    setStarted(true);
    ctx()?.clearRect(0, 0, 9999, 9999);
    setRevealed(Array(cellCount).fill(true));
  };
  const resetCover = () => {
    erased.current = erased.current.map((s, i) => (revealedRef.current[i] ? s : new Set()));
    strokes.current = [];
    paint();
  };

  return {
    revealed,
    started,
    allRevealed,
    wrapRef,
    canvasRef,
    cellRefs,
    canvasHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    revealAll,
    resetCover,
  };
}

export type ScratchProgress =
  | { kind: "start" }
  | { kind: "done"; won: boolean }
  | { kind: "pair"; label: string; left: number }
  | { kind: "keep"; left: number };

/**
 * What the prompt under a card says so far. Only a ticket that really wins is told
 * it has a pair of its prize; a loss gets no "nearly" prompt.
 */
export function scratchProgress(layout: ScratchCardLayout, revealed: readonly boolean[], started: boolean): ScratchProgress {
  if (revealed.every(Boolean)) return { kind: "done", won: layout.winningCells.length > 0 };
  if (!started) return { kind: "start" };
  const shown = layout.cells.filter((_, i) => revealed[i]);
  const counts = new Map<string, { n: number; s: ScratchSymbol }>();
  shown.forEach((s) => {
    if (s.kind === "icon") return;
    const k = symbolKey(s);
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, s });
  });
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const left = layout.cells.length - shown.length;
  if (best && best.n >= 2 && best.s.kind === "label" && layout.winningCells.length > 0 && best.s.label === symbolKey(layout.cells[layout.winningCells[0]]))
    return { kind: "pair", label: best.s.label, left };
  return { kind: "keep", left };
}

/** "£5" → "£5s"; a prize name stays as it is. */
export const pluralLabel = (label: string) => (label.startsWith("£") ? `${label}s` : label);
