import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { api } from "../lib/api";
import { addBundle, addToBasket } from "../lib/basket";
import { trackAddToCart } from "../lib/consent";
import { formatCount, formatMoney, formatPence } from "../lib/money";
import { ukDateTime } from "../lib/time";
import type { Bundle, CompetitionDetail } from "../lib/types";
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
  /** Live draws: the "Buy X Get Y Free" bundles on sale now (only ones that fit). */
  bundles?: Bundle[];
  soldPercent: number;
  soldOut: boolean;
  /** The most tickets one person may hold (null: no limit), and how many this player already has. */
  maxPerPerson?: number | null;
  heldByMe?: number;
  open: boolean;
  /** Set while the competition is scheduled: when entries open. */
  opensAt?: string | null;
  salesOpen: boolean;
  signedIn: boolean;
  playBlock: string | null;
}

export const BLOCK_TEXT: Record<string, string> = {
  staff: "Staff accounts can't enter competitions.",
  self_excluded: "Your account is self-excluded, so you can't enter right now.",
  cool_off: "You're on a break, so you can't enter right now.",
  on_hold: "Your account is on hold. Please contact us.",
  closed: "This account is closed.",
  under_18: "You must be 18 or over to enter.",
  no_date_of_birth: "Add your date of birth in Account → Settings before you enter.",
  email_unverified: "Please confirm your email address before you enter — check your inbox.",
};

/** The largest single-ticket order the picker offers; the server decides what's actually available. */
const MAX_SINGLES = 10000;

type Choice = { kind: "bundle"; id: number } | { kind: "single"; qty: number };

/** "Buy 20 Get 40 Free" with FREE stood out. */
function BundleTitle({ b }: { b: Bundle }) {
  const auto = b.label === `Buy ${b.paid} Get ${b.free} Free`;
  if (!auto) return <span className="bt">{b.label}</span>;
  return <span className="bt">Buy {formatCount(b.paid)} Get <b className="free">{formatCount(b.free)} FREE!</b></span>;
}

