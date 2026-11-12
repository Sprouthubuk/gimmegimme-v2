import type { RevealTicket } from "../contract";
import { formatBalance, formatTicketNumber } from "../money";

interface HeaderProps {
  title?: string;
  counter: string;
  balancePence?: number;
  onClose: () => void;
  closeLabel: string;
}

export function Header({ title, counter, balancePence, onClose, closeLabel }: HeaderProps) {
  return (
    <header className="rg-header">
      <button type="button" className="rg-close" onClick={onClose} aria-label={closeLabel}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
      <div className="rg-header-mid">
        {title && <div className="rg-comp-title">{title}</div>}
        <h2 className="rg-counter">{counter}</h2>
      </div>
      {balancePence != null ? <WalletPill pence={balancePence} /> : <span className="rg-header-spacer" />}
    </header>
  );
}

export function WalletPill({ pence }: { pence: number }) {
  return (
    <div className="rg-wallet" aria-label={`Wallet balance ${formatBalance(pence)}`}>
      <span className="rg-wallet-coin" aria-hidden="true">£</span>
      {/* Keyed on the value so the bump animation replays whenever it changes. */}
      <span key={pence} className="rg-wallet-amount">{formatBalance(pence)}</span>
    </div>
  );
}

/** One pip per ticket: yellow = won, black = no win, pink = current. Long runs get a bar. */
export function Pips({ tickets, index, revealedThrough }: { tickets: readonly RevealTicket[]; index: number; revealedThrough: number }) {
  const n = tickets.length;
  if (n <= 1) return null;
  if (n > 20) {
    return (
      <div className="rg-progress" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + 1) / n) * 100}%` }} />
      </div>
    );
  }
  return (
    <ol className="rg-pips" aria-hidden="true">
      {tickets.map((t, i) => {
        const state = i === index ? "current" : i <= revealedThrough ? (t.prize ? "won" : "done") : "todo";
        return <li key={i} className={`rg-pip is-${state}`} />;
      })}
    </ol>
  );
}

export function TicketChip({ ticketNumber }: { ticketNumber: number }) {
  return <div className="rg-ticket-chip">Ticket {formatTicketNumber(ticketNumber)}</div>;
}
