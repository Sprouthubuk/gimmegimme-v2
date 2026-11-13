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
