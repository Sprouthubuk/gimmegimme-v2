import { useState, type FormEvent } from "react";
import { api, ApiFailure, errorText } from "../lib/api";
import type { Me } from "../lib/types";

function useSave() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (path: string, json: unknown, method = "PATCH") => {
    setBusy(true); setMsg(null);
    try {
      await api(path, { method, json });
      setMsg({ ok: true, text: "Saved." });
      return true;
    } catch (e) {
      const first = e instanceof ApiFailure && e.body?.errors ? Object.values(e.body.errors)[0]?.[0] : null;
      setMsg({ ok: false, text: first ?? errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const note = msg && <div className={`notice ${msg.ok ? "notice-c" : "notice-p"}`} role="status"><span>{msg.text}</span></div>;
  return { save, busy, note };
}

export default function SettingsForms({ me }: { me: Me }) {
  const [phone, setPhone] = useState(me.phone ?? "");
  const [addr, setAddr] = useState({ line1: me.address.line1 ?? "", line2: me.address.line2 ?? "", city: me.address.city ?? "", postcode: me.address.postcode ?? "" });
  const [mk, setMk] = useState(me.marketing);
  const [pw, setPw] = useState({ current: "", password: "" });
  const details = useSave(), address = useSave(), prefs = useSave(), security = useSave();
  const addressLocked = !!me.address.line1;

  return (
    <div className="split" style={{ gap: 16 }}>
      <form className="card card-p stack g12" onSubmit={(e: FormEvent) => { e.preventDefault(); details.save("/api/me/profile", { phone }); }}>
        <h2 className="h3">Personal Details</h2>
        <div className="r2"><div className="field"><label htmlFor="fn">First name</label><input className="inp" id="fn" value={me.firstName} disabled /></div><div className="field"><label htmlFor="ln">Last name</label><input className="inp" id="ln" value={me.lastName} disabled /></div></div>
        <div className="field"><label htmlFor="em">Email</label><input className="inp" id="em" type="email" value={me.email} disabled /></div>
        <div className="field"><label htmlFor="ph">Mobile</label><input className="inp" id="ph" type="tel" autoComplete="tel" placeholder="07…" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label htmlFor="db">Date of birth</label><input className="inp" id="db" value={me.dobVerified ? "Verified" : "Not set"} disabled style={{ opacity: 0.6 }} /><span className="hint">Contact us to change your name, email or date of birth.</span></div>
        {details.note}
        <button type="submit" className="btn btn-y gg-cta" disabled={details.busy}>Save Changes</button>
      </form>
      <div className="stack g16">
        <form className="card card-p stack g12" onSubmit={(e: FormEvent) => { e.preventDefault(); address.save("/api/me/address", addr); }}>
          <h2 className="h3">Address</h2>
          <p className="hint" style={{ margin: 0 }}>{addressLocked ? "Contact us to change your address." : "Needed for prize delivery and withdrawals. It can only be set once."}</p>
          <div className="field"><label htmlFor="a1">Address line 1</label><input className="inp" id="a1" autoComplete="address-line1" value={addr.line1} disabled={addressLocked} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} /></div>
          <div className="field"><label htmlFor="a2">Address line 2</label><input className="inp" id="a2" autoComplete="address-line2" value={addr.line2} disabled={addressLocked} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} /></div>
          <div className="r2"><div className="field"><label htmlFor="tw">Town</label><input className="inp" id="tw" autoComplete="address-level2" value={addr.city} disabled={addressLocked} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></div><div className="field"><label htmlFor="pc">Postcode</label><input className="inp" id="pc" autoComplete="postal-code" value={addr.postcode} disabled={addressLocked} onChange={(e) => setAddr({ ...addr, postcode: e.target.value.toUpperCase() })} /></div></div>
          {address.note}
          {!addressLocked && <button type="submit" className="btn btn-o" disabled={address.busy}>Save Address</button>}
        </form>
        <div className="card card-p stack g12">
          <h2 className="h3">Messages From Us</h2>
          {([["email", "New comps & offers by email"], ["sms", "Texts about draws I’ve entered"], ["winNotifications", "Win notifications"]] as const).map(([k, label]) => (
            <label key={k} className="row between g12"><span style={{ fontWeight: 700 }}>{label}</span><input type="checkbox" className="sw" checked={mk[k]} onChange={async (e) => { const next = { ...mk, [k]: e.target.checked }; setMk(next); if (!(await prefs.save("/api/me/preferences", next))) setMk(mk); }} /></label>
          ))}
          {prefs.note}
        </div>
        <form className="card card-p stack g12" onSubmit={async (e: FormEvent) => { e.preventDefault(); if (await security.save("/api/me/password", { currentPassword: pw.current, password: pw.password }, "POST")) setPw({ current: "", password: "" }); }}>
          <h2 className="h3">Security</h2>
          <div className="field"><label htmlFor="cp">Current password</label><input className="inp" id="cp" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="field"><label htmlFor="np">New password</label><input className="inp" id="np" type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></div>
          {security.note}
          <button type="submit" className="btn btn-o" disabled={security.busy || !pw.current || pw.password.length < 8}>Change Password</button>
          <a href="/contact" className="hint" style={{ textAlign: "center" }}>Close my account</a>
        </form>
      </div>
    </div>
  );
}