export default function TicketPicker(p: PickerProps) {
  const [bundles, setBundles] = useState<Bundle[]>(p.bundles ?? []);
  const [sold, setSold] = useState({ percent: p.soldPercent, out: p.soldOut });
  // The phone's sticky buy bar hides while the picker's own total and buttons are on screen, so it never
  // covers them (or shows the same button twice).
  const actions = useRef<HTMLDivElement>(null);
  const [actionsOnScreen, setActionsOnScreen] = useState(false);
  useEffect(() => {
    const el = actions.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setActionsOnScreen(e.isIntersecting), { rootMargin: "0px 0px -140px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const min = Math.max(1, p.minTickets ?? 1);
  const popular = p.popularPreset && p.presets.includes(p.popularPreset) ? p.popularPreset : null;
  const best = bundles.find((b) => b.ourPick) ?? null;
  const [choice, setChoice] = useState<Choice>(() =>
    best ? { kind: "bundle", id: best.id } : { kind: "single", qty: Math.max(min, popular ?? p.presets[1] ?? p.presets[0] ?? 1) });
  const [typed, setTyped] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // Live draws: % sold and the bundles that still fit are re-read every minute. A bundle that no
  // longer fits disappears; if it was chosen, the choice falls back to single tickets.
  useEffect(() => {
    if (p.type !== "draw" || !p.open) return;
    const t = window.setInterval(async () => {
      try {
        const c = await api<CompetitionDetail>(`/api/competitions/${encodeURIComponent(p.slug)}`);
        setBundles(Array.isArray(c.bundles) ? c.bundles : []);
        setSold({ percent: c.soldPercent ?? 0, out: c.status === "sold_out" });
        window.dispatchEvent(new CustomEvent("gg-sold", { detail: { slug: p.slug, percent: c.soldPercent ?? 0, max: c.maxTickets, sold: c.ticketsSold, left: c.ticketsLeft } }));
      } catch { /* try again next minute */ }
    }, 60000);
    return () => window.clearInterval(t);
  }, [p.slug, p.type, p.open]);

  const chosenBundle = choice.kind === "bundle" ? bundles.find((b) => b.id === choice.id) ?? null : null;
  useEffect(() => {
    if (choice.kind === "bundle" && !chosenBundle) setChoice({ kind: "single", qty: min });
  }, [choice, chosenBundle, min]);

  const qty = choice.kind === "single" ? choice.qty : 0;
  const tickets = chosenBundle ? chosenBundle.tickets : qty;
  const total = chosenBundle ? chosenBundle.pricePence : qty * p.pricePence;
  const paidNow = chosenBundle ? chosenBundle.paid : qty;
  // One nudge: the smallest bundle that gives more tickets for at least as many paid ones.
  const next = bundles.filter((b) => b.paid >= paidNow && b.tickets > tickets && b.id !== chosenBundle?.id).sort((a, b) => a.tickets - b.tickets)[0] ?? null;

  // The most this player can still buy: the per-person limit less what they hold (the server checks it again).
  const allowance = p.maxPerPerson ? Math.max(0, p.maxPerPerson - (p.heldByMe ?? 0)) : null;
  const maxSingles = allowance === null ? MAX_SINGLES : Math.min(MAX_SINGLES, allowance);
  const clamp = (n: number) => Math.max(min, Math.min(maxSingles, Math.floor(n) || min));
  const setSingles = (n: number) => { setChoice({ kind: "single", qty: clamp(n) }); setTyped(null); setAdded(null); };
  const pickBundle = (b: Bundle) => { setChoice({ kind: "bundle", id: b.id }); setAdded(null); };

  const buyHref = useMemo(() => {
    const target = `/checkout?buy=${encodeURIComponent(`${p.competitionId}:${chosenBundle ? `b${chosenBundle.id}` : qty}`)}`;
    return p.signedIn ? target : `/join?next=${encodeURIComponent(target)}`;
  }, [p.competitionId, chosenBundle, qty, p.signedIn]);

  const blocked = !p.open ? (p.opensAt ? `Entries open ${ukDateTime(p.opensAt)}.` : "This competition isn't open for entries.")
    : sold.out ? "Sold out."
    : !p.salesOpen ? "Entries open soon."
    : p.playBlock ? BLOCK_TEXT[p.playBlock] ?? "You can't enter right now."
    : allowance !== null && allowance < min ? `You have the maximum of ${formatCount(p.maxPerPerson ?? 0)} tickets for this competition.` : null;
  const verb = p.type === "draw" ? "Enter Now" : "Buy & Play";
  const addToBasketNow = () => {
    if (chosenBundle) addBundle(p.competitionId, chosenBundle.id);
    else addToBasket(p.competitionId, qty);
    trackAddToCart(p.slug, chosenBundle ? chosenBundle.tickets : qty, total);
    setAdded(chosenBundle ? chosenBundle.label : `${formatCount(qty)} ${qty === 1 ? "ticket" : "tickets"}`);
  };
  // "Enter Now" / "Buy & Play" go straight to checkout: tell Meta it's an Add to Cart too. With the Pixel running,
  // wait a moment so the event leaves before the page changes; without it (no consent) the link just works.
  const buyNow = (e: MouseEvent<HTMLAnchorElement>) => {
    trackAddToCart(p.slug, tickets, total);
    if (!window.fbq || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const href = e.currentTarget.href;
    setTimeout(() => { location.href = href; }, 150);
  };
  const ticketWord = (n: number) => `${formatCount(n)} ${n === 1 ? "ticket" : "tickets"}`;

  return (
    <div className="card card-hot card-p stack g16 gg-rise gg-d4" data-testid="ticket-picker">
      {bundles.length > 0 && !blocked && (
        <div className="stack g8">
          <span className="lbl">Bundles · free tickets included</span>
          <div className="bgrid" role="radiogroup" aria-label="Ticket bundles">
            {bundles.map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={chosenBundle?.id === b.id} className={`bcard ${chosenBundle?.id === b.id ? "on" : ""}`} onClick={() => pickBundle(b)} data-testid="bundle">
                {b.ourPick && <span className="ribbon">Our Pick</span>}
                <BundleTitle b={b} />
                <span className="bp">{ticketWord(b.tickets)} for <b>{formatMoney(b.pricePence)}</b></span>
                <span className="bs">Save {formatMoney(b.savePence)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={bundles.length > 0 ? "singles quiet" : "singles"}>
        <div className="row between g12">
          <div>
            <div className="eyebrow">{bundles.length > 0 ? "Or single tickets" : "Per ticket"}</div>
            <div className={`d np ${bundles.length > 0 ? "" : "big"}`} style={{ lineHeight: 1 }}>{formatPence(p.pricePence)}<small className="each"> each</small></div>
          </div>
          <div className="stepper">
            <button type="button" aria-label="One fewer ticket" onClick={() => setSingles((choice.kind === "single" ? qty : min + 1) - 1)} disabled={!!blocked || (choice.kind === "single" && qty <= min)}><Svg name="minus" size={18} stroke={2.6} /></button>
            <output className="qty" aria-live="polite" data-testid="qty">{choice.kind === "single" ? qty : "–"}</output>
            <button type="button" className="plus" aria-label="One more ticket" onClick={() => setSingles(choice.kind === "single" ? qty + 1 : min)} disabled={!!blocked || qty >= maxSingles}><Svg name="plus" size={18} stroke={2.6} /></button>
          </div>
        </div>

        {bundles.length === 0 && (
          <div className="stack g8" style={{ marginTop: 14 }}>
            <span className="lbl">How many tickets?</span>
            <div className="r4" style={popular ? { rowGap: 16, paddingTop: 6 } : undefined}>
              {p.presets.map((n) => (
                <button key={n} type="button" className={choice.kind === "single" && qty === n ? "pick on" : "pick"} aria-pressed={choice.kind === "single" && qty === n} disabled={!!blocked || n < min} onClick={() => setSingles(n)} style={n === popular ? { position: "relative" } : undefined}>
                  {n === popular && <span className="pick-pop" data-testid="most-popular">Most popular</span>}
                  {formatCount(n)}
                  <small>{formatMoney(n * p.pricePence)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="stack g8" style={{ marginTop: 14 }}>
            <label className="lbl" htmlFor={`qty-${p.slug}`} style={{ marginTop: 4 }}>Or choose your own amount</label>
            <div className="row g8">
              <input
                className="inp" id={`qty-${p.slug}`} type="number" inputMode="numeric" min={min} max={maxSingles}
                value={typed ?? (choice.kind === "bundle" ? "" : String(qty || min))} placeholder="Type a number" disabled={!!blocked}
                onChange={(e) => { setTyped(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= min) { setChoice({ kind: "single", qty: clamp(n) }); setAdded(null); } }}
                onBlur={() => setTyped(null)}
                style={{ flex: 1, fontFamily: "'Lilita One',sans-serif", fontSize: 22, textAlign: "center" }}
              />
              <span className="muted" style={{ fontWeight: 800 }}>tickets</span>
            </div>
          {allowance !== null && <span className="hint" data-testid="per-person">Max {formatCount(p.maxPerPerson ?? 0)} per person{p.heldByMe ? ` · you have ${formatCount(p.heldByMe)}` : ""}</span>}
        </div>
      </div>

      <div ref={actions} className="row between wrapx g12" style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
        <div>
          <div className="eyebrow">To pay</div>
          <div className="d ny" style={{ fontSize: 38, lineHeight: 1 }} data-testid="total">{formatMoney(total)}</div>
          <div className="hint">{chosenBundle ? `${formatCount(chosenBundle.paid)} paid + ${formatCount(chosenBundle.free)} free = ${ticketWord(chosenBundle.tickets)}` : `${formatCount(qty)} × ${formatPence(p.pricePence)}`}{min > 1 && !chosenBundle ? ` · min ${formatCount(min)}` : ""}</div>
        </div>
        <div className="stack g8" style={{ flex: 1, minWidth: 200 }}>
          {blocked ? (
            <span className="btn btn-o btn-lg" aria-disabled="true">{sold.out ? "Sold Out" : (p.open && !p.salesOpen) || p.opensAt ? "Entries Open Soon" : "Unavailable"}</span>
          ) : (
            <>
              <a className="btn btn-y btn-lg gg-cta" href={buyHref} onClick={buyNow} data-testid="buy-now">{verb} · {formatMoney(total)}</a>
              <button type="button" className="btn btn-o" onClick={addToBasketNow}>Add To Basket</button>
            </>
          )}
        </div>
      </div>

      {!blocked && next && (
        <button type="button" className="upsell" data-testid="nudge" onClick={() => pickBundle(next)}>
          <span>Add {formatCount(next.paid - paidNow)} more paid {next.paid - paidNow === 1 ? "ticket" : "tickets"} ({formatMoney((next.paid - paidNow) * p.pricePence)}) and get <b className="ny">{formatCount(next.free)} FREE</b></span>
          <Svg name="arrow" size={16} stroke={3} />
        </button>
      )}

      {bundles.length > 0 && <p className="hint" style={{ margin: 0 }}>Bundle and free tickets are entered into the draw exactly like paid tickets.</p>}
      {blocked && <div className="notice notice-p" role="status"><Svg name="info" size={18} /><span>{blocked}</span></div>}
      {added && <div className="notice notice-c gg-pop" role="status"><Svg name="check" size={18} stroke={2.6} /><span>Added {added} to your basket. <a href="/basket" style={{ color: "#22E6FF" }}>View basket</a> or keep browsing.</span></div>}

      {!blocked && (
        <div className={`buybar${actionsOnScreen ? " buybar-away" : ""}`} data-testid="buy-bar" aria-hidden={actionsOnScreen || undefined}>
          <a className="btn btn-y btn-block gg-cta" href={buyHref} onClick={buyNow} tabIndex={actionsOnScreen ? -1 : undefined}>{ticketWord(tickets)} · {formatMoney(total)} <Svg name="arrow" size={16} stroke={3} /> {verb}</a>
        </div>
      )}
    </div>
  );
}
