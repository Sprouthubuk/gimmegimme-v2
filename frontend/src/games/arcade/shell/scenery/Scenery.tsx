import type { ReactNode } from "react";
import "./scenery.css";

/**
 * The illustrated world each game sits in: a full-bleed picture behind the board (drawn here in SVG, so it is
 * sharp on every phone and costs nothing to load). Purely decoration: it never shows or hints at a result.
 *
 * To use painted art instead, put the picture in /public/games/scenes/<game>.webp and list it in PAINTED:
 * the picture replaces the drawing and nothing else changes.
 */
const PAINTED: Partial<Record<string, string>> = {};

type SceneFn = () => ReactNode;

export function Scenery({ game, reducedMotion }: { game: string; reducedMotion: boolean }) {
  const painted = PAINTED[game];
  const Scene = SCENES[game] ?? SCENES.default;
  return (
    <div className={`rg-scenery rg-scenery-${game} ${reducedMotion ? "is-still" : ""}`} aria-hidden="true">
      {painted ? <img src={painted} alt="" /> : <svg viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">{Scene()}</svg>}
    </div>
  );
}

/* ---------- shared pieces ---------- */

function Sparkles({ n = 14, seed = 1, color = "#fff6c8" }: { n?: number; seed?: number; color?: string }) {
  // Fixed positions from a tiny hash: the same picture every time, no randomness.
  const pts = Array.from({ length: n }, (_, i) => {
    const h = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453;
    const r = h - Math.floor(h);
    const h2 = Math.sin((i + 1) * 78.233 * seed) * 12543.123;
    const r2 = h2 - Math.floor(h2);
    return { x: 20 + r * 360, y: 40 + r2 * 640, s: 3 + ((i * 7) % 5), d: (i % 6) * 0.45 };
  });
  return (
    <g className="rg-sc-sparkles">
      {pts.map((p, i) => (
        <path
          key={i}
          d={`M${p.x} ${p.y - p.s}Q${p.x} ${p.y} ${p.x + p.s} ${p.y}Q${p.x} ${p.y} ${p.x} ${p.y + p.s}Q${p.x} ${p.y} ${p.x - p.s} ${p.y}Q${p.x} ${p.y} ${p.x} ${p.y - p.s}Z`}
          fill={color}
          style={{ animationDelay: `${p.d}s` }}
        />
      ))}
    </g>
  );
}

function Bokeh({ items }: { items: [number, number, number, string, number][] }) {
  return (
    <g className="rg-sc-bokeh">
      {items.map(([x, y, r, c, o], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={`url(#bk-${c})`} opacity={o} style={{ animationDelay: `${(i % 5) * 0.7}s` }} />
      ))}
    </g>
  );
}

function BokehDefs() {
  return (
    <>
      {(
        [
          ["gold", "#ffd36b"],
          ["pink", "#ff4fb4"],
          ["cyan", "#4fe3ff"],
          ["white", "#ffffff"],
        ] as const
      ).map(([k, c]) => (
        <radialGradient key={k} id={`bk-${k}`}>
          <stop offset="0" stopColor={c} stopOpacity="0.9" />
          <stop offset="0.55" stopColor={c} stopOpacity="0.35" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      ))}
    </>
  );
}

function Bulbs({ y, from = 0, to = 400, n = 13, sag = 26 }: { y: number; from?: number; to?: number; n?: number; sag?: number }) {
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: from + (to - from) * t, y: y + Math.sin(t * Math.PI) * sag };
  });
  const cols = ["#ffd84a", "#ff4fb4", "#4fe3ff", "#ffffff"];
  return (
    <g className="rg-sc-bulbs">
      <path d={`M${from} ${y} Q${(from + to) / 2} ${y + sag * 2} ${to} ${y}`} fill="none" stroke="#1b0d24" strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i} style={{ animationDelay: `${(i % 3) * 0.4}s` }}>
          <circle cx={p.x} cy={p.y + 6} r="11" fill={`url(#bk-${["gold", "pink", "cyan", "white"][i % 4]})`} opacity="0.75" />
          <circle cx={p.x} cy={p.y + 6} r="4.2" fill={cols[i % 4]} />
        </g>
      ))}
    </g>
  );
}

