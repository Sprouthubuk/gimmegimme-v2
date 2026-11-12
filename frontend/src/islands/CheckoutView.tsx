import { useEffect, useMemo, useState } from "react";
import { api, errorText } from "../lib/api";
import { clearBasket, readBasket, setAside } from "../lib/basket";
import { formatMoney, formatPence } from "../lib/money";
import type { BasketLine, CheckoutResult, PricedBasket } from "../lib/types";
import { Svg } from "./Svg";

function parseBuy(buy: string | null): BasketLine[] | null {
  if (!buy) return null;
  const m = buy.match(/^([A-Za-z0-9-]{1,64}):(\d{1,5})$/);
  return m ? [{ competitionId: m[1], quantity: Number(m[2]) }] : null;
}

function requestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CheckoutView({ buy, walletPence, minCardPence }: { buy: string | null; walletPence: number; minCardPence: number }) {
  const direct = useMemo(() => parseBuy(buy), [buy]);
  const [lines, setLines] = useState<BasketLine[] | null>(null);
  const [priced, setPriced] = useState<PricedBasket | null>(null);
  const [pay, setPay] = useState<"wallet" | "card">("wallet");
  const [useWallet, setUseWallet] = useState(true);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rid] = useState(requestId);

  useEffect(() => { setLines(direct ?? readBasket()); }, [direct]);
  useEffect(() => {
    if (!lines?.length) return;
    api<PricedBasket>("/api/basket/price", { json: { lines, promoCode: promoApplied } })
      .then((p) => { setPriced(p); setPay(p.walletCovers ? "wallet" : "card"); setError(null); })
      .catch((e) => setError(errorText(e)));
  }, [lines, promoApplied]);

  if (lines && !lines.length) return <div className="card card-p stack g12" style={{ alignItems: "center", textAlign: "center" }}><div className="h3">Nothing To Pay For</div><p className="p">Your basket is empty.</p><a className="btn btn-y" href="/competitions">Browse Competitions</a></div>;
  if (!priced) return <div className="card empty">{error ?? <><span className="spin" /> Getting your order ready…</>}</div>;

  const total = priced.totalPence;
  const walletPart = pay === "wallet" ? total : useWallet ? Math.min(walletPence, total) : 0;
  const cardPart = total - walletPart;
  const cardTooSmall = pay === "card" && cardPart > 0 && cardPart < minCardPence;
  const blocked = priced.problems.length > 0 || priced.lines.some((l) => l.problem);

  async function submit() {
    if (!lines) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<CheckoutResult>("/api/checkout", { json: { lines, payWith: pay, useWallet: pay === "wallet" || useWallet, promoCode: promoApplied, requestId: rid } });
      if (res.next === "redirect" && res.redirectUrl) {
        if (!direct) setAside(res.order.number);
        window.location.assign(res.redirectUrl);
        return;
      }
      if (!direct) clearBasket();
      window.location.assign(`/order/${encodeURIComponent(res.order.number)}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="stack g16">
      <div className="card gg-rise gg-d2" style={{ overflow: "hidden" }}>
        {priced.lines.map((l, i) => (
          <div key={l.competitionId} className="row g12" style={{ padding: "14px 16px", borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
            <img src={l.image} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 900 }}>{l.title}</div><div className="hint">{l.quantity} × {formatPence(l.unitPence)} · {l.type === "draw" ? "live draw" : "instant win"}</div>{l.problem && <div className="err">{l.problem}</div>}</div>
            <b>{formatMoney(l.linePence)}</b>
          </div>
        ))}
        <div className="row between" style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.06)" }}>{direct ? <span /> : <a href="/basket" style={{ fontWeight: 800, fontSize: 14 }}>Edit basket</a>}<span className="d ny" style={{ fontSize: 26 }}>{formatMoney(total)}</span></div>
      </div>

      <fieldset className="stack g8 gg-rise gg-d3" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eyebrow" style={{ marginBottom: 8 }}>How would you like to pay?</legend>
        <label className="opt" style={!priced.walletCovers ? { opacity: 0.55 } : undefined}>
          <input type="radio" name="pay" checked={pay === "wallet"} disabled={!priced.walletCovers} onChange={() => setPay("wallet")} />
          <span style={{ flex: 1 }}><b className="d" style={{ fontSize: 18 }}>Wallet</b><span className="hint" style={{ display: "block" }}>{formatMoney(walletPence)} available · {priced.walletCovers ? "instant, no card needed" : "not enough for this order"}</span></span>
          {priced.walletCovers && <span className="tag tag-y">Fastest</span>}
        </label>
        <label className="opt">
          <input type="radio" name="pay" checked={pay === "card"} onChange={() => setPay("card")} />
          <span style={{ flex: 1 }}><b className="d" style={{ fontSize: 18 }}>Debit Or Credit Card</b><span className="hint" style={{ display: "block" }}>On Cashflows’ secure payment page · from {formatMoney(minCardPence)}</span></span>
          <Svg name="card" />
        </label>
        {pay === "card" && walletPence > 0 && (
          <label className="row g12" style={{ padding: "6px 2px", cursor: "pointer" }}>
            <input type="checkbox" className="sw" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Use my {formatMoney(Math.min(walletPence, total))} wallet balance first</span>
          </label>
        )}
      </fieldset>

      <details className="acd gg-rise gg-d4">
        <summary>Promo Code <Svg name="down" /></summary>
        <form className="ab row g8" onSubmit={(e) => { e.preventDefault(); setPromoApplied(promo.trim() || null); }}>
          <input className="inp" placeholder="Enter code" aria-label="Promo code" value={promo} onChange={(e) => setPromo(e.target.value)} />
          <button type="submit" className="btn btn-o">Apply</button>
        </form>
      </details>

      <div className="card card-hot card-p stack g12 gg-rise gg-d5">
        <div className="row between"><span className="d" style={{ fontSize: 22 }}>To Pay</span><span className="d ny" style={{ fontSize: 38 }} data-testid="checkout-total">{formatMoney(total)}</span></div>
        {pay === "card" && walletPart > 0 && <div className="hint">{formatMoney(walletPart)} from your wallet · {formatMoney(cardPart)} by card</div>}
        {cardTooSmall && <div className="notice notice-y" role="alert"><Svg name="info" size={18} /><span>Card payments start at {formatMoney(minCardPence)}. Add a few more tickets, or <a href="/account/wallet" style={{ color: "#FFF23A" }}>top up your wallet</a> and pay from there.</span></div>}
        {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
        <button type="button" className="btn btn-y btn-lg btn-block gg-cta" onClick={submit} disabled={busy || blocked || cardTooSmall} data-testid="pay">
          {busy ? <span className="spin" /> : pay === "wallet" ? `Pay ${formatMoney(total)} From Wallet` : `Pay ${formatMoney(cardPart)} By Card`}
        </button>
        {pay === "card" && <div className="notice notice-c"><Svg name="lock" size={18} /><span>You’ll go to Cashflows’ secure payment page, then come straight back here to play.</span></div>}
        <p className="hint" style={{ margin: 0, lineHeight: 1.5 }}>By paying you confirm you’re 18+ and in the UK, accept the <a href="/legal/terms">T&amp;Cs</a>, and want your tickets now — so the 14-day cancellation right ends once they’re allocated.</p>
      </div>
    </div>
  );
}
