import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { COIN_BINS, generateCoinDrop } from "../../games/generators";
import { BIN_TOP, BIN_W, COIN_R, H, LABEL_TOP, PEG_R, ROWS, ROW_DY, ROW_Y0, W, binX, pegsFor, useCoinDrop } from "../../games/coinDrop/useCoinDrop";
import { sizeClass } from "../../games/symbols";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound, useSoundLater } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import { Scene3D } from "../../three/Scene3D";
import { buildCoinDropScene, type CoinDropState } from "../../three/coinDropScene";
import { DROP_IT_SKIN_3D } from "./dropIt3d";
import "../../games/coinDrop/coinDrop.css";
import "../shared/themed.css";
import "./dropIt.css";

/**
 * Drop It Like It's Hot, a skin of Coin Drop: a gold coin dropped down a
 * graffiti wall of gold studs into a row of speakers. The bins, their prizes and
 * where the coin may land all come from generateCoinDrop, exactly as the classic
 * board shows them; aiming only picks the nearest of those bins.
 */

/** "DROP IT · LIKE IT'S · HOT": dripping gold, with a flaming pink HOT. */
function Title() {
  const drips = [
    [44, 10], [70, 16], [104, 8], [138, 14], [176, 12], [208, 18], [246, 9], [276, 13],
  ];
  return (
    <svg viewBox="0 0 320 112" className="rg-themed-sign rg-di-title" role="img" aria-label="Drop It Like It's Hot">
      <defs>
        <linearGradient id="rg-di-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
        <linearGradient id="rg-di-hot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd0ea" />
          <stop offset="0.5" stopColor="#ff2d95" />
          <stop offset="1" stopColor="#c4006a" />
        </linearGradient>
      </defs>
      {/* Gold paint running down from DROP IT. */}
      {drips.map(([x, len], i) => (
        <path key={i} className="rg-di-drip" style={{ "--d": `${(i % 4) * 0.5}s` } as CSSProperties} d={`M${x - 3} 40 V${44 + len} a3 3 0 0 0 6 0 V40 Z`} fill="url(#rg-di-gold)" stroke="#141414" strokeWidth="2" />
      ))}
      <text x="160" y="44" textAnchor="middle" className="rg-di-title-drop">DROP IT</text>
      <text x="96" y="78" textAnchor="middle" className="rg-di-title-like">LIKE IT'S</text>
      <g className="rg-di-flame" aria-hidden="true">
        <path d="M232 104 C206 104 202 80 214 66 C214 76 220 78 222 74 C220 62 228 52 238 48 C234 60 244 64 246 74 C250 70 250 64 248 60 C262 72 260 104 232 104 Z" fill="#ff7a1a" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M232 102 C220 102 218 90 224 82 C226 88 230 88 230 84 C232 78 236 74 240 72 C238 80 246 84 244 92 C242 100 238 102 232 102 Z" fill="#ffd23f" />
      </g>
      <text x="228" y="104" textAnchor="middle" className="rg-di-title-hot">HOT</text>
    </svg>
  );
}

/** Equaliser bars that bounce to the beat, faster while the coin drops. */
function Equaliser({ side }: { side: "left" | "right" }) {
  return (
    <span className={`rg-di-eq is-${side}`} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} style={{ "--k": `${((i * 7 + (side === "left" ? 0 : 3)) % 5) * -0.13}s` } as CSSProperties} />
      ))}
    </span>
  );
}

