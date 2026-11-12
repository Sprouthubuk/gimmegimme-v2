import { useState } from "react";
import { api, errorText } from "../lib/api";
import { formatMoney, parsePounds } from "../lib/money";
import { ukDateTime } from "../lib/time";
import type { Limits } from "../lib/types";
import { Svg } from "./Svg";

export default function SaferPlayForms({ initial }: { initial: Limits }) {
  const [limits, setLimits] = useState(initial);
  const [pick, setPick] = useState<number | null>(initial.weeklyDepositPence);
  const [custom, setCustom] = useState("");
  const [brk, setBrk] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);
  const [confirmExclude, setConfirmExclude] = useState(false);
  const [months, setMonths] = useState(6);

  async function run(where: string, path: string, json: unknown, ok: string) {
    setMsg(null);
    try {
      const l = await api<Limits>(path, { json });
      setLimits(l);
      setMsg({ ok: true, text: ok, where });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e), where });
    }
  }
  const note = (where: string) => msg && msg.where === where && <div className={`notice ${msg.ok ? "notice-c" : "notice-p"}`} role="status"><span>{msg.text}</span></div>;
  const chosen = custom ? parsePounds(custom) : pick;

  return (
    <>
      <div className="split" style={{ gap: 16 }}>
        <div className="card card-cy card-p stack g12">
          <div className="row between"><h2 className="h3">Weekly Deposit Limit</h2><span className="tag tag-w">{limits.weeklyDepositPence ? formatMoney(limits.weeklyDepositPence) : "Not set"}</span></div>
          <div className="r4">{[1000, 2500, 5000, 10000].map((p) => <button key={p} type="button" className={!custom && pick === p ? "pick on" : "pick"} onClick={() => { setPick(p); setCustom(""); }}>{formatMoney(p).replace(".00", "")}</button>)}</div>
          <div className="field"><label htmlFor="cl">Custom amount</label><input className="inp" id="cl" inputMode="decimal" placeholder="£" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
          <button type="button" className="btn btn-c btn-block" disabled={!chosen} onClick={() => run("limit", "/api/me/limits", { weeklyDepositPence: chosen }, "Saved. A lower limit applies straight away; a higher one after 24 hours.")}>Save Limit</button>
          {limits.weeklyDepositPence && <button type="button" className="btn btn-o btn-sm" onClick={() => run("limit", "/api/me/limits", { weeklyDepositPence: null }, "Your limit will be removed in 24 hours.")}>Remove Limit</button>}
          {limits.pending && <p className="hint" style={{ margin: 0 }}>Change to {limits.pending.weeklyDepositPence ? formatMoney(limits.pending.weeklyDepositPence) : "no limit"} applies {ukDateTime(limits.pending.appliesAt)}.</p>}
          {note("limit")}
          <p className="hint" style={{ margin: 0 }}>Raising or removing a limit takes 24 hours to apply.</p>
        </div>
        <div className="stack g16">
          <div className="card card-p stack g12">
            <h2 className="h3">Take A Break</h2>
            {limits.coolOffUntil ? <div className="notice notice-c"><Svg name="pause" size={18} /><span>You’re on a break until {ukDateTime(limits.coolOffUntil)}.</span></div> : (
              <>
                {[[1, "24 hours"], [7, "7 days"], [30, "30 days"]].map(([d, n]) => <label key={d} className="opt"><input type="radio" name="brk" checked={brk === d} onChange={() => setBrk(d as number)} /><span style={{ fontWeight: 900, flex: 1 }}>{n}</span></label>)}
                <button type="button" className="btn btn-o btn-block" onClick={() => run("break", "/api/me/break", { days: brk }, "Your break has started. You can still log in and see your tickets.")}><Svg name="pause" size={16} /> Start Break</button>
              </>
            )}
            {note("break")}
          </div>
        </div>
      </div>
      <div className="card card-p stack g12" style={{ borderColor: "rgba(255,45,170,.4)" }}>
        <h2 className="h3">Self-Exclusion</h2>
        {limits.selfExcludedUntil ? <div className="notice notice-c"><span>Your account is closed to play until {ukDateTime(limits.selfExcludedUntil)}.</span></div> : !confirmExclude ? (
          <>
            <p className="p" style={{ fontSize: 14, textAlign: "left" }}>Close your account for 6 months or longer. You won’t be able to reopen it during that time.</p>
            <button type="button" className="btn btn-p" onClick={() => setConfirmExclude(true)}>Self-Exclude</button>
          </>
        ) : (
          <>
            {[[6, "6 months"], [12, "1 year"], [60, "5 years"]].map(([m, n]) => <label key={m} className="opt"><input type="radio" name="ex" checked={months === m} onChange={() => setMonths(m as number)} /><span style={{ fontWeight: 900, flex: 1 }}>{n}</span></label>)}
            <div className="r2"><button type="button" className="btn btn-p" onClick={() => run("exclude", "/api/me/self-exclude", { months }, "Done. Your account is closed to play and you won’t receive marketing.")}>Confirm</button><button type="button" className="btn btn-o" onClick={() => setConfirmExclude(false)}>Cancel</button></div>
          </>
        )}
        {note("exclude")}
      </div>
    </>
  );
}
