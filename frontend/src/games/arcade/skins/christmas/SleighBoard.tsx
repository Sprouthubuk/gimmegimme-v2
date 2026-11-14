import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BoardProps } from "../../games/types";
import { generateWheel, WHEEL_SEGMENTS, type WheelSegment } from "../../games/generators";
import { createRng } from "../../rng";
import { Mascot } from "../../shell/Mascot";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "./sleigh.css";
import { Scene3D } from "../../three/Scene3D";
import { buildSleighScene, type SleighState3D } from "./sleigh3d";

const SEG = 360 / WHEEL_SEGMENTS;
/** The ring of rooftops: inner and outer edge of the twelve panels. */
const ROOF_IN = 31;
const ROOF_OUT = 64;
/** Where each prize is written, and where the chimneys stand. */
const LABEL_R = 48;
const CHIMNEY_R = 61;
/** The sleigh's track, between the snowy rooftops and the silver rim. */
const FLIGHT_R = 80;
/** Degrees a second while it circles: a lap about every three and a half seconds. */
const CRUISE = 105;

/** Dasher's colours: midnight navy, silver, northern-lights teal and gold. Each segment tone gets a roof. */
const ROOF: Record<WheelSegment["tone"], { fill: string; shine: string; ink: string }> = {
  yellow: { fill: "#e6b422", shine: "#fbe7a1", ink: "#141414" },
  cyan: { fill: "#149e8a", shine: "#6fe0c8", ink: "#ffffff" },
  pink: { fill: "#b9c3d0", shine: "#eef2f7", ink: "#141414" },
  white: { fill: "#22356b", shine: "#3a5296", ink: "#a9b6cf" },
};

const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};
const f = (n: number) => n.toFixed(2);

/** One rooftop panel: an annular slice of the ring, centred on segment i. */
function roofPath(i: number) {
  const a0 = i * SEG - SEG / 2;
  const a1 = i * SEG + SEG / 2;
  const [x0, y0] = polar(a0, ROOF_OUT);
  const [x1, y1] = polar(a1, ROOF_OUT);
  const [x2, y2] = polar(a1, ROOF_IN);
  const [x3, y3] = polar(a0, ROOF_IN);
  return `M${f(x0)} ${f(y0)} A${ROOF_OUT} ${ROOF_OUT} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${ROOF_IN} ${ROOF_IN} 0 0 0 ${f(x3)} ${f(y3)} Z`;
}