export function DropItBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateCoinDrop(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const { aim, setAim, phase, coin, trail, landedBin, drop, railRef, trackRef, aimFromPointer } = useCoinDrop(layout, seed, reducedMotion, onReveal, 1500);
  const landed = landedBin != null ? layout.bins[landedBin] : null;
  const won = phase === "landed" && !!landed?.label;

  // Studs the coin has touched on this drop stay lit.
  const lit = useRef(new Set<string>());
  if (phase === "aim") lit.current.clear();
  if (coin && phase === "dropping") {
    for (let r = 0; r < ROWS; r++) {
      const y = ROW_Y0 + r * ROW_DY;
      if (Math.abs(coin.y - y) > PEG_R + COIN_R + 4) continue;
      pegsFor(r).forEach((x, i) => {
        if (Math.hypot(coin.x - x, coin.y - y) < PEG_R + COIN_R + 4) lit.current.add(`${r}-${i}`);
      });
    }
  }

  const later = useSoundLater();
  useEffect(() => {
    if (phase === "landed") {
      playSound("bass");
      if (won) later("clink", 260);
    }
  }, [phase, won, later]);

  const dropCoin = () => {
    if (phase !== "aim") return;
    if (!reducedMotion) navigator.vibrate?.(12);
    drop();
  };

  const flat = (
    <>
      <div className={`rg-di is-${phase} ${won ? "is-won" : ""}`}>
        <Equaliser side="left" />
        <Equaliser side="right" />
        <Title />

        <div
          className="rg-coin-rail rg-di-rail"
          ref={railRef}
          onPointerDown={(e) => {
            if (phase !== "aim" || (e.target as HTMLElement).closest("button")) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            aimFromPointer(e);
          }}
          onPointerMove={(e) => phase === "aim" && e.currentTarget.hasPointerCapture(e.pointerId) && aimFromPointer(e)}
        >
          <button type="button" className="rg-rail-arrow rg-di-arrow" onClick={() => setAim((a) => Math.max(0, a - 1))} disabled={phase !== "aim"} aria-label="Aim left">
            <svg viewBox="0 0 20 20"><path d="M13 4 L6 10 L13 16 Z" fill="currentColor" /></svg>
          </button>
          <div className="rg-rail-track rg-di-track" ref={trackRef}>
            {phase === "aim" ? (
              <button type="button" className="rg-rail-coin rg-di-coin" style={{ left: `${(aim / (COIN_BINS - 1)) * 100}%` }} onClick={dropCoin} aria-label={`Drop the coin above slot ${aim + 1}`}>
                £
              </button>
            ) : (
              <span className="rg-rail-label rg-di-rail-label">{phase === "dropping" ? "DROPPING…" : won ? "HOT!" : "DROPPED"}</span>
            )}
          </div>
          <button type="button" className="rg-rail-arrow rg-di-arrow" onClick={() => setAim((a) => Math.min(COIN_BINS - 1, a + 1))} disabled={phase !== "aim"} aria-label="Aim right">
            <svg viewBox="0 0 20 20"><path d="M7 4 L14 10 L7 16 Z" fill="currentColor" /></svg>
          </button>
        </div>

        <div className={`rg-coin-board rg-di-board is-${phase}`} onClick={dropCoin}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={landedBin != null ? `Coin landed on ${layout.bins[landedBin].label ?? "no prize"}` : "Coin drop board"}>
            <defs>
              <radialGradient id="rg-di-stud" cx="0.35" cy="0.3" r="0.8">
                <stop offset="0" stopColor="#fff6c2" />
                <stop offset="0.5" stopColor="#ffcc33" />
                <stop offset="1" stopColor="#a86c00" />
              </radialGradient>
              <radialGradient id="rg-di-stud-lit" cx="0.35" cy="0.3" r="0.8">
                <stop offset="0" stopColor="#ffe0f0" />
                <stop offset="0.5" stopColor="#ff4fb0" />
                <stop offset="1" stopColor="#a8005a" />
              </radialGradient>
              <radialGradient id="rg-di-coin" cx="0.35" cy="0.3" r="0.8">
                <stop offset="0" stopColor="#fff6c2" />
                <stop offset="0.5" stopColor="#ffd23f" />
                <stop offset="1" stopColor="#c98200" />
              </radialGradient>
              <radialGradient id="rg-di-cone" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#555" />
                <stop offset="0.3" stopColor="#1a1a1a" />
                <stop offset="0.75" stopColor="#2c2c2c" />
                <stop offset="1" stopColor="#0c0c0c" />
              </radialGradient>
            </defs>

            {/* Spray-paint on the wall. */}
            <g className="rg-di-tags" aria-hidden="true">
              <text x="62" y="120" transform="rotate(-12 62 120)" className="rg-di-tag is-pink">GG</text>
              <text x="252" y="196" transform="rotate(10 252 196)" className="rg-di-tag is-blue">£££</text>
              <path d="M40 220 l8 -16 l8 12 l8 -14 l8 18 Z" className="rg-di-tag-crown" />
              <path d="M262 92 l3 8 l9 0 l-7 5 l3 9 l-8 -6 l-8 6 l3 -9 l-7 -5 l9 0 Z" className="rg-di-tag-star" />
            </g>

            {Array.from({ length: ROWS }, (_, r) =>
              pegsFor(r).map((x, i) => {
                const on = lit.current.has(`${r}-${i}`);
                return (
                  <g key={`${r}-${i}`} className={`rg-di-stud ${on ? "is-lit" : ""}`}>
                    {on && <circle cx={x} cy={ROW_Y0 + r * ROW_DY} r={PEG_R + 5} className="rg-di-stud-glow" />}
                    <circle cx={x} cy={ROW_Y0 + r * ROW_DY} r={PEG_R} fill={on ? "url(#rg-di-stud-lit)" : "url(#rg-di-stud)"} stroke="#141414" strokeWidth="2" />
                  </g>
                );
              }),
            )}

            {/* The speakers. The one the coin lands in thumps. */}
            {layout.bins.map((b, i) => {
              const hit = landedBin === i;
              return (
                <g key={i} className={`rg-di-bin ${hit ? "is-hit" : ""} ${hit && b.label ? "is-win" : ""}`}>
                  <rect x={i * BIN_W} y={BIN_TOP} width={BIN_W} height={LABEL_TOP - BIN_TOP} className="rg-di-speaker-box" />
                  <g className="rg-di-cone" style={{ transformOrigin: `${binX(i)}px ${(BIN_TOP + LABEL_TOP) / 2}px` } as CSSProperties}>
                    <circle cx={binX(i)} cy={(BIN_TOP + LABEL_TOP) / 2} r="15" fill="#3a3a3a" stroke="#141414" strokeWidth="2" />
                    <circle cx={binX(i)} cy={(BIN_TOP + LABEL_TOP) / 2} r="12" fill="url(#rg-di-cone)" />
                    <circle cx={binX(i)} cy={(BIN_TOP + LABEL_TOP) / 2} r="4" fill={b.label ? "#ffcc33" : "#666"} stroke="#141414" strokeWidth="1.2" />
                  </g>
                  <rect x={i * BIN_W} y={LABEL_TOP} width={BIN_W} height={H - LABEL_TOP} className={`rg-di-plate is-${b.label ? b.tone : "none"}`} />
                  {b.label ? (
                    <text x={binX(i)} y={LABEL_TOP + 27} textAnchor="middle" dominantBaseline="middle" className={`rg-bin-label rg-di-label ${sizeClass(b.label)}`}>
                      {b.label.length > 6 ? `${b.label.slice(0, 5)}…` : b.label}
                    </text>
                  ) : (
                    <path d={`M${binX(i) - 7} ${LABEL_TOP + 20} l14 14 m0 -14 l-14 14`} stroke="#8a8aa0" strokeWidth="2.4" strokeLinecap="round" />
                  )}
                  {hit && !reducedMotion && (
                    <>
                      <circle cx={binX(i)} cy={(BIN_TOP + LABEL_TOP) / 2} r="15" className="rg-di-wave" />
                      <circle cx={binX(i)} cy={(BIN_TOP + LABEL_TOP) / 2} r="15" className="rg-di-wave is-late" />
                    </>
                  )}
                </g>
              );
            })}
            {Array.from({ length: COIN_BINS - 1 }, (_, i) => (
              <line key={i} x1={(i + 1) * BIN_W} x2={(i + 1) * BIN_W} y1={BIN_TOP} y2={H} stroke="#141414" strokeWidth="3" />
            ))}
            <line x1="0" x2={W} y1={BIN_TOP} y2={BIN_TOP} stroke="#141414" strokeWidth="3" />
            <line x1="0" x2={W} y1={LABEL_TOP} y2={LABEL_TOP} stroke="#141414" strokeWidth="3" />

            {/* A blazing trail behind the coin. */}
            {trail.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={COIN_R * (0.55 + i * 0.12)} className="rg-di-trail" opacity={0.18 + i * 0.14} />
            ))}
            {coin && (
              <g transform={`translate(${coin.x} ${coin.y})`} className="rg-di-drop">
                <circle r={COIN_R + 3} className="rg-di-coin-glow" />
                <circle r={COIN_R} fill="url(#rg-di-coin)" stroke="#141414" strokeWidth="2.5" />
                <circle r={COIN_R - 4} fill="none" stroke="#b37800" strokeWidth="1.2" />
                <text textAnchor="middle" dominantBaseline="central" className="rg-coin-glyph">£</text>
              </g>
            )}
          </svg>

          {won && !reducedMotion && landedBin != null && (
            <div className="rg-di-pop" style={{ left: `${(binX(landedBin) / W) * 100}%` }} aria-hidden="true">
              {Array.from({ length: 14 }, (_, k) => (
                <i
                  key={k}
                  className={k % 3 === 0 ? "is-coin" : "is-note"}
                  style={{ "--a": `${-90 + ((k * 29) % 120) - 60}deg`, "--d": `${80 + ((k * 31) % 70)}px`, "--r": `${((k * 61) % 400) - 200}deg`, "--w": `${(k % 5) * 0.05}s` } as CSSProperties}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
  const state: CoinDropState = { phase, aim, coin, landedBin, setAim, drop: dropCoin };

  return (
    <>
      <Scene3D
        state={state}
        setup={(ctx) => buildCoinDropScene(ctx, DROP_IT_SKIN_3D, layout)}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={1.28}
        fallback={flat}
        label="Drop It Like It's Hot coin drop"
      />
      <div className="rg3-controls">
        <button type="button" className="rg3-btn is-cyan rg3-arrow" onClick={() => setAim((a) => Math.max(0, a - 1))} disabled={phase !== "aim"} aria-label="Aim left">
          ◀
        </button>
        <button type="button" className="rg3-btn rg3-grab" onClick={dropCoin} disabled={phase !== "aim"}>
          DROP
        </button>
        <button type="button" className="rg3-btn is-cyan rg3-arrow" onClick={() => setAim((a) => Math.min(COIN_BINS - 1, a + 1))} disabled={phase !== "aim"} aria-label="Aim right">
          ▶
        </button>
      </div>
      {phase === "aim" ? (
        <GamePrompt title="Slide to aim, tap to drop" sub={RESULT_SET_NOTE} />
      ) : phase === "dropping" ? (
        <GamePrompt title="Bouncing…" tone="pink" />
      ) : (
        <GamePrompt title={landed?.label ? `${landed.label}!` : "No win"} tone={landed?.label ? "pink" : "ink"} />
      )}
      <SoundToggle />
    </>
  );
}
