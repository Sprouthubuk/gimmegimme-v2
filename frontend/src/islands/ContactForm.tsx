import { useState, type FormEvent } from "react";
import { api, ApiFailure, errorText } from "../lib/api";

export default function ContactForm({ name, email }: { name: string; email: string }) {
  const [f, setF] = useState({ name, email, topic: "A competition", message: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy"); setErrors({}); setError(null);
    try {
      await api("/api/contact", { json: f });
      setState("sent");
    } catch (err) {
      const errs: Record<string, string> = {};
      if (err instanceof ApiFailure && err.body?.errors) for (const [k, v] of Object.entries(err.body.errors)) errs[k] = v[0];
      setErrors(errs);
      setError(Object.keys(errs).length ? null : errorText(err));
      setState("idle");
    }
  }
  if (state === "sent") return <div className="card card-hot card-p stack g12" role="status"><h2 className="h3">Message Sent</h2><p className="p" style={{ textAlign: "left" }}>Thanks — we’ve got it and we’ll reply by email.</p></div>;
  return (
    <form className="card card-hot card-p stack g12" onSubmit={submit} data-testid="contact-form">
      <h2 className="h3">Send A Message</h2>
      <div className="field"><label htmlFor="nm">Name</label><input className="inp" id="nm" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />{errors.name && <span className="err">{errors.name}</span>}</div>
      <div className="field"><label htmlFor="em">Email</label><input className="inp" id="em" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />{errors.email && <span className="err">{errors.email}</span>}</div>
      <div className="field"><label htmlFor="tp">What’s it about?</label><select className="inp" id="tp" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{["A competition", "My wallet or a payment", "A win or prize", "My account", "Something else"].map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="field"><label htmlFor="ms">Message</label><textarea className="inp" id="ms" value={f.message} maxLength={3000} onChange={(e) => setF({ ...f, message: e.target.value })} required />{errors.message && <span className="err">{errors.message}</span>}</div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="sr-only" aria-hidden="true" />
      {error && <div className="notice notice-p" role="alert"><span>{error}</span></div>}
      <button type="submit" className="btn btn-y btn-lg gg-cta" disabled={state === "busy"}>{state === "busy" ? <span className="spin" /> : "Send Message"}</button>
    </form>
  );
}
