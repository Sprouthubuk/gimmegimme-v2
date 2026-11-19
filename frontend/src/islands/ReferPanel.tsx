import { useState } from "react";
import { api, errorText } from "../lib/api";
import { formatMoney, formatPence } from "../lib/money";
import { trackCustom } from "../lib/consent";
import { ukDate } from "../lib/time";
import type { CompetitionSummary, MyReferrals, ReferralStatus, Voucher } from "../lib/types";
import { Svg } from "./Svg";

const STATUS: Record<ReferralStatus, [string, string]> = {
  pending: ["tag-w", "Joined"], missed: ["tag-w", "Didn't qualify"], blocked: ["tag-w", "Not eligible"], review: ["tag-y", "Being checked"],
  rewarded: ["tag-c", "Rewarded"], capped: ["tag-y", "Monthly limit reached"], rejected: ["tag-w", "Not eligible"], clawed_back: ["tag-w", "Reversed"],
};

function VoucherCard({ v, onUsed }: { v: Voucher; onUsed: () => void }) {
  const [draws, setDraws] = useState<CompetitionSummary[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function open() {
    setError(null);
    try {
      const r = await api<{ data: CompetitionSummary[] }>(`/api/me/vouchers/${v.id}/draws`);
      setDraws(r.data);
      setPick(r.data[0]?.id ?? null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function redeem() {
    if (!pick) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ order: { number: string } }>(`/api/me/vouchers/${v.id}/redeem`, { json: { competitionId: pick } });
      trackCustom("VoucherRedeemed", { tickets: v.tickets });
      setDone(r.order.number);
      onUsed();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (v.status !== "available") return (
    <div className="li" style={{ cursor: "default" }}>
      <span className="ico"><Svg name="ticket" size={18} /></span>
      <span style={{ flex: 1 }}>{v.tickets} free tickets{v.competition ? <> · <a href={`/competitions/${v.competition.slug}`}>{v.competition.title}</a></> : null}</span>
      <span className="tag tag-w">{v.status === "redeemed" ? "Used" : v.status === "expired" ? "Expired" : "Reversed"}</span>
    </div>
  );
  return (
    <div className="card card-cy card-p stack g12" data-testid="voucher">
      <div className="row between"><span className="d nc" style={{ fontSize: 24 }}>{v.tickets} Free Tickets</span><span className="hint">Use by {ukDate(v.expiresAt)}</span></div>
      {done ? <div className="notice notice-c"><Svg name="check" size={18} /><span>Done! Your tickets are in. <a href={`/order/${done}`} style={{ color: "#22E6FF" }}>See your ticket numbers</a></span></div> : draws === null ? (
        <button type="button" className="btn btn-c" onClick={open}>Choose A Draw</button>
      ) : draws.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>No live draw can take these tickets right now. Check back soon.</p>
      ) : (
        <>
          <div className="stack g8" role="radiogroup" aria-label="Choose a live draw">
            {draws.map((c) => (
              <label key={c.id} className="opt">
                <input type="radio" name={`v-${v.id}`} checked={pick === c.id} onChange={() => setPick(c.id)} />
                <img src={c.imageSmall} alt="" width={44} height={44} style={{ borderRadius: 10, objectFit: "cover" }} />
                <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><span style={{ fontWeight: 900 }}>{c.title}</span><span className="hint">{c.soldPercent}% sold · closes {ukDate(c.closesAt)}</span></span>
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-y gg-cta" onClick={redeem} disabled={busy || !pick} data-testid="voucher-redeem">{busy ? "Adding…" : `Use ${v.tickets} Free Tickets`}</button>
        </>
      )}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export default function ReferPanel({ initial }: { initial: MyReferrals }) {
  const [data, setData] = useState(initial);
  const [copied, setCopied] = useState(false);
  const reward = data.rewardType === "credit" ? `${formatMoney(data.rewardCreditPence)} bonus credit` : `${data.rewardTickets} free tickets`;
  const message = `Join me on Gimme Gimme Prizes: spend ${formatPence(data.minPurchasePence)} on your first order and we both get ${reward}. 18+ UK.`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      trackCustom("ReferralShare", { via: "copy" });
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* the link is on screen to copy by hand */ }
  }
  async function share() {
    try {
      await navigator.share({ title: "Gimme Gimme Prizes", text: message, url: data.link });
      trackCustom("ReferralShare", { via: "share" });
    } catch { /* cancelled */ }
  }
  const refresh = () => api<MyReferrals>("/api/me/referrals").then(setData).catch(() => undefined);
  const text = encodeURIComponent(`${message} ${data.link}`);

  return (
    <div className="stack g16">
      <div className="card card-hot card-p stack g12">
        <p className="p" style={{ margin: 0 }}>Give a friend {reward} and get the same when they spend <b>{formatPence(data.minPurchasePence)}</b> or more on their first order.</p>
        <div className="row g8">
          <input className="inp" readOnly value={data.link} aria-label="Your share link" onFocus={(e) => e.currentTarget.select()} data-testid="refer-link" />
          <button type="button" className="btn btn-o" onClick={copy} aria-live="polite">{copied ? "Copied" : <><Svg name="copy" size={16} /> Copy</>}</button>
        </div>
        <div className="hint">Your code: <b style={{ letterSpacing: ".08em" }}>{data.code}</b></div>
        <div className="r2">
          {canShare ? <button type="button" className="btn btn-y gg-cta" onClick={share}><Svg name="share" size={16} /> Share</button>
            : <a className="btn btn-y gg-cta" href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer" onClick={() => trackCustom("ReferralShare", { via: "whatsapp" })}>WhatsApp</a>}
          <a className="btn btn-o" href={`mailto:?subject=${encodeURIComponent("Join me on Gimme Gimme")}&body=${text}`} onClick={() => trackCustom("ReferralShare", { via: "email" })}>Email</a>
        </div>
      </div>

      <div className="kpi">
        <div className="card card-p"><div className="eyebrow">Friends Joined</div><div className="d np" style={{ fontSize: 30 }}>{data.stats.invited}</div></div>
        <div className="card card-p"><div className="eyebrow">Qualified</div><div className="d nc" style={{ fontSize: 30 }}>{data.stats.qualified}</div></div>
        <div className="card card-p"><div className="eyebrow">Rewards</div><div className="d ny" style={{ fontSize: 30 }}>{data.stats.rewards}</div></div>
        <div className="card card-p"><div className="eyebrow">Left This Month</div><div className="d" style={{ fontSize: 30 }}>{data.stats.leftThisMonth}</div></div>
      </div>

      {data.vouchers.length > 0 && (
        <div className="stack g12">
          <h2 className="h3">Your Vouchers</h2>
          {data.vouchers.filter((v) => v.status === "available").map((v) => <VoucherCard key={v.id} v={v} onUsed={refresh} />)}
          {data.vouchers.some((v) => v.status !== "available") && <div className="card" style={{ overflow: "hidden" }}>{data.vouchers.filter((v) => v.status !== "available").map((v) => <VoucherCard key={v.id} v={v} onUsed={refresh} />)}</div>}
        </div>
      )}

      <div className="stack g12">
        <h2 className="h3">Your Friends</h2>
        {data.friends.length ? (
          <div className="card" style={{ overflow: "hidden" }}>
            {data.friends.map((f, i) => <div key={i} className="li" style={{ cursor: "default" }}><span className="av">{f.name.slice(0, 1)}</span><span style={{ flex: 1 }}>{f.name}<span className="hint" style={{ display: "block" }}>Joined {ukDate(f.joinedAt)}</span></span><span className={`tag ${STATUS[f.status][0]}`}>{STATUS[f.status][1]}</span></div>)}
          </div>
        ) : <div className="card empty">No friends have joined with your link yet.</div>}
      </div>
      <p className="hint" style={{ margin: 0 }}>Rewards for up to {data.stats.cap} friends a month. Free tickets go into a live draw of your choice and expire after 30 days. <a href="/legal/referral-terms">Refer A Friend terms</a></p>
    </div>
  );
}