/* ---------- scenes ---------- */

/** A show stage: velvet curtains, spotlights, a glowing floor. (Spin the Wheel) */
function Stage() {
  return (
    <>
      <defs>
        <BokehDefs />
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b0a40" />
          <stop offset="0.65" stopColor="#14061f" />
          <stop offset="1" stopColor="#07030c" />
        </linearGradient>
        <linearGradient id="st-curtain" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5c0634" />
          <stop offset="0.25" stopColor="#c4146f" />
          <stop offset="0.5" stopColor="#7a0843" />
          <stop offset="0.75" stopColor="#d41d7c" />
          <stop offset="1" stopColor="#6a073c" />
        </linearGradient>
        <linearGradient id="st-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="st-floor" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ff4fb4" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#7a1fa0" stopOpacity="0.25" />
          <stop offset="1" stopColor="#07030c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="st-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#f5b923" />
          <stop offset="1" stopColor="#b97a06" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="url(#st-sky)" />
      <Bokeh items={[[60, 210, 40, "pink", 0.35], [330, 260, 52, "cyan", 0.22], [200, 120, 70, "gold", 0.16], [110, 520, 34, "gold", 0.25], [300, 560, 44, "pink", 0.25]]} />
      <path className="rg-sc-beam" d="M40 70 L170 760 L-60 760Z" fill="url(#st-beam)" />
      <path className="rg-sc-beam is-r" d="M360 70 L460 760 L230 760Z" fill="url(#st-beam)" />
      <ellipse cx="200" cy="760" rx="260" ry="120" fill="url(#st-floor)" />
      <g>
        {[0, 1].map((side) => (
          <g key={side} transform={side ? "translate(400 0) scale(-1 1)" : undefined}>
            <path d="M0 40 L92 40 C70 220 60 420 80 860 L0 860Z" fill="url(#st-curtain)" />
            <path d="M0 40 L60 40 C44 260 40 500 52 860 L0 860Z" fill="#000" opacity="0.18" />
            <path d="M30 40 C26 300 24 560 30 860" stroke="#ff6fc0" strokeOpacity="0.25" strokeWidth="3" fill="none" />
            <circle cx="88" cy="300" r="7" fill="url(#st-gold)" />
            <path d="M88 300 q-12 30 -46 34" stroke="url(#st-gold)" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        ))}
        <path d="M0 0 H400 V46 Q380 70 360 46 Q340 70 320 46 Q300 70 280 46 Q260 70 240 46 Q220 70 200 46 Q180 70 160 46 Q140 70 120 46 Q100 70 80 46 Q60 70 40 46 Q20 70 0 46Z" fill="url(#st-curtain)" />
        <path d="M0 46 Q20 70 40 46 Q60 70 80 46 Q100 70 120 46 Q140 70 160 46 Q180 70 200 46 Q220 70 240 46 Q260 70 280 46 Q300 70 320 46 Q340 70 360 46 Q380 70 400 46" stroke="url(#st-gold)" strokeWidth="4" fill="none" />
      </g>
      <Sparkles n={18} seed={2} />
    </>
  );
}

