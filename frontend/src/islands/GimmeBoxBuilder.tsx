import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/api";
import { addBoxLines, boxIdsIn, readBasket } from "../lib/basket";
import { formatMoney, formatPence } from "../lib/money";
import { trackCustom } from "../lib/consent";
import type { GimmeBox, GimmeBoxMode } from "../lib/types";
import { Svg } from "./Svg";

const MODES: { id: GimmeBoxMode; label: string; hint: string }[] = [
  { id: "surprise", label: "Surprise Me", hint: "A random mix" },
  { id: "big", label: "Biggest Prizes", hint: "Leans to big prizes" },
  { id: "most", label: "Most Tickets", hint: "Leans to cheap tickets" },
];

const SHAKE_MS = 1400;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The box picture: a plain 2D gift box, shaken with CSS. */
function BoxArt({ shaking }: { shaking: boolean }) {
  return (
    <svg viewBox="0 0 160 150" width="160" height="150" className={shaking ? "gb-art gb-shake" : "gb-art"} aria-hidden="true">
      <defs>
        <linearGradient id="gbBody" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF2DAA" /><stop offset="1" stopColor="#B0127A" /></linearGradient>
        <linearGradient id="gbLid" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF5CC0" /><stop offset="1" stopColor="#FF2DAA" /></linearGradient>
      </defs>
      <rect x="22" y="62" width="116" height="80" rx="10" fill="url(#gbBody)" />
      <rect x="70" y="62" width="20" height="80" fill="#FFF23A" />
      <g className="gb-lid">
        <rect x="14" y="44" width="132" height="26" rx="8" fill="url(#gbLid)" />
        <rect x="70" y="44" width="20" height="26" fill="#FFF23A" />
        <path d="M80 44c-10-22-36-26-38-12-2 12 22 13 38 12zM80 44c10-22 36-26 38-12 2 12-22 13-38 12z" fill="#FFF23A" />
      </g>
      <text x="80" y="112" textAnchor="middle" fontFamily="'Lilita One',sans-serif" fontSize="30" fill="#07050B" opacity=".25">?</text>
    </svg>
  );
}

