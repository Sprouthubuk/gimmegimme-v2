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

/** The box: a plain 2D cube in SVG. Each face is drawn in a 100×100 square and mapped onto the cube with a matrix. */
function BoxArt({ shaking }: { shaking: boolean }) {
  return (
    <svg viewBox="0 0 300 300" className={`gbx-art${shaking ? " gbx-shaking" : ""}`} aria-hidden="true" focusable="false">
      <ellipse cx="150" cy="290" rx="105" ry="8" fill="#FF2DAA" opacity=".18" />
      <g transform="matrix(1.2,0.5,0,1.45,30,85)">
        <rect width="100" height="100" fill="#150F1D" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <rect x="44" width="12" height="100" fill="#FF2DAA" />
      </g>
      <g transform="matrix(1.2,-0.5,0,1.45,150,135)">
        <rect width="100" height="100" fill="#0E0914" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <rect x="44" width="12" height="100" fill="#FF2DAA" />
      </g>
      <g transform="matrix(1.2,-0.5,1.2,0.5,30,85)">
        <rect width="100" height="100" fill="#1E1628" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <rect x="44" width="12" height="100" fill="#FF2DAA" />
        <rect y="44" width="100" height="12" fill="#FF2DAA" />
        <rect x="41" y="41" width="18" height="18" fill="#FFF23A" />
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
