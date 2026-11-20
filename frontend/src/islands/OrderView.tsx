import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/api";
import { formatMoney, formatCount } from "../lib/money";
import { ukDateTime } from "../lib/time";
import { lineMakeup } from "../lib/bundles";
import type { CheckoutResult, CompetitionSummary, OrderView as Order, PlayResult, PricedBasket } from "../lib/types";
import { Svg } from "./Svg";
import { trackPurchaseOnce } from "../lib/consent";

const ArcadeReveal = lazy(() => import("../games/arcade/ArcadeReveal"));

const POLL_MS = 3000;
const POLL_LIMIT = 40; // about two minutes

export default function OrderView({ number, initial }: { number: string; initial: Order }) {
  const [order, setOrder] = useState<Order>(initial);
  const [error, setError] = useState<string | null>(null);
  const [play, setPlay] = useState<PlayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const polls = useRef(0);

  const refresh = useCallback(async () => {
    const o = await api<Order>(`/api/orders/${encodeURIComponent(number)}`);
    setOrder(o);
    return o;
  }, [number]);

  // Meta Pixel (only with marketing cookies accepted): one Purchase per paid order.
  useEffect(() => {
    if (order.status === "paid") trackPurchaseOnce(order.number, order.totalPence);
  }, [order.status, order.number, order.totalPence]);

  // A card payment may still be on its way back from Cashflows: ask the server to check with them.
  useEffect(() => {
    if (order.status !== "pending_payment" && order.status !== "created") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      polls.current += 1;
      try {
        const o = await api<Order>(`/api/orders/${encodeURIComponent(number)}/return`, { json: {} });
        setOrder(o);
        if ((o.status === "pending_payment" || o.status === "created") && polls.current < POLL_LIMIT) setTimeout(tick, POLL_MS);
      } catch (e) {
        if (polls.current < POLL_LIMIT) setTimeout(tick, POLL_MS);
        else setError(errorText(e));
      }
    };
    tick();
    return () => { stop = true; };
  }, [number, order.status]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<PlayResult>(`/api/orders/${encodeURIComponent(number)}/play`, { json: {} });
      setPlay(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (order.status === "pending_payment" || order.status === "created") {
    return (
      <div className="card card-p stack g12" style={{ alignItems: "center", textAlign: "center" }} data-testid="order-pending">
        <span className="spin" style={{ width: 32, height: 32 }} />
        <div className="h3">Confirming Your Payment…</div>
        <p className="p">This usually takes a few seconds. Please don’t pay again.</p>
        {error && <div className="notice notice-p" role="alert"><span>{error} Your order number is <b>{number}</b>.</span></div>}
      </div>
    );
  }

  if (["failed", "cancelled", "expired"].includes(order.status)) {
    return (
      <div className="card card-p stack g12" style={{ alignItems: "center", textAlign: "center" }} data-testid="order-failed">
        <div className="h3">Payment {order.status === "cancelled" ? "Cancelled" : "Not Completed"}</div>
        <p className="p">No money was taken for this order and no tickets were issued. Anything you paid from your wallet has gone back.</p>
        <a className="btn btn-y" href="/basket">Back To Basket</a>
      </div>
    );
  }

  if (order.needsAttention) {
    return (
      <div className="card card-p stack g12" data-testid="order-attention">
        <div className="h3">We’re Sorting Your Order</div>
        <p className="p" style={{ textAlign: "left" }}>Your payment arrived, but we couldn’t issue all your tickets automatically. Our team has been alerted and will be in touch — you don’t need to do anything. Order number <b>{number}</b>.</p>
        <a className="btn btn-o" href="/contact">Contact Us</a>
      </div>
    );
  }

  const instant = order.lines.filter((l) => l.type === "instant");
  const draws = order.lines.filter((l) => l.type === "draw");

  return (
    <div className="stack g16">
      <div className="stack g8 gg-rise" style={{ textAlign: "center", alignItems: "center" }}>
        <span className="gg-pop" style={{ width: 64, height: 64, borderRadius: 999, border: "1px solid #22E6FF", color: "#22E6FF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(34,230,255,.45)" }}><Svg name="check" size={32} stroke={2.6} /></span>
        <h1 className="h1">You’re <span className="np gg-flicker">In!</span></h1>
        <p className="p">Payment confirmed · {order.lines.reduce((n, l) => n + l.quantity, 0)} tickets · {formatMoney(order.totalPence)}</p>
      </div>

      {instant.map((l) => (
        <div key={l.competitionId} className="card card-hot card-p stack g16 gg-rise gg-d2" data-testid="instant-line">
          <div className="row g12"><img src={l.imageSmall} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover" }} /><div style={{ flex: 1 }}><div className="d" style={{ fontSize: 20 }}>{l.title}</div><div className="hint">{l.quantity} {l.quantity === 1 ? "game" : "games"}</div></div></div>
          <div className="stack g8"><span className="eyebrow">Your ticket numbers</span><div className="row wrapx g8">{l.tickets.slice(0, 60).map((t) => <span key={t} className="tn">#{t}</span>)}{l.tickets.length > 60 && <a className="tap" href="/account/tickets">+{formatCount(l.tickets.length - 60)} more in My Tickets</a>}</div></div>
        </div>
      ))}

      {order.toPlay > 0 && !play && !done && (
        <div className="stack g8">
          <button type="button" className="btn btn-y btn-lg btn-block gg-cta" onClick={start} disabled={busy} data-testid="play">{busy ? <span className="spin" /> : <><Svg name="play" size={18} /> Play My {order.toPlay} {order.toPlay === 1 ? "Game" : "Games"}</>}</button>
          <p className="hint" style={{ textAlign: "center", margin: 0 }}>Your results were fixed the moment you paid — the games just show them.</p>
        </div>
      )}
      {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}

      {play && (
        <Suspense fallback={<div className="card empty"><span className="spin" /> Loading your game…</div>}>
          <ArcadeReveal
            key={play.outcome.purchaseId}
            outcome={play.outcome}
            context={play.context}
            onComplete={() => { setPlay(null); setDone(true); refresh().catch(() => undefined); }}
            onGoToWallet={() => window.location.assign("/account/wallet")}
            onPlayAgain={() => window.location.assign(`/competitions/${instant[0]?.slug ?? ""}`)}
          />
        </Suspense>
      )}

      {draws.map((l) => (
        <div key={`${l.competitionId}:${l.bundleLabel ?? ""}`} className="card card-cy card-p stack g12 gg-rise gg-d3" data-testid="draw-line">
          {/* Picture and name on one row; the ticket numbers get the full width underneath (phones too). */}
          <div className="row g12" style={{ alignItems: "center" }}>
            <img src={l.imageSmall} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="d" style={{ fontSize: 20, lineHeight: 1.1 }}>{l.title}</div>
              <div className="row wrapx g8" style={{ marginTop: 6, alignItems: "center" }}>{l.bundleLabel && <span className="tag tag-y">{l.bundleLabel}</span>}<span className="tag tag-c">In The Draw</span></div>
            </div>
          </div>
          <div className="hint">{lineMakeup(l)}{l.drawAt ? ` · live draw ${ukDateTime(l.drawAt)}` : ""}</div>
          <div className="row wrapx g8">{l.tickets.slice(0, 12).map((t) => <span key={t} className="tn">#{t}</span>)}{l.tickets.length > 12 && <a className="hint tap" href="/account/tickets">+{l.tickets.length - 12} more in My Tickets</a>}</div>
        </div>
      ))}

      {instant.length === 0 && <NextDraw exclude={order.lines.map((l) => l.competitionId)} />}

      <div className="r2 gg-rise gg-d4"><a className="btn btn-o" href="/account/tickets">My Tickets</a><a className="btn btn-p" href="/competitions">Play More</a></div>
      <p className="hint" style={{ textAlign: "center", margin: 0 }}>Receipt sent to your email · results are saved in My Tickets</p>
    </div>
  );
}

/**
 * After a live-draw order: one other live draw's featured bundle. Two taps (choose, then confirm the
 * amount), never straight after an instant-win reveal, and it says exactly what will be paid.
 */
function NextDraw({ exclude }: { exclude: string[] }) {
  const [c, setC] = useState<CompetitionSummary | null>(null);
  const [step, setStep] = useState<"offer" | "confirm" | "busy">("offer");
  const [priced, setPriced] = useState<PricedBasket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: CompetitionSummary[] }>("/api/competitions?type=draw")
      .then((r) => setC(r.data.find((x) => x.status === "live" && x.featuredBundle && !exclude.includes(x.id)) ?? null))
      .catch(() => undefined);
  }, [exclude.join(",")]);
  if (!c?.featuredBundle) return null;
  const b = c.featuredBundle;
  const lines = [{ competitionId: c.id, quantity: 0, bundleId: b.id }];

  async function choose() {
    setError(null);
    try {
      const p = await api<PricedBasket>("/api/basket/price", { json: { lines } });
      const problem = p.problems[0] ?? p.lines.find((l) => l.problem)?.problem;
      if (problem) { setError(problem); return; }
      setPriced(p);
      setStep("confirm");
    } catch (e) { setError(errorText(e)); }
  }
  async function pay() {
    setStep("busy");
    try {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
      const r = await api<CheckoutResult>("/api/checkout", { json: { lines, payWith: "wallet", useWallet: true, requestId: id } });
      window.location.assign(`/order/${encodeURIComponent(r.order.number)}`);
    } catch (e) { setError(errorText(e)); setStep("confirm"); }
  }

  return (
    <div className="card card-p stack g12 gg-rise gg-d4" data-testid="next-draw">
      <span className="eyebrow">Another Live Draw</span>
      <div className="row g12">
        <img src={c.imageSmall} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <a className="d" href={`/competitions/${c.slug}`} style={{ fontSize: 18, color: "#fff", textDecoration: "none" }}>{c.title}</a>
          <div className="hint">{b.label} · {formatCount(b.tickets)} tickets for {formatMoney(b.pricePence)}</div>
        </div>
      </div>
      {step === "offer" && <button type="button" className="btn btn-o btn-block" onClick={choose}>Get This Bundle</button>}
      {step !== "offer" && priced && (priced.walletCovers ? (
        <div className="r2">
          <button type="button" className="btn btn-y" onClick={pay} disabled={step === "busy"} data-testid="next-draw-pay">{step === "busy" ? <span className="spin" /> : `Pay ${formatMoney(priced.totalPence)} From Wallet`}</button>
          <button type="button" className="btn btn-o" onClick={() => setStep("offer")}>Not Now</button>
        </div>
      ) : (
        <a className="btn btn-y btn-block" href={`/checkout?buy=${encodeURIComponent(`${c.id}:b${b.id}`)}`}>Pay {formatMoney(priced.totalPence)} By Card</a>
      ))}
      {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
    </div>
  );
}
