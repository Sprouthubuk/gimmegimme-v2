import { useEffect, useState } from "react";
import { api, errorText } from "../lib/api";
import { onBasketChange, readBasket, removeFromBasket, setQuantity } from "../lib/basket";
import { formatMoney, formatPence } from "../lib/money";
import type { BasketLine, PricedBasket } from "../lib/types";
import { Svg } from "./Svg";

export default function BasketView({ signedIn }: { signedIn: boolean }) {
  const [lines, setLines] = useState<BasketLine[] | null>(null);
  const [priced, setPriced] = useState<PricedBasket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);

  useEffect(() => {
    setLines(readBasket());
    return onBasketChange(setLines);
  }, []);

  useEffect(() => {
    if (!lines) return;
    if (!lines.length) { setPriced(null); return; }
    let live = true;
    api<PricedBasket>("/api/basket/price", { json: { lines, promoCode: promoApplied } })
      .then((p) => { if (live) { setPriced(p); setError(null); } })
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [lines, promoApplied]);

  if (lines === null) return <div className="card empty"><span className="spin" /> Loading your basket…</div>;
  if (!lines.length) return (
    <div className="card card-p stack g12" style={{ alignItems: "center", textAlign: "center" }} data-testid="basket-empty">
      <span style={{ color: "#8E84A0" }}><Svg name="cart" size={36} /></span>
      <div className="h3">Your Basket Is Empty</div>
      <p className="p">Pick a competition and your tickets will wait here.</p>
      <a className="btn btn-y gg-cta" href="/competitions">Browse Competitions</a>
    </div>
  );

  const checkoutHref = signedIn ? "/checkout" : `/join?next=${encodeURIComponent("/checkout")}`;
  return (
    <div className="split">
      <div className="stack g12">
        {(priced?.lines ?? lines.map((l) => null)).map((pl, i) => {
          const line = lines[i];
          if (!pl) return <div key={line?.competitionId ?? i} className="card card-p empty"><span className="spin" /></div>;
          return (
            <div key={pl.competitionId} className="card card-p row g12 gg-card" style={{ alignItems: "flex-start" }} data-testid="basket-line">
              <img src={pl.imageSmall} alt="" style={{ width: 76, height: 76, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
              <div className="stack g8" style={{ flex: 1, minWidth: 0 }}>
                <div className="row between g8" style={{ alignItems: "flex-start" }}>
                  <div><a href={`/competitions/${pl.slug}`} className="d" style={{ fontSize: 18, lineHeight: 1.1, color: "#fff", textDecoration: "none" }}>{pl.title}</a><div className="hint">{pl.type === "draw" ? "Live draw" : "Instant win"} · {formatPence(pl.unitPence)} each</div></div>
                  <button type="button" className="ib" aria-label={`Remove ${pl.title}`} style={{ width: 36, height: 36, color: "#8E84A0" }} onClick={() => removeFromBasket(pl.competitionId)}><Svg name="trash" size={16} /></button>
                </div>
                <div className="row between">
                  <div className="stepper">
                    <button type="button" aria-label="One fewer ticket" style={{ width: 38, height: 38 }} onClick={() => setQuantity(pl.competitionId, pl.quantity - 1)}><Svg name="minus" size={16} stroke={2.6} /></button>
                    <span className="qty" style={{ fontSize: 22, minWidth: 40 }}>{pl.quantity}</span>
                    <button type="button" className="plus" aria-label="One more ticket" style={{ width: 38, height: 38 }} disabled={pl.quantity >= pl.maxQuantity} onClick={() => setQuantity(pl.competitionId, pl.quantity + 1)}><Svg name="plus" size={16} stroke={2.6} /></button>
                  </div>
                  <span className="d ny" style={{ fontSize: 22 }}>{formatMoney(pl.linePence)}</span>
                </div>
                {pl.problem && <div className="err" role="alert">{pl.problem}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky">
        <div className="card card-hot card-p stack g12">
          <details className="acd" style={{ background: "transparent" }}>
            <summary style={{ padding: 0, minHeight: 44 }}>Have A Promo Code? <Svg name="down" /></summary>
            <form className="row g8" style={{ paddingTop: 10 }} onSubmit={(e) => { e.preventDefault(); setPromoApplied(promo.trim() || null); }}>
              <input className="inp" placeholder="Enter code" aria-label="Promo code" value={promo} onChange={(e) => setPromo(e.target.value)} />
              <button type="submit" className="btn btn-o">Apply</button>
            </form>
            {priced?.promo && <div className="hint" style={{ marginTop: 6 }}>{priced.promo.code}: −{formatMoney(priced.promo.discountPence)}</div>}
          </details>
          <div className="row between" style={{ fontWeight: 800 }}><span className="muted">{priced?.ticketCount ?? "…"} tickets · {lines.length} {lines.length === 1 ? "comp" : "comps"}</span></div>
          <div className="row between" style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 12 }}><span className="d" style={{ fontSize: 22 }}>Total</span><span className="d ny" style={{ fontSize: 34 }} data-testid="basket-total">{priced ? formatMoney(priced.totalPence) : "…"}</span></div>
          {signedIn && priced?.walletCovers && <div className="notice notice-c"><Svg name="wallet" size={18} /><span>Your wallet covers this — checkout takes one tap.</span></div>}
          {(priced?.problems ?? []).map((p) => <div key={p} className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{p}</span></div>)}
          {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
          <a className="btn btn-y btn-lg btn-block gg-cta" href={checkoutHref} aria-disabled={!priced || priced.problems.length > 0 || priced.lines.some((l) => l.problem) ? "true" : undefined}>Checkout · {priced ? formatMoney(priced.totalPence) : "…"}</a>
          <a className="btn btn-o btn-block" href="/competitions">Keep Browsing</a>
        </div>
      </div>
    </div>
  );
}
