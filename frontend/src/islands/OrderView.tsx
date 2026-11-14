import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/api";
import { formatMoney, formatCount } from "../lib/money";
import { ukDateTime } from "../lib/time";
import type { OrderView as Order, PlayResult } from "../lib/types";
import { Svg } from "./Svg";

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
        <div key={l.competitionId} className="card card-cy card-p row g12 gg-rise gg-d3" data-testid="draw-line">
          <img src={l.imageSmall} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover" }} />
          <div style={{ flex: 1 }}><div className="d" style={{ fontSize: 20 }}>{l.title}</div><div className="hint">{l.quantity} tickets{l.drawAt ? ` · live draw ${ukDateTime(l.drawAt)}` : ""}</div><div className="row wrapx g8" style={{ marginTop: 8 }}>{l.tickets.slice(0, 12).map((t) => <span key={t} className="tn">#{t}</span>)}{l.tickets.length > 12 && <span className="hint">+{l.tickets.length - 12} more</span>}</div></div>
          <span className="tag tag-c">In The Draw</span>
        </div>
      ))}

      <div className="r2 gg-rise gg-d4"><a className="btn btn-o" href="/account/tickets">My Tickets</a><a className="btn btn-p" href="/competitions">Play More</a></div>
      <p className="hint" style={{ textAlign: "center", margin: 0 }}>Receipt sent to your email · results are saved in My Tickets</p>
    </div>
  );
}
