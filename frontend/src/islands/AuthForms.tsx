import { useState, type FormEvent } from "react";
import { api, ApiFailure, errorText } from "../lib/api";
import { safeNext } from "../lib/safe";
import { Svg } from "./Svg";

type Errors = Record<string, string>;
function fieldErrors(e: unknown): Errors {
  const out: Errors = {};
  if (e instanceof ApiFailure && e.body?.errors) for (const [k, v] of Object.entries(e.body.errors)) out[k] = v[0];
  return out;
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

function Password({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input className="inp" id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} required style={{ paddingRight: 52 }} />
      <button type="button" className="ib" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} style={{ position: "absolute", right: 6, top: 6, border: 0, background: "transparent", color: "#8E84A0" }}><Svg name="eye" size={18} /></button>
    </div>
  );
}

export function JoinForm({ next }: { next: string | null }) {
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", password: "", day: "", month: "", year: "", marketing: false });
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setGeneral(null);
    const dob = `${f.year.padStart(4, "0")}-${f.month.padStart(2, "0")}-${f.day.padStart(2, "0")}`;
    try {
      await api("/api/auth/register", { json: { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), password: f.password, dateOfBirth: dob, marketingOptIn: f.marketing } });
      window.location.assign(`/verify-email?next=${encodeURIComponent(safeNext(next, "/competitions"))}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      setGeneral(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack g12" onSubmit={submit} noValidate data-testid="join-form">
      <div className="r2">
        <Field id="fn" label="First name" error={errors.firstName}><input className="inp" id="fn" autoComplete="given-name" value={f.firstName} onChange={(e) => set("firstName")(e.target.value)} aria-invalid={!!errors.firstName || undefined} required /></Field>
        <Field id="ln" label="Last name" error={errors.lastName}><input className="inp" id="ln" autoComplete="family-name" value={f.lastName} onChange={(e) => set("lastName")(e.target.value)} aria-invalid={!!errors.lastName || undefined} required /></Field>
      </div>
      <Field id="em" label="Email" error={errors.email}><input className="inp" id="em" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={!!errors.email || undefined} required /></Field>
      <Field id="pw" label="Password" error={errors.password} hint="At least 8 characters"><Password id="pw" value={f.password} onChange={set("password")} autoComplete="new-password" invalid={!!errors.password} /></Field>
      <div className="field">
        <span className="lbl" id="dobl">Date of birth</span>
        <div className="r3" role="group" aria-labelledby="dobl">
          <input className="inp" inputMode="numeric" placeholder="DD" aria-label="Day" maxLength={2} value={f.day} onChange={(e) => set("day")(e.target.value.replace(/\D/g, ""))} autoComplete="bday-day" />
          <input className="inp" inputMode="numeric" placeholder="MM" aria-label="Month" maxLength={2} value={f.month} onChange={(e) => set("month")(e.target.value.replace(/\D/g, ""))} autoComplete="bday-month" />
          <input className="inp" inputMode="numeric" placeholder="YYYY" aria-label="Year" maxLength={4} value={f.year} onChange={(e) => set("year")(e.target.value.replace(/\D/g, ""))} autoComplete="bday-year" />
        </div>
        {errors.dateOfBirth ? <span className="err">{errors.dateOfBirth}</span> : <span className="hint">You must be 18+ and live in the UK to play.</span>}
      </div>
      <label className="row g12" style={{ padding: "6px 0", cursor: "pointer" }}>
        <input type="checkbox" className="sw" checked={f.marketing} onChange={(e) => set("marketing")(e.target.checked)} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Send me new comps &amp; offers (optional)</span>
      </label>
      {general && Object.keys(errors).length === 0 && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{general}</span></div>}
      <button type="submit" className="btn btn-y btn-lg btn-block gg-cta" disabled={busy}>{busy ? <span className="spin" /> : "Create Account"}</button>
      <p className="hint" style={{ margin: 0, textAlign: "center" }}>By creating an account you confirm you’re 18+ and accept our <a href="/legal/terms">T&amp;Cs</a> and <a href="/legal/privacy">Privacy policy</a>.</p>
    </form>
  );
}

export function LoginForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/auth/login", { json: { email: email.trim(), password, remember } });
      window.location.assign(safeNext(next, "/account"));
    } catch (err) {
      setError(errorText(err, "email"));
      setBusy(false);
    }
  }
  return (
    <form className="stack g12" onSubmit={submit} data-testid="login-form">
      <div className="field"><label htmlFor="em">Email</label><input className="inp" id="em" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><div className="row between"><label htmlFor="pw">Password</label><a href="/forgot-password" style={{ fontSize: 13, fontWeight: 800 }}>Forgot?</a></div><Password id="pw" value={password} onChange={setPassword} autoComplete="current-password" /></div>
      <label className="row g12" style={{ padding: "6px 0", cursor: "pointer" }}><input type="checkbox" className="sw" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span style={{ fontWeight: 700, fontSize: 14 }}>Keep me logged in</span></label>
      {error && <div className="notice notice-p" role="alert"><Svg name="info" size={18} /><span>{error}</span></div>}
      <button type="submit" className="btn btn-y btn-lg btn-block gg-cta" disabled={busy}>{busy ? <span className="spin" /> : "Log In"}</button>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/auth/forgot-password", { json: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorText(err, "email"));
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <div className="notice notice-c gg-pop" role="status"><Svg name="mail" size={18} /><span>If there’s an account for that email, a reset link is on its way. It works for 60 minutes. Not there? Check spam or <button type="button" onClick={() => setSent(false)} style={{ background: "none", border: 0, padding: 0, color: "#22E6FF", font: "inherit", textDecoration: "underline", cursor: "pointer" }}>try again</button>.</span></div>;
  return (
    <form className="stack g12" onSubmit={submit}>
      <div className="field"><label htmlFor="em">Email</label><input className="inp" id="em" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      {error && <div className="notice notice-p" role="alert"><span>{error}</span></div>}
      <button type="submit" className="btn btn-y btn-lg btn-block gg-cta" disabled={busy}>{busy ? <span className="spin" /> : "Send Reset Link"}</button>
    </form>
  );
}

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/auth/reset-password", { json: { token, email, password } });
      setDone(true);
    } catch (err) {
      setError(errorText(err, "password"));
    } finally {
      setBusy(false);
    }
  }
  if (done) return <div className="stack g12"><div className="notice notice-c" role="status"><Svg name="check" size={18} /><span>Password changed. You can log in now.</span></div><a className="btn btn-y btn-lg" href="/login">Log In</a></div>;
  return (
    <form className="stack g12" onSubmit={submit}>
      <div className="field"><label htmlFor="pw">New password</label><Password id="pw" value={password} onChange={setPassword} autoComplete="new-password" /><span className="hint">At least 8 characters</span></div>
      {error && <div className="notice notice-p" role="alert"><span>{error}</span></div>}
      <button type="submit" className="btn btn-y btn-lg btn-block gg-cta" disabled={busy || !token}>{busy ? <span className="spin" /> : "Set New Password"}</button>
    </form>
  );
}

export function VerifyEmail({ email, next }: { email: string | null; next: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      await api("/api/auth/email/resend", { json: {} });
      setMsg("Sent again — check your inbox and spam.");
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack g12">
      <div className="notice notice-c"><Svg name="mail" size={18} /><span>We’ve sent a link to <b>{email ?? "your email"}</b>. Tap it to confirm your account and start playing. Your basket is saved.</span></div>
      <a className="btn btn-y btn-lg" href={safeNext(next, "/competitions")}>I’ve Confirmed — Continue</a>
      <button type="button" className="btn btn-o" onClick={resend} disabled={busy}>{busy ? <span className="spin" /> : "Send The Link Again"}</button>
      {msg && <p className="hint" role="status" style={{ textAlign: "center", margin: 0 }}>{msg}</p>}
    </div>
  );
}
