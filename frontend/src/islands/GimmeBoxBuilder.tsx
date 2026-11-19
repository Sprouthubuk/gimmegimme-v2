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

/**
 * The box: a flat 2D cube drawn in SVG. Each face is drawn in a 100×100 square and mapped onto the
 * cube with a matrix, so the stripes and letter tiles lean with the face.
 */
function BoxArt({ state }: { state: "idle" | "shaking" | "open" }) {
  const tiles = ["G", "I", "M", "M", "E"];
  return (
    <svg viewBox="0 0 300 300" className={`gbx-art gbx-${state}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gbxL" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#1E1529" /><stop offset="1" stopColor="#120C19" /></linearGradient>
        <linearGradient id="gbxR" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#140E1C" /><stop offset="1" stopColor="#0A070F" /></linearGradient>
      </defs>
      <ellipse cx="150" cy="292" rx="118" ry="10" fill="#FF2DAA" opacity=".28" className="gbx-glow" />
      {/* left face */}
      <g transform="matrix(1.2,0.5,0,1.45,30,85)">
        <rect width="100" height="100" fill="url(#gbxL)" stroke="#fff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {[38, 47, 56].map((x) => <rect key={x} x={x} width="6" height="100" fill="#FF2DAA" />)}
        {tiles.map((t, i) => (
          <g key={i} transform={`translate(${4 + i * 19} ${i % 2 ? 38 : 33}) rotate(${i % 2 ? 6 : -6} 8 8)`}>
            <rect width="16" height="16" rx="2" fill="#fff" stroke="#07050B" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <text x="8" y="13" textAnchor="middle" fontFamily="'Lilita One',sans-serif" fontSize="12.5" fill="#07050B">{t}</text>
          </g>
        ))}
      </g>
      {/* right face */}
      <g transform="matrix(1.2,-0.5,0,1.45,150,135)">
        <rect width="100" height="100" fill="url(#gbxR)" stroke="#fff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {[12, 21, 30].map((x) => <rect key={x} x={x} width="6" height="100" fill="#FF2DAA" />)}
        <circle cx="66" cy="44" r="17" fill="#fff" stroke="#07050B" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <text x="66" y="55" textAnchor="middle" fontFamily="'Lilita One',sans-serif" fontSize="30" fill="#07050B">?</text>
      </g>
      {/* top face: the lid lifts when the box opens */}
      <g className="gbx-lid">
        <g transform="matrix(1.2,-0.5,1.2,0.5,30,85)">
          <rect width="100" height="100" fill="#241A30" stroke="#fff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <rect y="47" width="100" height="6" fill="#120C19" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <rect x="36" y="36" width="28" height="28" fill="#FF2DAA" />
          <rect x="47" y="36" width="6" height="28" fill="#FFF23A" />
        </g>
      </g>
      <g className="gbx-burst" fill="#FFF23A">
        <path d="M150 20l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" />
        <path d="M88 36l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#22E6FF" />
        <path d="M214 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FF5CC0" />
      </g>
    </svg>
  );
}

/** `available` false (fewer than two live draws can go in a box): the box is shown but can't be opened yet. */
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
  const art = shaking ? "shaking" : box ? "open" : "idle";

  return (
    <div className="gbx" data-testid="gimme-box">
      <div className="gbx-head">
        <h2 className="gbx-title"><span>The</span><span className="gbx-tiles" aria-label="Gimme">{"GIMME".split("").map((l, i) => <span key={i} aria-hidden="true">{l}</span>)}</span><span>Box</span></h2>
        <p className="gbx-sub">Can't decide? Set a budget, give the box a shake and it packs you a mix of tickets across our live draws{bonusPct > 0 ? <>, plus <b>{bonusPct}% bonus tickets</b> free</> : null}.</p>
      </div>

      <div className="gbx-controls">
        <div className="gbx-label" id="gbx-budget">Your Budget</div>
        <div className="gbx-chips" role="group" aria-labelledby="gbx-budget">
          {chipsPence.map((p) => <button key={p} type="button" className="gbx-chip" aria-pressed={budget === p} onClick={pick(() => setBudget(p))}>{formatPence(p)}</button>)}
        </div>
        <div className="gbx-range">
          <input type="range" min={minPence / 100} max={maxPence / 100} step={1} value={pounds} onChange={(e) => { setBudget(Number(e.target.value) * 100); if (box) setBox(null); }}
            aria-label="Budget in pounds" aria-valuetext={`£${pounds}`} style={{ ["--pct" as string]: `${((pounds - minPence / 100) / Math.max(1, maxPence / 100 - minPence / 100)) * 100}%` }} />
          <span className="gbx-amount" data-testid="gb-budget">£{pounds}</span>
        </div>
        <div className="gbx-label" id="gbx-mode">What's In The Box?</div>
        <div className="gbx-modes" role="radiogroup" aria-labelledby="gbx-mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="gbx-mode" onClick={pick(() => setMode(m.id))}>
              <Svg name={m.icon} size={20} /><span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gbx-stage">
        <button type="button" className="gbx-boxbtn" onClick={() => (shaking ? skip.current?.() : !busy && shake())} aria-label={shaking ? "Skip the shake" : "Shake the box"} disabled={!available || (busy && !shaking)}>
          <BoxArt state={art} />
          <span className="gbx-bubble" aria-hidden="true">{!available ? "Soon!" : shaking ? "Shaking…" : box ? "Ta-da!" : "Shake Me!"}</span>
        </button>
        <button type="button" className="gbx-rip" onClick={shake} disabled={busy || !available} data-testid="gb-shake">
          <span className="gbx-rip-ico"><Svg name={box ? "shuffle" : "arrow"} size={18} /></span>
          <span>{!available ? "Opening Soon" : shaking ? "Packing…" : box ? "Shake Again" : `Rip To Open · £${pounds}`}</span>
        </button>
        {shaking && <span className="gbx-skip" aria-live="polite">Tap the box to skip</span>}
      </div>

      <div className="gbx-panel" ref={panel}>
        <div className="gbx-panel-head"><span className="gbx-panel-title">Your Box</span><span className="gbx-status">{box ? `${box.tickets.toLocaleString("en-GB")} Tickets` : "Empty"}</span></div>
        {!box ? (
          <div className="gbx-empty" data-testid={available ? undefined : "gb-unavailable"}><b>Nothing Packed Yet</b><span>{available ? "Pick a budget and rip the tape to see what lands." : "The box opens once there are at least two live draws to pack. Check back soon."}</span></div>
        ) : (
          <div className="gbx-lines" data-testid="gb-reveal" aria-live="polite">
            {box.lines.map((l, i) => (
              <div key={l.competitionId} className="gbx-line" style={{ animationDelay: `${i * 90}ms` }} data-testid="gb-line">
                <img src={l.imageSmall} alt="" width={48} height={48} loading="lazy" />
                <div className="gbx-line-txt">
                  <a href={`/competitions/${l.slug}`}>{l.title}</a>
                  <span>{l.tickets.toLocaleString("en-GB")} tickets{l.bundleLabel ? ` · ${l.bundleLabel}` : ""}{l.bonusQuantity > 0 ? ` · +${l.bonusQuantity} bonus` : ""} · {l.soldPercent}% sold</span>
                </div>
                <b>{formatMoney(l.linePence)}</b>
              </div>
            ))}
            {box.bonusTickets > 0 && <div className="gbx-note gbx-note-c"><Svg name="bolt" size={16} /><span>Includes <b>{box.bonusTickets}</b> bonus {box.bonusTickets === 1 ? "ticket" : "tickets"}, free.</span></div>}
            {box.unusedPence > 0 && <div className="gbx-note" data-testid="gb-unused">{formatMoney(box.unusedPence)} of your {formatPence(box.budgetPence)} wasn't enough for another ticket, so you only pay {formatMoney(box.totalPence)}.</div>}
          </div>
        )}
        <div className="gbx-foot">
          <div className="gbx-total"><span>Total</span><b>{formatMoney(box?.totalPence ?? 0)}</b></div>
          <div className="gbx-actions">
            <button type="button" className="gbx-again" onClick={shake} disabled={busy || !available}><Svg name="shuffle" size={16} /> Again</button>
            <button type="button" className="gbx-add" onClick={addToBasket} disabled={busy || !box} data-testid="gb-add"><Svg name="cart" size={16} /> Add To Basket</button>
          </div>
          {box && <span className="gbx-fine">Tickets held for a few minutes. Same prices as each competition page.</span>}
        </div>
        {error && <div className="err" role="alert">{error}</div>}
      </div>

      <p className="gbx-legal">Live draws only · 18+ UK · <a href="/free-entry">Free postal entry</a> for every draw</p>
    </div>
  );
}