/** A casino lounge: deco rays, gold light and glowing bokeh. (Slots) */
function Casino() {
  const rays = Array.from({ length: 18 }, (_, i) => i);
  return (
    <>
      <defs>
        <BokehDefs />
        <radialGradient id="cs-bg" cx="0.5" cy="0.38" r="0.75">
          <stop offset="0" stopColor="#6a1a8c" />
          <stop offset="0.45" stopColor="#2c0a45" />
          <stop offset="1" stopColor="#09030f" />
        </radialGradient>
        <linearGradient id="cs-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf5a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffcf5a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cs-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#f5b923" />
          <stop offset="1" stopColor="#a86c05" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="url(#cs-bg)" />
      <g className="rg-sc-rays" style={{ transformOrigin: "200px 330px" }}>
        {rays.map((i) => (
          <path key={i} d="M200 330 L186 -400 L214 -400Z" fill="url(#cs-ray)" transform={`rotate(${i * 20} 200 330)`} />
        ))}
      </g>
      <Bokeh items={[[40, 120, 34, "gold", 0.45], [360, 90, 46, "pink", 0.35], [70, 620, 50, "pink", 0.3], [350, 640, 38, "gold", 0.45], [330, 380, 26, "cyan", 0.35], [60, 380, 22, "white", 0.25], [200, 740, 80, "gold", 0.18]]} />
      {/* Coin stacks in the corners. */}
      {[
        [34, 820, 7],
        [70, 832, 4],
        [360, 826, 6],
        [326, 838, 3],
      ].map(([x, y, n], k) => (
        <g key={k}>
          {Array.from({ length: n }, (_, i) => (
            <g key={i} transform={`translate(${x} ${y - i * 9})`}>
              <ellipse rx="22" ry="8" cy="4" fill="#7a4d02" />
              <ellipse rx="22" ry="8" fill="url(#cs-coin)" />
              <ellipse rx="14" ry="4.6" fill="none" stroke="#b97a06" strokeWidth="1.6" />
            </g>
          ))}
        </g>
      ))}
      <Sparkles n={16} seed={3} color="#ffe9a3" />
    </>
  );
}

/** A sunny garden at dusk: rolling hills, a picket fence, flowers. (Whack-a-Mole) */
function Garden() {
  const flowers: [number, number, string][] = [[30, 820, "#ff5fb2"], [70, 838, "#ffd23a"], [112, 826, "#ffffff"], [290, 830, "#ffd23a"], [330, 818, "#ff5fb2"], [372, 840, "#4fe3ff"], [200, 842, "#ff5fb2"]];
  return (
    <>
      <defs>
        <BokehDefs />
        <linearGradient id="gd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a8c" />
          <stop offset="0.45" stopColor="#8a5ad0" />
          <stop offset="0.75" stopColor="#f2a0c8" />
          <stop offset="1" stopColor="#ffd2a8" />
        </linearGradient>
        <linearGradient id="gd-hill1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fcf5a" />
          <stop offset="1" stopColor="#2f7d28" />
        </linearGradient>
        <linearGradient id="gd-hill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4bb03a" />
          <stop offset="1" stopColor="#1f5a1c" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="url(#gd-sky)" />
      <circle cx="350" cy="215" r="40" fill="url(#bk-gold)" opacity="0.9" />
      <circle cx="350" cy="215" r="22" fill="#fff3c8" />
      {[[36, 250, 0.8], [370, 300, 0.7], [60, 520, 0.6]].map(([x, y, k], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${k})`} opacity="0.85">
          <g className="rg-sc-cloud" style={{ animationDelay: `${i * -7}s` }}>
            <ellipse cx="0" cy="0" rx="34" ry="14" fill="#fff" />
            <circle cx="-12" cy="-8" r="14" fill="#fff" />
            <circle cx="10" cy="-12" r="17" fill="#fff" />
          </g>
        </g>
      ))}
      <path d="M0 560 Q100 500 210 540 T400 520 V860 H0 Z" fill="url(#gd-hill1)" />
      <path d="M0 640 Q140 590 260 630 T400 610 V860 H0 Z" fill="url(#gd-hill2)" />
      <g fill="#fffdf6">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${i * 30 + 4} 800 v-40 l9 -10 l9 10 v40 Z`} opacity="0.92" />
        ))}
        <rect x="0" y="768" width="400" height="7" rx="3" />
        <rect x="0" y="786" width="400" height="7" rx="3" />
      </g>
      <rect x="0" y="800" width="400" height="60" fill="#1f5a1c" />
      {flowers.map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0 0 v24" stroke="#2f7d28" strokeWidth="3" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-7" rx="5" ry="8" fill={c} transform={`rotate(${a})`} />
          ))}
          <circle r="4.5" fill="#ffd23a" />
        </g>
      ))}
      <Sparkles n={10} seed={7} color="#fffbe0" />
    </>
  );
}

