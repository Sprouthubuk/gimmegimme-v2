import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/api";
import { addBoxLines, boxIdsIn, readBasket } from "../lib/basket";
import { formatMoney, formatPence } from "../lib/money";
import { trackCustom } from "../lib/consent";
import type { GimmeBox, GimmeBoxMode } from "../lib/types";
import { Svg } from "./Svg";

const MODES: { id: GimmeBoxMode; label: string; icon: "shuffle" | "gem" | "boxes" }[] = [
  { id: "surprise", label: "Surprise Me", icon: "shuffle" },
  { id: "big", label: "Big Prizes", icon: "gem" },
  { id: "most", label: "Most Tickets", icon: "boxes" },
];

const SHAKE_MS = 1400;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/*
 * The box, drawn in 2D (SVG). Points on the cube are projected isometrically; each face is drawn in a
 * 100×100 square and mapped onto the cube with a matrix, so the logo, ribbon and confetti lean with it.
 * Body: dark with brand confetti, the Gimme Gimme logo and a neon question mark. Lid: brand pink with a
 * yellow ribbon (one band, front-left to back-right, so it never crosses the logo) and a bow.
 */
type Pt = [number, number];
const K = 112;
const P = (x: number, y: number, z: number): Pt => [150 + (x - y) * K * 0.866, 132 + (x + y) * K * 0.5 - z * K];
const faceMatrix = (o: Pt, u: Pt, v: Pt) => `matrix(${(u[0] - o[0]) / 100},${(u[1] - o[1]) / 100},${(v[0] - o[0]) / 100},${(v[1] - o[1]) / 100},${o[0]},${o[1]})`;
const BODY = 0.78; // body height
const LID = 0.2; // lid height
const O = 0.05; // lid overhang
const TOP = BODY + LID - 0.06; // lid sits a little down over the body
// Faces facing us: left = the y=1 side, right = the x=1 side, top = z=TOP.
const bodyL = faceMatrix(P(0, 1, BODY), P(1, 1, BODY), P(0, 1, 0));
const bodyR = faceMatrix(P(1, 1, BODY), P(1, 0, BODY), P(1, 1, 0));
const lidL = faceMatrix(P(-O, 1 + O, TOP), P(1 + O, 1 + O, TOP), P(-O, 1 + O, TOP - LID));
const lidR = faceMatrix(P(1 + O, 1 + O, TOP), P(1 + O, -O, TOP), P(1 + O, 1 + O, TOP - LID));
const lidT = faceMatrix(P(-O, -O, TOP), P(1 + O, -O, TOP), P(-O, 1 + O, TOP));
const [bowX, bowY] = P(0.5, 0.5, TOP);
const CONFETTI: [number, number, string, number][] = [[8, 14, "#22E6FF", 20], [22, 82, "#FFF23A", -30], [84, 12, "#FF5CC0", 40], [90, 70, "#22E6FF", -15], [50, 90, "#FF5CC0", 10], [12, 50, "#FF5CC0", 60], [70, 88, "#FFF23A", 25]];
const EDGE = { stroke: "rgba(255,255,255,.6)", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" as const };

function BoxArt({ shaking }: { shaking: boolean }) {
  return (
    <svg viewBox="0 0 300 300" className={`gbx-art${shaking ? " gbx-shaking" : ""}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gbxBodyL" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#24182F" /><stop offset="1" stopColor="#140D1B" /></linearGradient>
        <linearGradient id="gbxBodyR" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#170F1F" /><stop offset="1" stopColor="#0B0710" /></linearGradient>
        <linearGradient id="gbxLid" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#FF5CC0" /><stop offset="1" stopColor="#FF2DAA" /></linearGradient>
      </defs>
      <ellipse cx="150" cy="282" rx="112" ry="10" fill="#FF2DAA" opacity=".22" />

      <g transform={bodyL}>
        <rect width="100" height="100" fill="url(#gbxBodyL)" {...EDGE} />
        {CONFETTI.map(([x, y, c, r], i) => <rect key={i} x={x} y={y} width="5" height="2.6" rx="1" fill={c} transform={`rotate(${r} ${x} ${y})`} opacity=".85" />)}
        <image href="/logo-sm.webp" x="13" y="24" width="74" height="60" preserveAspectRatio="none" />
      </g>
      <g transform={bodyR}>
        <rect width="100" height="100" fill="url(#gbxBodyR)" {...EDGE} />
        {CONFETTI.map(([x, y, c, r], i) => <rect key={i} x={100 - x} y={y} width="5" height="2.6" rx="1" fill={c} transform={`rotate(${-r} ${100 - x} ${y})`} opacity=".7" />)}
        <rect x="43" width="14" height="100" fill="#FFF23A" />
        <rect x="43" width="2" height="100" fill="#B38F00" opacity=".5" />
        <text x="78" y="66" textAnchor="middle" fontFamily="'Lilita One',sans-serif" fontSize="52" fill="#22E6FF" style={{ filter: "drop-shadow(0 0 4px rgba(34,230,255,.8))" }}>?</text>
      </g>

      <g className="gbx-lid">
        <g transform={lidL}>
          <rect width="100" height="100" fill="#D6007D" {...EDGE} />
        </g>
        <g transform={lidR}>
          <rect width="100" height="100" fill="#B0006A" {...EDGE} />
          <rect x="44" width="12" height="100" fill="#FFF23A" />
        </g>
        <g transform={lidT}>
          <rect width="100" height="100" fill="url(#gbxLid)" {...EDGE} />
          <rect y="44" width="100" height="12" fill="#FFF23A" />
        </g>
        <g transform={`translate(${bowX} ${bowY})`}>
          <path d="M0 0C-14-22-46-24-44-8-42 4-16 4 0 0Z" fill="#FFF23A" stroke="#B38F00" strokeWidth="1.5" />
          <path d="M0 0C14-22 46-24 44-8 42 4 16 4 0 0Z" fill="#FFF23A" stroke="#B38F00" strokeWidth="1.5" />
          <path d="M-4 2-14 22-6 20-2 26ZM4 2 14 22 6 20 2 26Z" fill="#FFE600" stroke="#B38F00" strokeWidth="1.2" />
          <ellipse cx="0" cy="0" rx="8" ry="6" fill="#FFE600" stroke="#B38F00" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

export default function GimmeBoxBuilder({ chipsPence, minPence, maxPence, bonusPct, available = true }: { chipsPence: number[]; minPence: number; maxPence: number; bonusPct: number; available?: boolean }) {
  const [budget, setBudget] = useState(chipsPence[1] ?? chipsPence[0] ?? minPence);
  const [mode, setMode] = useState<GimmeBoxMode>("surprise");
  const [box, setBox] = useState<GimmeBox | null>(null);
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef<(() => void) | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => () => skip.current?.(), []);

  async function shake() {
    setBusy(true); setError(null);
    const replaces = box && !boxIdsIn(readBasket()).includes(box.id) ? box.id : null;
    setShaking(true);
    // The box shakes while the server packs it. Tapping the box skips the wait; reduced motion has none.
    const wait = reducedMotion() ? Promise.resolve() : new Promise<void>((done) => {
      const t = window.setTimeout(done, SHAKE_MS);
      skip.current = () => { window.clearTimeout(t); done(); };
    });
    try {
      const [next] = await Promise.all([api<GimmeBox>("/api/gimme-box", { json: { budgetPence: budget, mode, replaces } }), wait]);
      setBox(next);
      trackCustom("GimmeBoxShake", { mode, budget: budget / 100 });
      // On a phone the box's contents are below the button: bring them into view.
      if (window.matchMedia?.("(max-width: 999px)").matches) {
        window.setTimeout(() => panel.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }), 60);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      skip.current = null;
      setShaking(false);
      setBusy(false);
    }
  }

  async function addToBasket() {
    if (!box) return;
    setBusy(true); setError(null);
    try {
      const fresh = await api<GimmeBox>(`/api/gimme-box/${box.id}/added`, { method: "POST" });
      addBoxLines(fresh.basketLines);
      trackCustom("GimmeBoxAdded", { mode: fresh.mode, value: fresh.totalPence / 100 });
      window.location.assign("/basket");
    } catch (e) {
      setError(errorText(e));
      setBox(null);
      setBusy(false);
    }
  }

  const pounds = Math.round(budget / 100);
  const pick = (fn: () => void) => () => { fn(); if (box) setBox(null); };

  return (
    <div className="card card-hot gbx" data-testid="gimme-box">
      <div className="gbx-controls">
        <div className="stack g8">
          <div className="lbl" id="gbx-budget">Your Budget</div>
          <div className="r4" role="group" aria-labelledby="gbx-budget">
            {chipsPence.map((p) => <button key={p} type="button" className={`pick${budget === p ? " on" : ""}`} aria-pressed={budget === p} onClick={pick(() => setBudget(p))}>{formatPence(p)}</button>)}
          </div>
          <div className="row g12" style={{ alignItems: "center" }}>
            <input type="range" className="gbx-range" min={minPence / 100} max={maxPence / 100} step={1} value={pounds} onChange={(e) => { setBudget(Number(e.target.value) * 100); if (box) setBox(null); }}
              aria-label="Budget in pounds" aria-valuetext={`£${pounds}`} style={{ ["--pct" as string]: `${((pounds - minPence / 100) / Math.max(1, maxPence / 100 - minPence / 100)) * 100}%` }} />
            <span className="d" style={{ fontSize: 24, minWidth: 56, textAlign: "right" }} data-testid="gb-budget">£{pounds}</span>
          </div>
        </div>
        <div className="stack g8">
          <div className="lbl" id="gbx-mode">What's In The Box?</div>
          <div className="r3" role="radiogroup" aria-labelledby="gbx-mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`pick gbx-mode${mode === m.id ? " on" : ""}`} onClick={pick(() => setMode(m.id))}>
                <Svg name={m.icon} size={18} /><small>{m.label}</small>
              </button>
            ))}
          </div>
        </div>
        {!box && (
          <button type="button" className="btn btn-y btn-lg btn-block gg-cta" onClick={shake} disabled={busy || !available} data-testid="gb-shake">
            {!available ? "Opening Soon" : shaking ? "Packing…" : `Open My £${pounds} Box`}
          </button>
        )}
        <p className="hint" style={{ margin: 0 }}>Live draws only · 18+ UK · <a href="/free-entry">Free postal entry</a> for every draw</p>
      </div>

      <div className="gbx-result" ref={panel}>
        {!box ? (
          <div className="gbx-empty" data-testid={available ? undefined : "gb-unavailable"}>
            <button type="button" className="gbx-boxbtn" onClick={() => (shaking ? skip.current?.() : !busy && available && shake())} aria-label={shaking ? "Skip the shake" : "Open the box"} disabled={!available || (busy && !shaking)}>
              <BoxArt shaking={shaking} />
            </button>
            <span className="hint" aria-live="polite">{!available ? "The box opens once there are at least two live draws to pack." : shaking ? "Packing your box… tap to skip" : "Pick a budget and open the box to see what's inside."}</span>
          </div>
        ) : (
          <div className="stack g12" data-testid="gb-reveal" aria-live="polite">
            <div className="row between" style={{ alignItems: "baseline" }}>
              <h3 className="h3" style={{ margin: 0 }}>Your Box</h3>
              <span className="eyebrow">{box.tickets.toLocaleString("en-GB")} Tickets</span>
            </div>
            {box.lines.map((l, i) => (
              <div key={l.competitionId} className="gbx-line" style={{ animationDelay: `${i * 80}ms` }} data-testid="gb-line">
                <img src={l.imageSmall} alt="" width={48} height={48} loading="lazy" />
                <div className="gbx-line-txt">
                  <a href={`/competitions/${l.slug}`}>{l.title}</a>
                  <span className="hint">{l.tickets.toLocaleString("en-GB")} tickets{l.bundleLabel ? ` · ${l.bundleLabel}` : ""}{l.bonusQuantity > 0 ? ` · +${l.bonusQuantity} bonus` : ""} · {l.soldPercent}% sold</span>
                </div>
                <b>{formatMoney(l.linePence)}</b>
              </div>
            ))}
            {box.bonusTickets > 0 && <p className="hint" style={{ margin: 0, color: "#22E6FF" }}>Includes {box.bonusTickets} bonus {box.bonusTickets === 1 ? "ticket" : "tickets"}, free.</p>}
            {box.unusedPence > 0 && <p className="hint" style={{ margin: 0 }} data-testid="gb-unused">{formatMoney(box.unusedPence)} of your {formatPence(box.budgetPence)} wasn't enough for another ticket, so you only pay {formatMoney(box.totalPence)}.</p>}
            <div className="row between" style={{ alignItems: "baseline", borderTop: "1px solid rgba(255,255,255,.09)", paddingTop: 12 }}>
              <span className="lbl">Total</span>
              <span className="d ny" style={{ fontSize: 28 }}>{formatMoney(box.totalPence)}</span>
            </div>
            <div className="gbx-actions">
              <button type="button" className="btn btn-o" onClick={shake} disabled={busy}><Svg name="shuffle" size={16} /> Shake Again</button>
              <button type="button" className="btn btn-y gg-cta" onClick={addToBasket} disabled={busy} data-testid="gb-add">Add To Basket</button>
            </div>
            <span className="hint">Tickets held for a few minutes. Same prices as each competition page.</span>
          </div>
        )}
        {error && <div className="err" role="alert">{error}</div>}
      </div>
    </div>
  );
}
