import { useState } from "react";
import { api, errorText } from "../lib/api";
import { formatMoney, parsePounds } from "../lib/money";
import { Svg } from "./Svg";

export default function WalletActions({ minDepositPence, maxTopUpPence, minWithdrawalPence, withdrawablePence, blocked }: { minDepositPence: number; maxTopUpPence: number; minWithdrawalPence: number; withdrawablePence: number; blocked: string | null }) {
  const presets = [500, 1000, 2000, 5000].filter((p) => p >= minDepositPence && p <= maxTopUpPence);
  const [amount, setAmount] = useState<number | null>(presets[2] ?? presets[0] ?? minDepositPence);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wAmount, setWAmount] = useState("");
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const chosen = custom ? parsePounds(custom) : amount;
  const invalid = chosen == null || chosen < minDepositPence || chosen > maxTopUpPence;

  async function topUp() {
    if (invalid || chosen == null) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ redirectUrl: string }>("/api/me/deposits", { json: { amountPence: chosen } });
      window.location.assign(r.redirectUrl);
    } catch (e) {
      setError(errorText(e, "amountPence"));
      setBusy(false);
    }
  }
  async function withdraw() {
    const p = parsePounds(wAmount);
    if (p == null) { setWMsg({ ok: false, text: "Enter an amount, e.g. 25.00" }); return; }
    try {
      await api("/api/me/withdrawals", { json: { amountPence: p } });
      setWMsg({ ok: true, text: "Request sent. We’ll check your ID and pay it to your bank — usually within 3 working days." });
      setWAmount("");
    } catch (e) {
      setWMsg({ ok: false, text: errorText(e, "amountPence") });
    }
  }

  return (
    <div className="split" style={{ gap: 16 }}>
      <div className="card card-hot card-p stack g12" id="top-up">
        <h2 className="h3">Top Up</h2>
        <div className="r4" role="radiogroup" aria-label="Amount">
          {presets.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={!custom && amount === p} className={!custom && amount === p ? "pick on" : "pick"} onClick={() => { setAmount(p); setCustom(""); }}>{formatMoney(p).replace(".00", "")}</button>
          ))}
        </div>
        <div className="field"><label htmlFor="ca">Or enter an amount</label><input className="inp" id="ca" inputMode="decimal" placeholder={`£ min ${formatMoney(minDepositPence)}`} value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={!!custom && invalid || undefined} /></div>
        {custom && invalid && <span className="err">Enter between {formatMoney(minDepositPence)} and {formatMoney(maxTopUpPence)}.</span>}
        {blocked && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{blocked}</span></div>}
        {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
        <button type="button" className="btn btn-y btn-lg btn-block gg-cta" disabled={busy || invalid || !!blocked} onClick={topUp}>{busy ? <span className="spin" /> : `Top Up ${chosen && !invalid ? formatMoney(chosen) : ""} By Card`}</button>
        <div className="hint" style={{ textAlign: "center" }}><Svg name="lock" size={12} /> Secure payment via Cashflows</div>
      </div>
      <div className="card card-p stack g12" id="withdraw">
        <h2 className="h3">Withdraw</h2>
        <p className="p" style={{ fontSize: 14, textAlign: "left" }}>Cash out winnings to your bank from {formatMoney(minWithdrawalPence)}. We’ll ask for ID the first time.</p>
        <div className="bar cy"><div style={{ width: `${Math.min(100, (withdrawablePence / minWithdrawalPence) * 100)}%` }} /></div>
        <div className="row between hint"><span>{formatMoney(withdrawablePence)} withdrawable</span><span>{formatMoney(minWithdrawalPence)} minimum</span></div>
        {withdrawablePence >= minWithdrawalPence ? (
          <>
            <div className="field"><label htmlFor="wa">Amount</label><input className="inp" id="wa" inputMode="decimal" placeholder={`up to ${formatMoney(withdrawablePence)}`} value={wAmount} onChange={(e) => setWAmount(e.target.value)} /></div>
            <button type="button" className="btn btn-c btn-block" onClick={withdraw}><Svg name="bank" size={18} /> Request Withdrawal</button>
          </>
        ) : (
          <button type="button" className="btn btn-o btn-block" disabled><Svg name="bank" size={18} /> Withdraw To Bank</button>
        )}
        {wMsg && <div className={`notice ${wMsg.ok ? "notice-c" : "notice-p"}`} role="status"><span>{wMsg.text}</span></div>}
      </div>
    </div>
  );
}