/** A crystal cave: dark rock, glowing crystals in the walls. (Gems) */
function Cave() {
  const crystals: [number, number, number, number, string][] = [[20, 300, 26, -20, "#4fe3ff"], [44, 320, 18, 8, "#ff5fb2"], [372, 260, 28, 18, "#ffd23a"], [352, 290, 18, -10, "#4fe3ff"], [28, 700, 30, 14, "#ffd23a"], [60, 730, 20, -12, "#4fe3ff"], [366, 690, 32, -16, "#ff5fb2"], [338, 728, 18, 10, "#ffd23a"]];
  return (
    <>
      <defs>
        <BokehDefs />
        <radialGradient id="cv-bg" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#3a2458" />
          <stop offset="0.55" stopColor="#1a0f2a" />
          <stop offset="1" stopColor="#07040c" />
        </radialGradient>
        <linearGradient id="cv-rock" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a3a62" />
          <stop offset="1" stopColor="#1c1228" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="url(#cv-bg)" />
      <path d="M0 0 H400 V60 Q340 120 300 70 Q250 140 200 80 Q150 150 100 70 Q60 130 0 60 Z" fill="url(#cv-rock)" />
      <path d="M0 0 V860 H40 Q70 700 30 560 Q70 420 26 260 Q60 150 0 120 Z" fill="url(#cv-rock)" />
      <path d="M400 0 V860 H360 Q330 690 372 540 Q330 400 376 240 Q340 140 400 110 Z" fill="url(#cv-rock)" />
      <path d="M0 860 V790 Q100 750 200 790 Q300 750 400 790 V860 Z" fill="#140c20" />
      {crystals.map(([x, y, h, a, c], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
          <circle r={h} fill={`url(#bk-${c === "#ffd23a" ? "gold" : c === "#ff5fb2" ? "pink" : "cyan"})`} opacity="0.6" />
          <path d={`M0 ${-h} L${h * 0.32} 0 L0 ${h * 0.5} L${-h * 0.32} 0 Z`} fill={c} />
          <path d={`M0 ${-h} L${h * 0.32} 0 L0 0 Z`} fill="#fff" opacity="0.45" />
        </g>
      ))}
      <Sparkles n={18} seed={11} color="#bdf3ff" />
    </>
  );
}

