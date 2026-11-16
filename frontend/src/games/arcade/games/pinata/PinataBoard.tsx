import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "../types";
import { generatePinata, PINATA_HITS, type PinataSweet } from "../generators";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./pinata.css";

const BREAK_MS = 1900;

/* An original five-point star piñata covered in paper fringe, with tassels on its points. */
const STAR = "M100 8 L124 70 L190 74 L138 114 L156 180 L100 142 L44 180 L62 114 L10 74 L76 70 Z";
const BANDS = ["#ff4fa8", "#ffd23a", "#3fd0f7", "#b86bff", "#ff8a3d", "#5be37d"];
const TIPS: [number, number][] = [[100, 8], [190, 74], [156, 180], [44, 180], [10, 74]];
/** Cracks drawn one more per hit. */
const CRACKS = [
  "M100 60 l-8 14 l9 8 l-6 12",
  "M128 96 l12 6 l-4 12 l14 4",
  "M74 104 l-12 10 l8 8 l-10 10",
  "M104 128 l6 14 l-8 8 l4 14",
];

function PinataArt({ hits, half }: { hits: number; half?: "left" | "right" }) {
  return (
    <svg viewBox="0 0 200 200" className="rg-pinata-art" aria-hidden="true">
      <defs>
        <clipPath id="pn-star">
          <path d={STAR} />
        </clipPath>
        <clipPath id="pn-left">
          <path d="M0 0 H100 L94 60 L106 100 L92 140 L100 200 H0 Z" />
        </clipPath>
        <clipPath id="pn-right">
          <path d="M200 0 H100 L94 60 L106 100 L92 140 L100 200 H200 Z" />
        </clipPath>
        <radialGradient id="pn-shade" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#2b0f45" stopOpacity="0.35" />
        </radialGradient>
        <pattern id="pn-fringe" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L4 0 L8 8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        </pattern>
      </defs>
      <g clipPath={half ? `url(#pn-${half})` : undefined}>
        {TIPS.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            {[-6, 0, 6].map((dx, k) => (
              <path key={k} d={`M0 0 q${dx} 14 ${dx * 1.6} 26`} stroke={BANDS[(i + k) % BANDS.length]} strokeWidth="3" fill="none" strokeLinecap="round" className="rg-pinata-tassel" />
            ))}
          </g>
        ))}
        <g clipPath="url(#pn-star)">
          {BANDS.concat(BANDS).map((c, i) => (
            <rect key={i} x="0" y={i * 16} width="200" height="17" fill={c} />
          ))}
          <rect width="200" height="200" fill="url(#pn-fringe)" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M0 ${i * 16 + 16} q5 -5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0`} fill="none" stroke="rgba(43,15,69,0.25)" strokeWidth="1.4" />
          ))}
          <rect width="200" height="200" fill="url(#pn-shade)" />
          {CRACKS.slice(0, Math.max(0, hits - 0)).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#2b0f45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="rg-pinata-crack" />
          ))}
        </g>
        <path d={STAR} fill="none" stroke="rgba(43,15,69,0.35)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="86" cy="96" r="6" fill="#2b0f45" />
        <circle cx="114" cy="96" r="6" fill="#2b0f45" />
        <circle cx="88" cy="94" r="2" fill="#fff" />
        <circle cx="116" cy="94" r="2" fill="#fff" />
        <path d="M88 112 Q100 122 112 112" fill="none" stroke="#2b0f45" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Sweet({ s, i }: { s: PinataSweet; i: number }) {
  const style = { "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, "--spin": `${s.spin}deg`, animationDelay: `${(i % 6) * 25}ms` } as React.CSSProperties;
  return (
    <span className={`rg-sweet is-${s.colour} is-${s.shape}`} style={style} aria-hidden="true">
      {s.shape === "star" ? (
        <svg viewBox="0 0 20 20">
          <path d="M10 1 L12.6 7.2 L19 7.6 L14 11.8 L15.6 18.4 L10 14.8 L4.4 18.4 L6 11.8 L1 7.6 L7.4 7.2 Z" />
        </svg>
      ) : (
        <i />
      )}
    </span>
  );
}

type Phase = "ready" | "playing" | "broken";

export function PinataBoard({ ticket, seed, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generatePinata(ticket.prize, seed), [ticket.prize, seed]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hits, setHits] = useState(0);

  useEffect(() => {
    if (phase !== "broken") return;
    const t = setTimeout(onReveal, reducedMotion ? 500 : BREAK_MS);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion]);

  const hit = () => {
    if (phase === "broken") return;
    if (phase === "ready") setPhase("playing");
    if (!reducedMotion) navigator.vibrate?.(hits + 1 >= PINATA_HITS ? [20, 30, 40] : 12);
    const n = hits + 1;
    setHits(n);
    if (n >= PINATA_HITS) setPhase("broken");
  };

  const swing = hits > 0 ? layout.swings[(hits - 1) % layout.swings.length] : 0;
  const broken = phase === "broken";

  let prompt: React.ReactNode = null;
  if (broken) prompt = <GamePrompt title={layout.label ? `${layout.label}!` : "No prize this time"} tone={layout.label ? "pink" : "ink"} />;
  else if (phase === "playing") prompt = <GamePrompt title={PINATA_HITS - hits === 1 ? "One more hit!" : "Keep hitting!"} tone="pink" sub={`${PINATA_HITS - hits} hits to break it`} />;

  return (
    <>
      <div className={`rg-pinata is-${phase}`}>
        <div className="rg-pinata-stage">
          <span className="rg-pinata-rope" aria-hidden="true" />
          {!broken ? (
            <button
              type="button"
              className="rg-pinata-swing"
              style={{ "--swing": `${swing}deg` } as React.CSSProperties}
              onPointerDown={(e) => {
                e.preventDefault();
                hit();
              }}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && hit()}
              aria-label={`Hit the piñata (${PINATA_HITS - hits} hits to break it)`}
            >
              <span key={hits} className={`rg-pinata-body ${hits ? "is-hit" : ""}`}>
                <PinataArt hits={hits} />
              </span>
              {hits > 0 && (
                <span key={`b${hits}`} className={`rg-pinata-bat ${swing < 0 ? "is-left" : ""}`} aria-hidden="true">
                  <svg viewBox="0 0 120 24">
                    <defs>
                      <linearGradient id="pn-bat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ffe08a" />
                        <stop offset="1" stopColor="#c47f00" />
                      </linearGradient>
                    </defs>
                    <rect x="2" y="5" width="116" height="14" rx="7" fill="url(#pn-bat)" />
                    {[18, 40, 62, 84].map((x) => (
                      <rect key={x} x={x} y="5" width="9" height="14" fill="#ff2d95" />
                    ))}
                  </svg>
                </span>
              )}
            </button>
          ) : (
            <div className="rg-pinata-burst" aria-hidden="true">
              <span className="rg-pinata-half is-left">
                <PinataArt hits={PINATA_HITS} half="left" />
              </span>
              <span className="rg-pinata-half is-right">
                <PinataArt hits={PINATA_HITS} half="right" />
              </span>
              <span className="rg-pinata-pop" />
              {layout.sweets.map((s, i) => (
                <Sweet key={i} s={s} i={i} />
              ))}
            </div>
          )}
          {broken && (
            <div className={`rg-pinata-prize ${layout.label ? "is-win" : ""}`} role="status">
              {layout.label ?? "No prize"}
            </div>
          )}
        </div>
        <div className="rg-pinata-count" aria-hidden="true">
          {Array.from({ length: PINATA_HITS }, (_, i) => (
            <i key={i} className={i < hits ? "is-done" : ""} />
          ))}
        </div>
      </div>
      {phase === "ready" ? (
        <div className="rg-pinata-controls">
          <button type="button" className="rg-cta" onClick={hit}>
            HIT IT!
          </button>
          <p className="rg-note">
            Tap the piñata {PINATA_HITS} times to break it open. {RESULT_SET_NOTE}
          </p>
        </div>
      ) : (
        prompt
      )}
    </>
  );
}