export default function GimmeBoxBuilder({ chipsPence, minPence, maxPence, bonusPct, compact = false }: { chipsPence: number[]; minPence: number; maxPence: number; bonusPct: number; compact?: boolean }) {
  const [budget, setBudget] = useState(chipsPence[1] ?? chipsPence[0] ?? minPence);
  const [mode, setMode] = useState<GimmeBoxMode>("surprise");
  const [box, setBox] = useState<GimmeBox | null>(null);
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef<(() => void) | null>(null);

  useEffect(() => () => skip.current?.(), []);

  async function shake() {
    setBusy(true); setError(null);
    const replaces = box && !boxIdsIn(readBasket()).includes(box.id) ? box.id : null;
    setShaking(true);
    // The shake runs while the server packs. Tap the box (or reduced motion) to skip the wait.
    const wait = reducedMotion() ? Promise.resolve() : new Promise<void>((done) => {
      const t = window.setTimeout(done, SHAKE_MS);
      skip.current = () => { window.clearTimeout(t); done(); };
    });
    try {
      const [next] = await Promise.all([api<GimmeBox>("/api/gimme-box", { json: { budgetPence: budget, mode, replaces } }), wait]);
      setBox(next);
      trackCustom("GimmeBoxShake", { mode, budget: budget / 100 });
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
  return (
    <div className="card card-hot card-p stack g16" data-testid="gimme-box">
      {!box && (
        <>
          <div className="stack g8">
            <div className="eyebrow">Your Budget</div>
            <div className="row g8" style={{ flexWrap: "wrap" }}>
              {chipsPence.map((p) => <button key={p} type="button" className={`chip${budget === p ? " on" : ""}`} style={{ height: 44 }} aria-pressed={budget === p} onClick={() => setBudget(p)}>{formatPence(p)}</button>)}
            </div>
            <label className="row g12" style={{ alignItems: "center" }}>
              <span className="sr-only">Budget in pounds</span>
              <input type="range" className="gg-range" min={minPence / 100} max={maxPence / 100} step={1} value={pounds} onChange={(e) => setBudget(Number(e.target.value) * 100)} style={{ flex: 1 }} aria-valuetext={`£${pounds}`} />
              <span className="d ny" style={{ fontSize: 26, minWidth: 64, textAlign: "right" }} data-testid="gb-budget">£{pounds}</span>
            </label>
          </div>
          <div className="stack g8">
            <div className="eyebrow">Pick A Style</div>
            <div className={compact ? "stack g8" : "r3"}>
              {MODES.map((m) => (
                <label key={m.id} className="opt">
                  <input type="radio" name="gb-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                  <span className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 900 }}>{m.label}</span><span className="hint">{m.hint}</span></span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      <button type="button" className="gb-stage" onClick={() => skip.current?.()} aria-label={shaking ? "Skip the shake" : "Your Gimme Box"} disabled={!shaking}>
        <BoxArt shaking={shaking} />
        {shaking && <span className="hint" aria-live="polite">Packing your box… tap to skip</span>}
      </button>

      {box && !shaking && (
        <div className="stack g12" data-testid="gb-reveal" aria-live="polite">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h3 className="h3">Your Box: {box.tickets.toLocaleString("en-GB")} Tickets</h3>
            <span className="d ny" style={{ fontSize: 26 }}>{formatMoney(box.totalPence)}</span>
          </div>
          {box.lines.map((l) => (
            <div key={l.competitionId} className="row g12" style={{ alignItems: "center" }} data-testid="gb-line">
              <img src={l.imageSmall} alt="" width={56} height={56} style={{ borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={`/competitions/${l.slug}`} style={{ fontWeight: 900, color: "#fff", textDecoration: "none", lineHeight: 1.15 }}>{l.title}</a>
                <div className="hint">
                  {l.tickets.toLocaleString("en-GB")} tickets
                  {l.bundleLabel ? ` · ${l.bundleLabel}` : ""}
                  {l.bonusQuantity > 0 ? ` · +${l.bonusQuantity} bonus` : ""}
                  {` · ${l.soldPercent}% sold`}
                </div>
              </div>
              <span style={{ fontWeight: 900 }}>{formatMoney(l.linePence)}</span>
            </div>
          ))}
          {box.bonusTickets > 0 && <div className="notice notice-c"><Svg name="bolt" size={18} /><span>Includes <b>{box.bonusTickets}</b> Gimme Box bonus {box.bonusTickets === 1 ? "ticket" : "tickets"} ({bonusPct}% extra), free.</span></div>}
          {box.unusedPence > 0 && <p className="hint" style={{ margin: 0 }} data-testid="gb-unused">{formatMoney(box.unusedPence)} of your {formatPence(box.budgetPence)} wasn't enough for another ticket, so you only pay {formatMoney(box.totalPence)}.</p>}
          <p className="hint" style={{ margin: 0 }}>These tickets are held for you for a few minutes. Prices are the same as on each competition page.</p>
          <div className="r2">
            <button type="button" className="btn btn-o" onClick={shake} disabled={busy}><Svg name="shuffle" size={16} /> Shake Again</button>
            <button type="button" className="btn btn-y gg-cta" onClick={addToBasket} disabled={busy} data-testid="gb-add">Add To Basket</button>
          </div>
          <button type="button" className="tap" style={{ background: "none", border: 0, color: "#B9AFC6", fontWeight: 800 }} onClick={() => setBox(null)}>Change budget or style</button>
        </div>
      )}

      {!box && <button type="button" className="btn btn-y btn-lg btn-block gg-cta" onClick={shake} disabled={busy} data-testid="gb-shake">{busy ? "Packing…" : `Shake My £${pounds} Box`}</button>}
      {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
      <p className="hint" style={{ margin: 0, textAlign: "center" }}>Live draws only. 18+ UK. <a href="/free-entry">Free postal entry</a> is open for every draw.</p>
    </div>
  );
}
