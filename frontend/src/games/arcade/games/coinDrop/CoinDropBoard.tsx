import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardProps } from "../types";
import { COIN_BINS, generateCoinDrop } from "../generators";
import { createRng } from "../../rng";
import { sizeClass } from "../symbols";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./coinDrop.css";

// Board geometry, in SVG units.
const W = 320;
const ROWS = 7;
const ROW_Y0 = 30;
const ROW_DY = 36;
const PEG_R = 5.5;
const COIN_R = 12;
const BIN_TOP = ROW_Y0 + ROW_DY * (ROWS - 1) + 26;
const LABEL_TOP = BIN_TOP + 40;
const H = LABEL_TOP + 52;
const BIN_W = W / COIN_BINS;
const binX = (b: number) => BIN_W * (b + 0.5);

const pegsFor = (row: number) =>
  row % 2 === 0 ? Array.from({ length: 8 }, (_, i) => 20 + i * 40) : Array.from({ length: 7 }, (_, i) => 40 + i * 40);

type Pt = { x: number; y: number };
type Phase = "aim" | "dropping" | "landed";

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

export function CoinDropBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateCoinDrop(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const [aim, setAim] = useState(3);
  const [phase, setPhase] = useState<Phase>("aim");
  const [coin, setCoin] = useState<Pt | null>(null);
  const [trail, setTrail] = useState<Pt[]>([]);
  const [landedBin, setLandedBin] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const target = useMemo(
    () => layout.targets.reduce((a, b) => (Math.abs(b - aim) < Math.abs(a - aim) ? b : a)),
    [layout.targets, aim],
  );

  const drop = () => {
    if (phase !== "aim") return;
    setPhase("dropping");
  };

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
    const t = setTimeout(onReveal, reducedMotion ? 300 : 1000);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion]);

  const aimFromPointer = (e: React.PointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setAim(Math.max(0, Math.min(COIN_BINS - 1, Math.round(frac * (COIN_BINS - 1)))));
  };

  return (
    <>
      <div
        className="rg-coin-rail"
        ref={railRef}
        onPointerDown={(e) => {
          if (phase !== "aim" || (e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          aimFromPointer(e);
        }}
        onPointerMove={(e) => phase === "aim" && e.currentTarget.hasPointerCapture(e.pointerId) && aimFromPointer(e)}
      >
        <button type="button" className="rg-rail-arrow" onClick={() => setAim((a) => Math.max(0, a - 1))} disabled={phase !== "aim"} aria-label="Aim left">
          <svg viewBox="0 0 20 20"><path d="M13 4 L6 10 L13 16 Z" fill="currentColor" /></svg>
        </button>
        <div className="rg-rail-track" ref={trackRef}>
          {phase === "aim" ? (
            <button
              type="button"
              className="rg-rail-coin"
              style={{ left: `${(aim / (COIN_BINS - 1)) * 100}%` }}
              onClick={drop}
              aria-label={`Drop the coin above slot ${aim + 1}`}
            >
              £
            </button>
          ) : (
            <span className="rg-rail-label">COIN DROP</span>
          )}
        </div>
        <button type="button" className="rg-rail-arrow" onClick={() => setAim((a) => Math.min(COIN_BINS - 1, a + 1))} disabled={phase !== "aim"} aria-label="Aim right">
          <svg viewBox="0 0 20 20"><path d="M7 4 L14 10 L7 16 Z" fill="currentColor" /></svg>
        </button>
      </div>

      <div className={`rg-coin-board is-${phase}`} onClick={drop}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={landedBin != null ? `Coin landed on ${layout.bins[landedBin].label ?? "no prize"}` : "Coin drop board"}>
          {Array.from({ length: ROWS }, (_, r) =>
            pegsFor(r).map((x, i) => (
              <circle key={`${r}-${i}`} cx={x} cy={ROW_Y0 + r * ROW_DY} r={PEG_R} fill={(r + i) % 2 ? "#ff2d95" : "#1fc4f4"} stroke="#141414" strokeWidth="2.2" />
            )),
          )}
          {layout.bins.map((b, i) => (
            <g key={i} className={landedBin === i ? "rg-bin-hit" : ""}>
              <rect x={i * BIN_W} y={LABEL_TOP} width={BIN_W} height={H - LABEL_TOP} className={`rg-bin rg-bin-${b.label ? b.tone : "none"}`} />
              {b.label ? (
                <text x={binX(i)} y={LABEL_TOP + 27} textAnchor="middle" dominantBaseline="middle" className={`rg-bin-label ${sizeClass(b.label)}`}>
                  {b.label.length > 6 ? `${b.label.slice(0, 5)}…` : b.label}
                </text>
              ) : (
                <path d={`M${binX(i) - 7} ${LABEL_TOP + 20} l14 14 m0 -14 l-14 14`} stroke="#141414" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </g>
          ))}
          {Array.from({ length: COIN_BINS - 1 }, (_, i) => (
            <line key={i} x1={(i + 1) * BIN_W} x2={(i + 1) * BIN_W} y1={BIN_TOP} y2={H} stroke="#141414" strokeWidth="3" />
          ))}
          <line x1="0" x2={W} y1={LABEL_TOP} y2={LABEL_TOP} stroke="#141414" strokeWidth="3" />
          {trail.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={COIN_R * 0.9} fill="#ffe11a" opacity={0.12 + i * 0.08} />
          ))}
          {coin && (
            <g transform={`translate(${coin.x} ${coin.y})`}>
              <circle r={COIN_R} fill="#ffe11a" stroke="#141414" strokeWidth="2.5" />
              <text textAnchor="middle" dominantBaseline="central" className="rg-coin-glyph">£</text>
            </g>
          )}
        </svg>
      </div>
      {phase === "aim" ? (
        <GamePrompt title="Slide to aim, tap to drop" sub={RESULT_SET_NOTE} />
      ) : phase === "dropping" ? (
        <GamePrompt title="Bouncing…" tone="pink" />
      ) : (
        <GamePrompt title={layout.bins[landedBin!].label ? `${layout.bins[landedBin!].label}!` : "No win"} tone="pink" />
      )}
    </>
  );
}
