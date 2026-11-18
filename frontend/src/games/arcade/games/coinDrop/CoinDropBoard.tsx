import { useMemo } from "react";
import type { BoardProps } from "../types";
import { COIN_BINS, generateCoinDrop } from "../generators";
import { BIN_TOP, BIN_W, COIN_R, H, LABEL_TOP, PEG_R, ROWS, ROW_DY, ROW_Y0, W, binX, pegsFor, useCoinDrop } from "./useCoinDrop";
import { sizeClass } from "../symbols";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./coinDrop.css";

export function CoinDropBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateCoinDrop(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { aim, setAim, phase, coin, trail, landedBin, drop, railRef, trackRef, aimFromPointer } = useCoinDrop(layout, seed, reducedMotion, onReveal);

  const flat = (
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
          <defs>
            <radialGradient id="cd-peg" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fffbe0" />
              <stop offset="0.5" stopColor="#ffd23a" />
              <stop offset="1" stopColor="#a86400" />
            </radialGradient>
            <radialGradient id="cd-coin" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fff7c2" />
              <stop offset="0.45" stopColor="#ffcf33" />
              <stop offset="1" stopColor="#c47f00" />
            </radialGradient>
            <linearGradient id="cd-bin-yellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3a8" /><stop offset="1" stopColor="#e9a300" /></linearGradient>
            <linearGradient id="cd-bin-cyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8ecff" /><stop offset="1" stopColor="#0a8cc0" /></linearGradient>
            <linearGradient id="cd-bin-pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa8d6" /><stop offset="1" stopColor="#c4006a" /></linearGradient>
            <linearGradient id="cd-bin-none" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a1f5c" /><stop offset="1" stopColor="#1f0b36" /></linearGradient>
          </defs>
          {Array.from({ length: ROWS }, (_, r) =>
            pegsFor(r).map((x, i) => (
              <g key={`${r}-${i}`}>
                <circle cx={x} cy={ROW_Y0 + r * ROW_DY + 1.5} r={PEG_R} fill="rgba(0,0,0,0.45)" />
                <circle cx={x} cy={ROW_Y0 + r * ROW_DY} r={PEG_R} fill="url(#cd-peg)" />
              </g>
            )),
          )}
          {layout.bins.map((b, i) => (
            <g key={i} className={landedBin === i ? "rg-bin-hit" : ""}>
              <rect x={i * BIN_W + 2} y={LABEL_TOP + 2} width={BIN_W - 4} height={H - LABEL_TOP - 4} rx="8" fill={`url(#cd-bin-${b.label ? b.tone : "none"})`} className="rg-bin" />
              {b.label ? (
                <text x={binX(i)} y={LABEL_TOP + 27} textAnchor="middle" dominantBaseline="middle" className={`rg-bin-label is-${b.tone} ${sizeClass(b.label)}`}>
                  {b.label.length > 6 ? `${b.label.slice(0, 5)}…` : b.label}
                </text>
              ) : (
                <path d={`M${binX(i) - 5} ${LABEL_TOP + 22} l10 10 m0 -10 l-10 10`} stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
              )}
            </g>
          ))}
          {Array.from({ length: COIN_BINS - 1 }, (_, i) => (
            <rect key={i} x={(i + 1) * BIN_W - 1.5} y={BIN_TOP} width="3" height={H - BIN_TOP} rx="1.5" fill="#ffd23a" opacity="0.85" />
          ))}
          {trail.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={COIN_R * 0.9} fill="#ffd84a" opacity={0.08 + i * 0.06} />
          ))}
          {coin && (
            <g transform={`translate(${coin.x} ${coin.y})`}>
              <circle r={COIN_R} cy="1.5" fill="#7a4a00" />
              <circle r={COIN_R} fill="url(#cd-coin)" />
              <circle r={COIN_R * 0.72} fill="none" stroke="#b97500" strokeWidth="1.2" opacity="0.7" />
              <text textAnchor="middle" dominantBaseline="central" className="rg-coin-glyph">£</text>
            </g>
          )}
        </svg>
      </div>
    </>
  );

  return (
    <>
      {flat}
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