/** A fairground at night: a big wheel, string lights, a striped tent. (Hook A Duck, Balloon Pop, Claw Machine) */
function Fairground() {
  return (
    <>
      <defs>
        <BokehDefs />
        <linearGradient id="fg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#140a3a" />
          <stop offset="0.6" stopColor="#3a1468" />
          <stop offset="1" stopColor="#12051f" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="url(#fg-sky)" />
      <g opacity="0.55" transform="translate(320 520)">
        <g>
          <circle r="120" fill="none" stroke="#ffd23a" strokeWidth="3" />
          <circle r="96" fill="none" stroke="#ff5fb2" strokeWidth="1.5" />
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30})`}>
              <path d="M0 0 L0 -120" stroke="#ffd23a" strokeWidth="1.5" />
              <circle cy="-120" r="6" fill={["#ffd84a", "#ff4fb4", "#4fe3ff"][i % 3]} />
            </g>
          ))}
        </g>
        <path d="M-16 0 L-70 260 M16 0 L70 260" stroke="#ffd23a" strokeWidth="5" />
      </g>
      <Bulbs y={40} n={12} sag={30} />
      <Bulbs y={130} from={-20} to={260} n={8} sag={20} />
      <g transform="translate(-50 740) scale(0.75)" opacity="0.55">
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={`M${100} 0 L${i * 34} 150 L${i * 34 + 34} 150 Z`} fill={i % 2 ? "#fffdf6" : "#d1006f"} />
        ))}
        <circle cx="100" cy="-6" r="7" fill="#ffd23a" />
      </g>
      <Bokeh items={[[60, 300, 40, "gold", 0.35], [340, 200, 50, "pink", 0.3], [200, 760, 90, "gold", 0.15], [30, 520, 30, "cyan", 0.3]]} />
      <Sparkles n={14} seed={5} color="#ffe9a3" />
    </>
  );
}

/** A party: a warm room with bunting, balloons and confetti. (Piñata) */
function Party() {
  const flags = ["#ff4fa8", "#ffd23a", "#3fd0f7", "#b86bff", "#5be37d"];
  const balloons: [number, number, string, number][] = [[34, 560, "#ff4fa8", 1], [74, 610, "#ffd23a", 0.8], [356, 540, "#3fd0f7", 1], [318, 600, "#b86bff", 0.85]];
  const confetti = Array.from({ length: 34 }, (_, i) => {
    const h = (i * 2654435761) >>> 0;
    return { x: h % 400, y: 160 + ((h >>> 9) % 640), r: (h >>> 3) % 180, c: flags[i % flags.length] };
  });
  return (
    <>
      <defs>
        <BokehDefs />
        <radialGradient id="pt-bg" cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#5a1f8e" />
          <stop offset="0.6" stopColor="#2e0d55" />
          <stop offset="1" stopColor="#12051f" />
        </radialGradient>
      </defs>
      <rect width="400" height="860" fill="url(#pt-bg)" />
      <Bokeh items={[[80, 220, 60, "pink", 0.35], [330, 180, 70, "gold", 0.3], [200, 520, 120, "pink", 0.12], [40, 420, 40, "cyan", 0.3], [370, 420, 44, "gold", 0.25]]} />
      {[[0, 150, 26]].map(([x0, y, sag], row) => (
        <g key={row}>
          <path d={`M${x0} ${y} Q200 ${y + sag * 2} 400 ${y}`} fill="none" stroke="#ffe7a8" strokeWidth="1.5" />
          {Array.from({ length: 11 }, (_, i) => {
            const t = (i + 0.5) / 11;
            const x = t * 400;
            const yy = y + (1 - (2 * t - 1) ** 2) * sag;
            return <path key={i} d={`M${x - 13} ${yy} L${x + 13} ${yy} L${x} ${yy + 26} Z`} fill={flags[(i + row * 2) % flags.length]} opacity={row ? 0.7 : 0.95} />;
          })}
        </g>
      ))}
      {balloons.map(([x, y, c, k], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
          <g className="rg-sc-cloud" style={{ animationDelay: `${i * -5}s`, animationDuration: "7s" }}>
            <path d="M0 40 q-6 30 4 60" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" />
            <ellipse cx="0" cy="0" rx="26" ry="32" fill={c} />
            <ellipse cx="-9" cy="-12" rx="6" ry="10" fill="#fff" opacity="0.45" />
            <path d="M-4 31 L4 31 L0 38 Z" fill={c} />
          </g>
        </g>
      ))}
      {confetti.map((f, i) => (
        <rect key={i} x={f.x} y={f.y} width="7" height="3.5" rx="1" fill={f.c} opacity="0.7" transform={`rotate(${f.r} ${f.x} ${f.y})`} />
      ))}
      <Sparkles n={12} seed={3} color="#ffe9a3" />
    </>
  );
}

const SCENES: Record<string, SceneFn> = {
  pinata: Party,
  whack_a_mole: Garden,
  gems: Cave,
  hook_a_duck: Fairground,
  balloon_pop: Fairground,
  claw_machine: Fairground,
  spin_wheel: Stage,
  slots: Casino,
  default: Casino,
};

export { Bulbs };