/** Roof tiles: three arcs across each panel, like rows of slates. */
function tilePath(i: number) {
  const a0 = i * SEG - SEG / 2 + 1;
  const a1 = i * SEG + SEG / 2 - 1;
  return [40, 50, 58]
    .map((r) => {
      const [x0, y0] = polar(a0, r);
      const [x1, y1] = polar(a1, r);
      return `M${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
    })
    .join(" ");
}

/** One cartoon reindeer, facing right, centred on its body. Dasher wears a gold collar and bell. */
function Reindeer({ x, y, dasher = false }: { x: number; y: number; dasher?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className="rg-reindeer">
      <path d="M10.6 -7.4 L9.4 -11.6 M9.8 -10 L7.6 -11 M12 -7.4 L13.4 -11.4 M13 -9.8 L15 -10.6" stroke="#5b3a1e" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <g className="rg-reindeer-legs" stroke="#5b3a1e" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 2 L8.5 4.6" />
        <path d="M2.5 2.4 L5.5 6.4" />
        <path d="M-3.5 2.2 L-8 4.4" />
        <path d="M-4.8 1.6 L-9.2 1.2" />
      </g>
      <path
        d="M-6.4 0 C-6.4 -3.4 -2.6 -4 1 -3.6 C3 -3.4 4.4 -3.2 5.6 -4.4 L8.6 -7.2 C9.6 -8.2 11.4 -8.2 12.6 -7.2 L14.2 -6 C14.8 -5.4 14.4 -4.6 13.6 -4.6 L11 -4.4 L7.4 0.6 C6.4 2.6 4.6 3.2 2 3.2 L-3 3.2 C-5.4 3.2 -6.4 2 -6.4 0 Z"
        fill="#c58b4e"
        stroke="#141414"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M-4.6 -1.6 C-3 -2.8 0 -2.8 2 -2.4" stroke="#e8b77e" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M-6.2 -0.6 L-8 -2.4" stroke="#141414" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="11.6" cy="-6.2" r="0.6" fill="#141414" />
      <circle cx="14.2" cy="-5.2" r="0.9" fill="#3a2414" />
      {dasher && (
        <>
          <path d="M7.2 -5.2 Q8.6 -3.2 10.4 -4.6" stroke="#e6b422" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="8.9" cy="-3.1" r="1.2" fill="#ffd23f" stroke="#141414" strokeWidth="0.6" />
        </>
      )}
    </g>
  );
}

/** The sleigh and its team, facing right. */
function Sleigh() {
  return (
    <g className="rg-sleigh">
      <g className="rg-sleigh-trail" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <path
            key={k}
            d="M0 -2.2 L0.6 -0.6 L2.2 0 L0.6 0.6 L0 2.2 L-0.6 0.6 L-2.2 0 L-0.6 -0.6 Z"
            transform={`translate(${-27 - k * 6.5} ${3 + Math.sin(k * 1.3) * 3}) scale(${1.2 - k * 0.12})`}
            fill={k % 2 ? "#dff6ff" : "#ffe27a"}
            style={{ animationDelay: `${k * 0.1}s` }}
          />
        ))}
      </g>
      <path d="M14 -3 C20 -4 24 -2 27 -1 M27 -1 C33 -2 37 -1 41 -1" stroke="#e6b422" strokeWidth="0.9" fill="none" />
      <Reindeer x={28} y={-1} />
      <Reindeer x={43} y={-2} dasher />
      <path d="M-23 10.5 L9 10.5 C15 10.5 18.4 7.6 18.4 3.6 C18.4 0.8 15.6 -0.2 14.4 2" stroke="#141414" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M-23 10.5 L9 10.5 C15 10.5 18.4 7.6 18.4 3.6 C18.4 0.8 15.6 -0.2 14.4 2" stroke="#e6b422" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M-14 6.5 L-15 10.5 M3 6.5 L4 10.5" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
      <path d="M-14 6.5 L-15 10.5 M3 6.5 L4 10.5" stroke="#e6b422" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M-15 -4 C-19 -10 -14.5 -17 -8 -15.2 C-2.6 -13.6 -2 -8 -4.6 -4 Z" fill="#19c3a8" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M-12.6 -11.6 C-11.8 -13.4 -10.2 -14.2 -8.6 -14" stroke="#9ff3e3" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M-9.4 -15.4 L-8.6 -17.4 M-9.4 -15.4 L-11.2 -16.8" stroke="#e6b422" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="-4.5" y="-10" width="7.5" height="6.5" rx="1" fill="#ffd23f" stroke="#141414" strokeWidth="1.3" />
      <path d="M-0.75 -10 V-3.5 M-4.5 -6.75 H3" stroke="#19c3a8" strokeWidth="1.2" />
      <path
        d="M-20 6 C-24 -3 -22.5 -11.5 -14.5 -12.8 C-12.6 -6.4 -9.4 -4.2 -4 -4.2 L6 -4.2 C10 -4.2 12 -7.8 12.2 -12 C17 -11.2 19.4 -6.4 16.6 -0.4 C14.6 4.6 10.4 7 4.4 7 L-14 7 C-17 7 -18.8 7 -20 6 Z"
        fill="url(#rg-sleigh-body)"
        stroke="#141414"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M-13.6 -11 C-11.8 -6 -8.8 -3 -4 -3 L6 -3 C9.6 -3 12 -6.2 12.6 -10.2" stroke="#e6b422" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M-18.6 2.4 C-20.4 -3 -19.6 -8.4 -16 -10" stroke="#ffffff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.75" />
      <path d="M-11 2.6 C-8 0.6 -4 0.6 -1 2.6 C2 4.6 6 4.6 9 2.6" stroke="#e6b422" strokeWidth="1" fill="none" opacity="0.9" />
    </g>
  );
}

type Phase = "flying" | "stopping" | "landed";

/**
 * Christmas skin of Spin the Wheel: Dasher's Dosh Drop. The same twelve segments from
 * generateWheel are twelve snowy rooftops round a ring, each with its chimney. Dasher pulls
 * the sleigh round the track above them until the player taps "Stop the sleigh!", then it
 * glides to a halt over the chimney the result was already set to, and on a win a burst of
 * gold coins pops out of it. Tapping sooner or later changes nothing: the landing place is
 * fixed before the board appears.
 */
export function SleighBoard({ ticket, seed, decoys, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateWheel(ticket.prize, decoys, seed), [ticket.prize, decoys, seed]);
  const [phase, setPhase] = useState<Phase>("flying");
  const sleigh = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const height = useRef(FLIGHT_R);

  // Where over the target rooftop it comes to rest: close to the chimney, not dead centre every time.
  const restAt = useMemo(() => {
    const rng = createRng(`sleigh-land:${seed}`);
    return layout.target * SEG + (rng() - 0.5) * SEG * 0.25;
  }, [seed, layout.target]);

  // The sleigh goes round the ring but always stays upright, facing the way it is going. At the
  // two sides (where it travels straight up or down) it turns round smoothly, and it leans a
  // little into the curve. `bob` is a gentle float; `height` lets it settle onto the chimney.
  const draw = (deg: number, bob = 0, height3d = FLIGHT_R) => {
    angle.current = deg;
    height.current = height3d;
    const a = (deg * Math.PI) / 180;
    const x = height3d * Math.sin(a);
    const y = -height3d * Math.cos(a) + bob;
    const turn = Math.max(-1, Math.min(1, Math.cos(a) / 0.28));
    const sx = 0.92 * (turn >= 0 ? Math.max(0.34, turn) : Math.min(-0.34, turn));
    let lean = deg % 360;
    if (Math.cos(a) < 0) lean -= 180;
    lean = ((lean + 540) % 360) - 180;
    lean = Math.max(-18, Math.min(18, lean));
    sleigh.current?.setAttribute("transform", `translate(${f(x)} ${f(y)}) rotate(${f(lean)}) scale(${sx.toFixed(3)} 0.92)`);
  };

  // Circling. Drawn straight onto the SVG each frame, so React does not re-render 60 times a second.
  useEffect(() => {
    if (phase !== "flying" || reducedMotion) return;
    let raf = 0;
    let prev: number | null = null;
    const tick = (now: number) => {
      if (prev !== null) draw((angle.current + (CRUISE * Math.min(50, now - prev)) / 1000) % 360, Math.sin(now / 260) * 1.6);
      prev = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion]);

  const stop = () => {
    if (phase !== "flying") return;
    playSound("bells");
    if (reducedMotion) {
      draw(restAt);
      setPhase("landed");
      return;
    }
    setPhase("stopping");
  };

  // Gliding to a stop: steady braking from cruising speed over a little more than half a lap,
  // ending over the target chimney (between about 3 and 9 seconds).
  useEffect(() => {
    if (phase !== "stopping") return;
    const from = angle.current;
    let to = restAt;
    while (to < from + 160) to += 360;
    const distance = to - from;
    const duration = (2 * distance) / CRUISE; // seconds: it starts at exactly cruising speed
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const u = Math.min(1, (now - start) / 1000 / duration);
      draw(from + distance * (1 - (1 - u) * (1 - u)), Math.sin(now / 260) * 1.6 * (1 - u));
      if (u < 1) raf = requestAnimationFrame(tick);
      else setPhase("landed");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, restAt]);

  useEffect(() => {
    if (phase !== "landed") return;
    // Drop gently onto the chimney.
    let raf = 0;
    if (reducedMotion) draw(restAt, 0, FLIGHT_R - 6);
    else {
      let start: number | null = null;
      const tick = (now: number) => {
        start ??= now;
        const u = Math.min(1, (now - start) / 500);
        draw(restAt, 0, FLIGHT_R - 6 * (1 - (1 - u) * (1 - u)));
        if (u < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    playSound("chime");
    const t = setTimeout(onReveal, reducedMotion ? 300 : 1500);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [phase, onReveal, reducedMotion, restAt]);

  const landed = layout.segments[layout.target];
  const won = phase === "landed" && landed.kind === "prize";
  const stars = useMemo(() => {
    const rng = createRng(`sleigh-stars:${seed}`);
    return Array.from({ length: 22 }, () => {
      const a = rng() * 360;
      const r = 68 + rng() * 22;
      const [x, y] = polar(a, r);
      return { x, y, r: 0.5 + rng() * 0.9, d: rng() * 2.4 };
    });
  }, [seed]);
  const [cx, cy] = polar(layout.target * SEG, CHIMNEY_R + 4);

  const state3d: SleighState3D = { phase, angle, height, segments: layout.segments, target: layout.target, stop };
  const flat = (
    <>
      <div className="rg-xmas-title rg-sleigh-title">DASHER'S DOSH DROP</div>
      <div className={`rg-sleigh-ring is-${phase}`}>
        <svg className="rg-sleigh-svg" viewBox="-106 -106 212 212" role="img" aria-label={phase === "landed" ? `Landed on ${landed.kind === "none" ? "no win" : landed.label}` : "Dasher pulling the sleigh round the rooftops"}>
          <defs>
            <radialGradient id="rg-sleigh-sky" cx="50%" cy="38%" r="62%">
              <stop offset="0" stopColor="#1f3672" />
              <stop offset="1" stopColor="#0a1330" />
            </radialGradient>
            <linearGradient id="rg-sleigh-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f2f5f9" />
              <stop offset="0.5" stopColor="#b9c3d0" />
              <stop offset="1" stopColor="#7d899c" />
            </linearGradient>
            <linearGradient id="rg-sleigh-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b5aa8" />
              <stop offset="0.45" stopColor="#1d2d5c" />
              <stop offset="1" stopColor="#0d1633" />
            </linearGradient>
            <linearGradient id="rg-sleigh-aurora" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#19c3a8" stopOpacity="0" />
              <stop offset="0.35" stopColor="#19c3a8" stopOpacity="0.5" />
              <stop offset="0.7" stopColor="#7cf0c4" stopOpacity="0.35" />
              <stop offset="1" stopColor="#7cf0c4" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="rg-sleigh-moon" cx="40%" cy="35%" r="70%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#d6deea" />
            </radialGradient>
          </defs>

          {/* silver rim with lights, and the night sky inside it */}
          <circle r="104" fill="url(#rg-sleigh-rim)" stroke="#141414" strokeWidth="3" />
          {Array.from({ length: 24 }, (_, i) => {
            const [x, y] = polar(i * 15 + 7.5, 99.5);
            return <circle key={i} cx={x} cy={y} r="2.5" fill={["#e6b422", "#ffffff", "#19c3a8", "#ffffff"][i % 4]} stroke="#141414" strokeWidth="1" className="rg-sleigh-bulb" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />;
          })}
          <circle r="95" fill="url(#rg-sleigh-sky)" stroke="#141414" strokeWidth="2.5" />
          <path className="rg-sleigh-aurora" d="M-92 -30 C-60 -70 -24 -34 6 -60 C38 -86 66 -48 94 -66 L94 -50 C66 -30 38 -70 6 -44 C-24 -18 -60 -54 -92 -12 Z" fill="url(#rg-sleigh-aurora)" />
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="rg-sleigh-star" style={{ animationDelay: `${s.d}s` }} />
          ))}
          {/* the track the sleigh follows: a faint dashed sparkle line */}
          <circle r={FLIGHT_R} fill="none" stroke="#dfe9ff" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="1.5 5" />

          {/* the twelve rooftops */}
          <g className="rg-sleigh-roofs">
            {layout.segments.map((s, i) => {
              const tone = ROOF[s.tone];
              const lit = phase === "landed" && i === layout.target;
              const [lx, ly] = polar(i * SEG, LABEL_R);
              const label = s.label.length > 7 ? `${s.label.slice(0, 6)}…` : s.label;
              return (
                <g key={i} className={`rg-sleigh-roof ${lit ? "is-lit" : ""} ${s.kind === "none" ? "is-none" : ""}`}>
                  <path d={roofPath(i)} fill={tone.fill} stroke="#141414" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d={tilePath(i)} fill="none" stroke={tone.shine} strokeWidth="1.1" opacity="0.55" />
                  {s.kind === "none" ? (
                    <text className="rg-sleigh-text is-none" x={f(lx)} y={f(ly)} textAnchor="middle" fill={tone.ink}>
                      <tspan x={f(lx)} dy="-1">NO</tspan>
                      <tspan x={f(lx)} dy="7">WIN</tspan>
                    </text>
                  ) : (
                    <text className={`rg-sleigh-text ${label.length > 4 ? "is-long" : ""}`} x={f(lx)} y={f(ly + 3.5)} textAnchor="middle" fill={tone.ink}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {/* a chimney on each roof, its base buried in the snow that runs along the top */}
          {layout.segments.map((_, i) => (
            <g key={i} transform={`rotate(${i * SEG}) translate(0 ${-CHIMNEY_R})`} className={`rg-sleigh-chimney ${phase === "landed" && i === layout.target ? "is-lit" : ""}`}>
              <rect x="-3.4" y="-8.5" width="6.8" height="9" rx="0.8" fill="#4a5a80" stroke="#141414" strokeWidth="1.3" />
              <rect x="-4.6" y="-10.2" width="9.2" height="3" rx="1" fill="#dfe6ef" stroke="#141414" strokeWidth="1.1" />
              <path d="M-3 -10.6 Q0 -12.4 3 -10.6" fill="#ffffff" />
            </g>
          ))}
          <circle r={ROOF_OUT} fill="none" stroke="#ffffff" strokeWidth="4.5" />
          {Array.from({ length: 48 }, (_, k) => {
            const [x, y] = polar(k * 7.5 + 3.75, ROOF_OUT - 2.2);
            return <circle key={k} cx={x} cy={y} r={k % 2 ? 2.4 : 3.1} fill="#ffffff" />;
          })}
          <circle r={ROOF_OUT + 2.4} fill="none" stroke="#141414" strokeWidth="1.4" />

          {/* the moon, with the mascot in its Santa hat */}
          <circle r={ROOF_IN - 1} fill="url(#rg-sleigh-moon)" stroke="#141414" strokeWidth="2.2" />
          <foreignObject x="-21" y="-21" width="42" height="42">
            <Mascot mood={won ? "happy" : "smile"} />
          </foreignObject>

          {/* landing: smoke from the chimney, and on a win a fountain of gold coins */}
          {phase === "landed" && (
            <g transform={`translate(${f(cx)} ${f(cy)})`} aria-hidden="true">
              <circle className="rg-sleigh-puff" r="4" fill="#ffffff" />
              <circle className="rg-sleigh-puff is-2" r="3" fill="#ffffff" />
              {won &&
                Array.from({ length: 9 }, (_, k) => {
                  const a = (k / 9) * Math.PI * 2 + 0.3;
                  return (
                    <g key={k} className="rg-dosh" style={{ "--dx": `${f(Math.sin(a) * 26)}px`, "--dy": `${f(-18 - Math.abs(Math.cos(a)) * 22)}px`, animationDelay: `${k * 0.05}s` } as CSSProperties}>
                      <circle r="3.6" fill="#ffd23f" stroke="#141414" strokeWidth="1" />
                      <text y="1.6" textAnchor="middle" className="rg-dosh-text">£</text>
                    </g>
                  );
                })}
            </g>
          )}

          <g ref={sleigh} className="rg-sleigh-pos" transform={`translate(0 ${-FLIGHT_R}) scale(0.92 0.92)`}>
            <Sleigh />
          </g>
        </svg>
      </div>
    </>
  );

  return (
    <>
      <Scene3D
        state={state3d}
        setup={(ctx) => buildSleighScene(ctx)}
        seed={`sleigh:${seed}`}
        reducedMotion={reducedMotion}
        aspect={1.0}
        fallback={flat}
        label={phase === "landed" ? `Landed on ${landed.kind === "none" ? "no win" : landed.label}` : "Dasher pulling the sleigh round the rooftops"}
      />
      {phase === "flying" ? (
        <div className="rg-sleigh-controls">
          <button type="button" className="rg-btn rg-btn-xmas" onClick={stop}>
            Stop the sleigh!
          </button>
          <p className="rg-note">{RESULT_SET_NOTE}</p>
          <SoundToggle />
        </div>
      ) : (
        <div className="rg-sleigh-controls">
          <GamePrompt title={phase === "stopping" ? "Dasher's slowing down…" : landed.kind === "none" ? "No win" : `${landed.label}!`} tone="pink" />
          {phase === "stopping" && (
            <button type="button" className="rg-btn rg-btn-xmas" disabled>
              Stop the sleigh!
            </button>
          )}
        </div>
      )}
    </>
  );
}
