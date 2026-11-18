import { useState } from "react";
import { api, ApiFailure, errorText } from "../lib/api";
import { formatMoney, parsePounds } from "../lib/money";
import { Svg } from "./Svg";

type IdCheck = "verified" | "pending" | "rejected" | "needed";

export default function WalletActions({ minDepositPence, maxTopUpPence, minWithdrawalPence, withdrawablePence, blocked, idCheck: initialIdCheck, idCheckNote, suggestPence = null }: { minDepositPence: number; maxTopUpPence: number; minWithdrawalPence: number; withdrawablePence: number; blocked: string | null; idCheck: IdCheck; idCheckNote: string | null; suggestPence?: number | null }) {
  const presets = [500, 1000, 2000, 5000].filter((p) => p >= minDepositPence && p <= maxTopUpPence);
  const [amount, setAmount] = useState<number | null>(presets[2] ?? presets[0] ?? minDepositPence);
  // Coming from checkout with a shortfall: the amount that covers it, typed in for the player to confirm.
  const [custom, setCustom] = useState(suggestPence ? (suggestPence / 100).toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wAmount, setWAmount] = useState("");
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bank, setBank] = useState({ accountName: "", sortCode: "", accountNumber: "" });
  const [wErr, setWErr] = useState<Record<string, string>>({});
  const [idCheck, setIdCheck] = useState<IdCheck>(initialIdCheck);
  const [docs, setDocs] = useState<{ photoId: File | null; proofOfAddress: File | null }>({ photoId: null, proofOfAddress: null });
  const [sending, setSending] = useState(false);
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
    setWErr({}); setWMsg(null);
    if (p == null) { setWErr({ amountPence: "Enter an amount, e.g. 25.00" }); return; }
    setSending(true);
    try {
      await api("/api/me/withdrawals", { json: { amountPence: p, ...bank } });
      setWMsg({ ok: true, text: "Request sent. We aim to pay it to your bank within 5 working days, and we’ll email you when it’s on its way." });
      setWAmount(""); setBank({ accountName: "", sortCode: "", accountNumber: "" });
    } catch (e) {
      const errs: Record<string, string> = {};
      for (const f of ["amountPence", "accountName", "sortCode", "accountNumber"]) { const t = errorText(e, f); if (e instanceof ApiFailure && e.body?.errors?.[f]) errs[f] = t; }
      setWErr(errs);
      if (!Object.keys(errs).length) setWMsg({ ok: false, text: errorText(e) });
    } finally {
      setSending(false);
    }
  }
  async function sendDocs() {
    setWMsg(null); setWErr({});
    if (!docs.photoId || !docs.proofOfAddress) { setWMsg({ ok: false, text: "Add both documents first." }); return; }
    const body = new FormData();
    body.append("photoId", docs.photoId);
    body.append("proofOfAddress", docs.proofOfAddress);
    setSending(true);
    try {
      await api("/api/me/id-check", { method: "POST", body });
      setIdCheck("pending");
    } catch (e) {
      const errs: Record<string, string> = {};
      for (const f of ["photoId", "proofOfAddress"]) if (e instanceof ApiFailure && e.body?.errors?.[f]) errs[f] = errorText(e, f);
      setWErr(errs);
      if (!Object.keys(errs).length) setWMsg({ ok: false, text: errorText(e) });
    } finally {
      setSending(false);
    }
  }
  const fieldErr = (f: string) => wErr[f] && <span className="err">{wErr[f]}</span>;

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
        {withdrawablePence >= minWithdrawalPence && idCheck === "pending" ? (
          <div className="notice notice-c" role="status" data-testid="id-pending"><Svg name="shield" size={18} /><span>We’re checking your ID documents. We’ll email you as soon as you can withdraw, usually within 1 working day.</span></div>
        ) : withdrawablePence >= minWithdrawalPence && idCheck !== "verified" ? (
          <div className="stack g12" data-testid="id-upload">
            <div className="h3" style={{ fontSize: 18 }}>First, Check Your ID</div>
            <p className="hint" style={{ margin: 0 }}>Before your first withdrawal we need to confirm you’re 18 or over and that the money goes to you. Send a clear photo or PDF of each. They’re kept securely and only seen by our team.</p>
            {idCheck === "rejected" && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>We couldn’t accept your last documents{idCheckNote ? `: ${idCheckNote}` : "."} Please send new ones.</span></div>}
            <div className="field"><label htmlFor="pid">Photo ID (passport or driving licence)</label><input className="inp" id="pid" type="file" accept="image/*,application/pdf" onChange={(e) => setDocs({ ...docs, photoId: e.target.files?.[0] ?? null })} />{fieldErr("photoId")}</div>
            <div className="field"><label htmlFor="poa">Proof of address (bank statement or bill from the last 3 months)</label><input className="inp" id="poa" type="file" accept="image/*,application/pdf" onChange={(e) => setDocs({ ...docs, proofOfAddress: e.target.files?.[0] ?? null })} />{fieldErr("proofOfAddress")}</div>
            <button type="button" className="btn btn-c btn-block" disabled={sending} onClick={sendDocs}>{sending ? <span className="spin" /> : <><Svg name="shield" size={18} /> Send Documents</>}</button>
          </div>
        ) : withdrawablePence >= minWithdrawalPence ? (
          <div className="stack g12" data-testid="withdraw-form">
            <div className="field"><label htmlFor="wa">Amount</label><input className="inp" id="wa" inputMode="decimal" placeholder={`up to ${formatMoney(withdrawablePence)}`} value={wAmount} onChange={(e) => setWAmount(e.target.value)} />{fieldErr("amountPence")}</div>
            <div className="field"><label htmlFor="an">Name on the bank account</label><input className="inp" id="an" autoComplete="name" value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} />{fieldErr("accountName")}</div>
            <div className="r2" style={{ gap: 8 }}>
              <div className="field"><label htmlFor="sc">Sort code</label><input className="inp" id="sc" inputMode="numeric" autoComplete="off" placeholder="12-34-56" maxLength={8} value={bank.sortCode} onChange={(e) => setBank({ ...bank, sortCode: e.target.value })} />{fieldErr("sortCode")}</div>
              <div className="field"><label htmlFor="acn">Account number</label><input className="inp" id="acn" inputMode="numeric" autoComplete="off" placeholder="12345678" maxLength={9} value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} />{fieldErr("accountNumber")}</div>
            </div>
            <p className="hint" style={{ margin: 0 }}>The account must be a UK account in your own name.</p>
            <button type="button" className="btn btn-c btn-block" disabled={sending} onClick={withdraw}>{sending ? <span className="spin" /> : <><Svg name="bank" size={18} /> Request Withdrawal</>}</button>
          </div>
        ) : (
          <button type="button" className="btn btn-o btn-block" disabled><Svg name="bank" size={18} /> Withdraw To Bank</button>
        )}
        {wMsg && <div className={`notice ${wMsg.ok ? "notice-c" : "notice-p"}`} role="status"><span>{wMsg.text}</span></div>}
      </div>
    </div>
  );
}
