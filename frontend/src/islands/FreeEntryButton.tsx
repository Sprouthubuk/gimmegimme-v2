import { useState } from "react";
import { api, errorText } from "../lib/api";
import { ukDateTime } from "../lib/time";
import { BLOCK_TEXT } from "./TicketPicker";

/**
 * A free-to-enter competition (docs/free-entry.md): one ticket each, claimed here. The server runs the same checks
 * as a purchase and issues the ticket through Verity; the order page then shows it (and plays any instant win).
 */
export interface FreeEntryProps {
  slug: string;
  type: "instant" | "draw";
  open: boolean;
  opensAt?: string | null;
  soldOut: boolean;
  salesOpen: boolean;
  signedIn: boolean;
  playBlock: string | null;
  heldByMe: number;
}

export default function FreeEntryButton(p: FreeEntryProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = `/competitions/${p.slug}`;

  const blocked = !p.open ? (p.opensAt ? `Entries open ${ukDateTime(p.opensAt)}.` : "This competition isn't open for entries.")
    : p.soldOut ? "All the free tickets have gone."
    : !p.salesOpen ? "Entries open soon."
    : p.heldByMe > 0 ? "You've got your free ticket for this one. Good luck!"
    : p.playBlock ? BLOCK_TEXT[p.playBlock] ?? "You can't enter right now." : null;

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ order: { number: string } }>(`/api/competitions/${encodeURIComponent(p.slug)}/free-entry`, { method: "POST", json: {} });
      window.location.href = `/order/${encodeURIComponent(r.order.number)}`;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="card card-hot card-p stack g12 gg-rise gg-d4" data-testid="free-entry">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="eyebrow">Free To Enter</span>
        <span className="d ny" style={{ fontSize: 34, lineHeight: 1 }}>FREE</span>
      </div>
      <p className="p" style={{ margin: 0 }}>One free ticket per person{p.type === "instant" ? ", and you'll see straight away if it's won." : ". Good luck in the draw!"}</p>
      {blocked ? (
        <span className="btn btn-o btn-lg" aria-disabled="true" data-testid="free-entry-blocked">{p.heldByMe > 0 ? "You're In" : p.soldOut ? "All Gone" : "Unavailable"}</span>
      ) : p.signedIn ? (
        <button type="button" className="btn btn-y btn-lg gg-cta" onClick={claim} disabled={busy} data-testid="claim-free">{busy ? "Getting Your Ticket…" : "Claim My Free Ticket"}</button>
      ) : (
        <a className="btn btn-y btn-lg gg-cta" href={`/join?next=${encodeURIComponent(page)}`} data-testid="claim-free">Join Free To Claim</a>
      )}
      {blocked && <p className="hint" style={{ margin: 0 }}>{blocked}</p>}
      {!p.signedIn && !blocked && <p className="hint" style={{ margin: 0 }}>Already a member? <a href={`/login?next=${encodeURIComponent(page)}`}>Sign in</a></p>}
      {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
