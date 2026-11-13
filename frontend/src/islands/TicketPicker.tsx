import { useMemo, useState } from "react";
import { addToBasket } from "../lib/basket";
import { formatMoney, formatPence, formatCount } from "../lib/money";
import { ukDateTime } from "../lib/time";
import { Svg } from "./Svg";

export interface PickerProps {
  competitionId: string;
  slug: string;
  type: "instant" | "draw";
  pricePence: number;
  presets: number[];
  /** The button marked "Most popular" (one of presets), or null. */
  popularPreset?: number | null;
  /** Fewest tickets in one order (1 unless the competition sets more). */
  minTickets?: number;
  maxPerPerson: number;
  heldByMe: number;
  ticketsLeft: number;
  open: boolean;
  /** Set while the competition is scheduled: when entries open. */
  opensAt?: string | null;
  salesOpen: boolean;
  signedIn: boolean;
  playBlock: string | null;
}

const BLOCK_TEXT: Record<string, string> = {
  staff: "Staff accounts can't enter competitions.",
  self_excluded: "Your account is self-excluded, so you can't enter right now.",
  cool_off: "You're on a break, so you can't enter right now.",
  on_hold: "Your account is on hold. Please contact us.",
  closed: "This account is closed.",
  under_18: "You must be 18 or over to enter.",
  no_date_of_birth: "Add your date of birth in Settings before you enter.",
  email_unverified: "Please confirm your email address before you enter — check your inbox.",
};

export default function TicketPicker(p: PickerProps) {
  const cap = Math.max(0, Math.min(p.maxPerPerson - p.heldByMe, p.ticketsLeft));
  // The minimum order, unless fewer than that are left for this player.
  const min = Math.max(1, Math.min(p.minTickets ?? 1, cap || 1));
  const popular = p.popularPreset && p.presets.includes(p.popularPreset) ? p.popularPreset : null;
  const [qty, setQty] = useState(() => Math.max(min, Math.min(cap || 1, popular ?? p.presets[1] ?? p.presets[0] ?? 1)));
  const [typed, setTyped] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const clamp = (n: number) => Math.max(min, Math.min(cap || 1, Math.floor(n) || 1));
  const set = (n: number) => {
    setQty(clamp(n));
    setTyped(null);
    setAdded(false);
  };
  const total = qty * p.pricePence;
  const buyHref = useMemo(() => {
    const target = `/checkout?buy=${encodeURIComponent(`${p.competitionId}:${qty}`)}`;
    return p.signedIn ? target : `/join?next=${encodeURIComponent(target)}`;
  }, [p.competitionId, qty, p.signedIn]);

  const blocked = !p.open ? (p.opensAt ? `Entries open ${ukDateTime(p.opensAt)}.` : "This competition isn't open for entries.") : !p.salesOpen ? "Entries open soon." : cap === 0 ? (p.ticketsLeft === 0 ? "Sold out." : `You've reached the ${formatCount(p.maxPerPerson)} ticket limit for this competition.`) : p.playBlock ? BLOCK_TEXT[p.playBlock] ?? "You can't enter right now." : null;
  const verb = p.type === "draw" ? "Enter Draw" : "Buy & Play";

  return (
    <div className="card card-hot card-p stack g16 gg-rise gg-d4" data-testid="ticket-picker">
      <div className="row between g12">
        <div>
          <div className="eyebrow">Per ticket</div>
          <div className="d np" style={{ fontSize: 44, lineHeight: 1 }}>{formatPence(p.pricePence)}</div>
        </div>
        <div className="stepper">
          <button type="button" aria-label="One fewer ticket" onClick={() => set(qty - 1)} disabled={!!blocked || qty <= min}><Svg name="minus" size={18} stroke={2.6} /></button>
          <output className="qty" aria-live="polite" data-testid="qty">{qty}</output>
          <button type="button" className="plus" aria-label="One more ticket" onClick={() => set(qty + 1)} disabled={!!blocked || qty >= cap}><Svg name="plus" size={18} stroke={2.6} /></button>
        </div>
      </div>

      <div className="stack g8">
        <span className="lbl">How many tickets?</span>
        <div className="r4" style={popular ? { rowGap: 16, paddingTop: 6 } : undefined}>
          {p.presets.map((n) => (
            <button key={n} type="button" className={qty === n ? "pick on" : "pick"} aria-pressed={qty === n} disabled={!!blocked || n > cap || n < min} onClick={() => set(n)} style={n === popular ? { position: "relative" } : undefined}>
              {n === popular && <span className="pick-pop" data-testid="most-popular">Most popular</span>}
              {formatCount(n)}
              <small>{formatMoney(n * p.pricePence)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="stack g8">
        <div className="row between g12"><label className="lbl" htmlFor={`qty-${p.slug}`}>Or choose your own amount</label><span className="hint">{formatCount(min)}–{formatCount(cap || 1)}</span></div>
        <div className="row g8">
          <input
            className="inp" id={`qty-${p.slug}`} type="number" inputMode="numeric" min={min} max={cap || 1}
            value={typed ?? String(qty)} disabled={!!blocked}
            onChange={(e) => { setTyped(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= min) { setQty(clamp(n)); setAdded(false); } }}
            onBlur={() => setTyped(null)}
            style={{ flex: 1, fontFamily: "'Lilita One',sans-serif", fontSize: 22, textAlign: "center" }}
          />
          <span className="muted" style={{ fontWeight: 800 }}>tickets</span>
        </div>
        <input type="range" className="gg-range" min={min} max={cap || 1} value={qty} disabled={!!blocked} onChange={(e) => set(Number(e.target.value))} aria-label="Number of tickets" />
      </div>

      <div className="row between wrapx g12" style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
        <div>
          <div className="eyebrow">To pay</div>
          <div className="d ny" style={{ fontSize: 38, lineHeight: 1 }} data-testid="total">{formatMoney(total)}</div>
          <div className="hint">{formatCount(qty)} × {formatPence(p.pricePence)}{min > 1 ? ` · min ${formatCount(min)}` : ""}</div>
        </div>
        <div className="stack g8" style={{ flex: 1, minWidth: 200 }}>
          {blocked ? (
            <span className="btn btn-o btn-lg" aria-disabled="true">{(p.open && !p.salesOpen) || p.opensAt ? "Entries Open Soon" : "Unavailable"}</span>
          ) : (
            <>
              <a className="btn btn-y btn-lg gg-cta" href={buyHref}>{verb} · {formatMoney(total)}</a>
              <button type="button" className="btn btn-o" onClick={() => { addToBasket(p.competitionId, qty); setAdded(true); }}>Add To Basket</button>
            </>
          )}
        </div>
      </div>

      {blocked && <div className="notice notice-p" role="status"><Svg name="info" size={18} /><span>{blocked}</span></div>}
      {added && <div className="notice notice-c gg-pop" role="status"><Svg name="check" size={18} stroke={2.6} /><span>Added {qty} {qty === 1 ? "ticket" : "tickets"} to your basket. <a href="/basket" style={{ color: "#22E6FF" }}>View basket</a> or keep browsing.</span></div>}
      <div className="row g8 wrapx hint"><Svg name="lock" size={14} /> Wallet or card <span style={{ marginLeft: "auto" }}>Max {formatCount(p.maxPerPerson)} per person</span></div>
    </div>
  );
}
