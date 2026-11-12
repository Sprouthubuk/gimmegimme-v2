import type { RevealOutcome, RevealTicket } from "../contract";
import { formatBalance, formatPence, formatTicketNumber, isCredited, prizeHeadline } from "../money";
import { useSkin } from "../skins/SkinContext";
import { Mascot } from "./Mascot";
import { ClosingButtons } from "./ResultSheet";
import { useFocusOnMount } from "./useFocusOnMount";

interface SummaryProps {
  outcome: RevealOutcome;
  /** The instant-win tickets that were played. */
  played: readonly RevealTicket[];
  /** How many of the purchase's tickets also sit in a live draw. */
  liveDrawTickets: number;
  balanceBefore?: number;
  onDone: () => void;
  onGoToWallet?: () => void;
  /** Back to the competition to enter again. */
  onPlayAgain?: () => void;
}

/** Every result in the purchase at a glance. Totals are the server's figures, never re-added here. */
export function Summary({ outcome, played, liveDrawTickets, balanceBefore, onDone, onGoToWallet, onPlayAgain }: SummaryProps) {
  const doneRef = useFocusOnMount<HTMLButtonElement>();
  const { copy } = useSkin();
  const winners = outcome.tickets.filter((t) => t.prize);
  const noWin = played.filter((t) => !t.prize).length;
  const physical = winners.some((t) => !isCredited(t.prize!));
  const multiComp = new Set(outcome.tickets.map((t) => t.competitionId)).size > 1;
  const total = outcome.tickets.length;

  return (
    <section className="rg-summary" role="status" aria-live="polite">
      <Mascot mood={winners.length ? "happy" : "smile"} className="rg-summary-mascot" />
      {winners.length ? (
        <>
          <div className="rg-kicker">{copy.summaryWinKicker(winners.length)}</div>
          <div className="rg-prize-big">{formatPence(outcome.totalWonPence)}</div>
          <p className="rg-sheet-sub">total prize value</p>
        </>
      ) : (
        <>
          <div className="rg-no-win">{copy.noWinTitle}</div>
          <p className="rg-sheet-body">
            None of your tickets won an instant prize.
            {copy.noWinLine && <> {copy.noWinLine}</>}
          </p>
        </>
      )}

      {outcome.creditedPence > 0 && (
        <div className="rg-summary-credit">
          <div>
            <strong>{formatPence(outcome.creditedPence)}</strong> added to your wallet
          </div>
          {outcome.balanceAfterPence != null && balanceBefore != null && (
            <div className="rg-wallet-change">
              Wallet <s>{formatBalance(balanceBefore)}</s> <span aria-hidden="true">→</span>{" "}
              <strong>{formatBalance(outcome.balanceAfterPence)}</strong>
            </div>
          )}
        </div>
      )}

      {winners.length > 0 && (
        <ul className="rg-summary-list">
          {winners.map((t) => (
            <li key={`${t.competitionId}:${t.ticketNumber}`}>
              <span className="rg-summary-ticket">{formatTicketNumber(t.ticketNumber)}</span>
              <span className="rg-summary-prize">
                {prizeHeadline(t.prize!)}
                {multiComp && <small>{t.competitionTitle}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {physical && <p className="rg-summary-note">We'll be in touch to arrange delivery of your prize.</p>}
      {winners.length > 0 && noWin > 0 && (
        <p className="rg-summary-note">
          {noWin.toLocaleString("en-GB")} other ticket{noWin === 1 ? "" : "s"} didn't win an instant prize.
        </p>
      )}
      {liveDrawTickets > 0 && (
        <p className="rg-summary-note">
          {liveDrawTickets === total
            ? total === 1
              ? "Your ticket is in the live draw."
              : `All ${total.toLocaleString("en-GB")} of your tickets are in the live draw.`
            : `${liveDrawTickets.toLocaleString("en-GB")} of your tickets are in a live draw.`}
        </p>
      )}

      <ClosingButtons primaryRef={doneRef} onPlayAgain={onPlayAgain} onGoToWallet={outcome.creditedPence > 0 ? onGoToWallet : undefined} onDone={onDone} />
    </section>
  );
}
