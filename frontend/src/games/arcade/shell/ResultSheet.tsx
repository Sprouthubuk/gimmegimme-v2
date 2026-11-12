import type { ReactNode, Ref } from "react";
import type { RevealTicket } from "../contract";
import { formatBalance, formatPence, formatTicketNumber, isCredited, prizeHeadline } from "../money";
import { useSkin } from "../skins/SkinContext";
import { Mascot } from "./Mascot";
import { useFocusOnMount } from "./useFocusOnMount";

interface SheetActions {
  primaryLabel: string;
  onPrimary: () => void;
  /** Tickets still unrevealed after this one. */
  remaining: number;
  onRevealAll: () => void;
  onGoToWallet?: () => void;
  /** Wallet before/after this step, when the balance is known and something was credited. */
  wallet?: { before: number; after: number };
  /** True on the last screen of a purchase with no summary after it. */
  final?: boolean;
  /** Back to the competition to enter again. Shown on the final screen. */
  onPlayAgain?: () => void;
  onDone?: () => void;
}

function WalletChange({ wallet }: { wallet?: { before: number; after: number } }) {
  if (!wallet || wallet.after === wallet.before) return null;
  return (
    <div className="rg-wallet-change">
      Wallet <s>{formatBalance(wallet.before)}</s> <span aria-hidden="true">→</span> <strong>{formatBalance(wallet.after)}</strong>
    </div>
  );
}

function Sheet({ won, children, actions, credited }: { won: boolean; children: ReactNode; actions: SheetActions; credited: boolean }) {
  const primaryRef = useFocusOnMount<HTMLButtonElement>();
  const showWalletLink = credited && !!actions.onGoToWallet;
  if (actions.final) {
    return (
      <section className={`rg-sheet ${won ? "is-win" : "is-lose"}`} role="status" aria-live="polite">
        <Mascot mood={won ? "happy" : "smile"} className="rg-sheet-mascot" />
        {children}
        <ClosingButtons primaryRef={primaryRef} onPlayAgain={actions.onPlayAgain} onGoToWallet={showWalletLink ? actions.onGoToWallet : undefined} onDone={actions.onDone ?? actions.onPrimary} />
      </section>
    );
  }
  return (
    <section className={`rg-sheet ${won ? "is-win" : "is-lose"}`} role="status" aria-live="polite">
      <Mascot mood={won ? "happy" : "smile"} className="rg-sheet-mascot" />
      {children}
      <button type="button" className="rg-btn rg-btn-primary" onClick={actions.onPrimary} ref={primaryRef}>
        {actions.primaryLabel}
      </button>
      {(actions.remaining > 0 || showWalletLink) && (
        <div className="rg-sheet-links">
          {actions.remaining > 0 && (
            <button type="button" className="rg-link is-pink" onClick={actions.onRevealAll}>
              Reveal all {actions.remaining} left
            </button>
          )}
          {showWalletLink && (
            <button type="button" className="rg-link" onClick={actions.onGoToWallet}>
              Go to wallet
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** For an instant-win competition the draw is for its end prize; for a standard one, the competition itself. */
const drawFor = (title: string, endPrizeName?: string) => (endPrizeName ? `the end prize: ${endPrizeName}` : title);
/**
 * The buttons on the last screen: full-width "Play again" (back to the competition) and
 * "Go to wallet" when something was credited, then a plain "Done".
 */
export function ClosingButtons({
  primaryRef,
  onPlayAgain,
  onGoToWallet,
  onDone,
}: {
  primaryRef?: Ref<HTMLButtonElement>;
  onPlayAgain?: () => void;
  onGoToWallet?: () => void;
  onDone: () => void;
}) {
  return (
    <div className="rg-closing">
      {onPlayAgain ? (
        <button type="button" className="rg-btn rg-btn-primary" onClick={onPlayAgain} ref={primaryRef}>
          Play again
        </button>
      ) : (
        <button type="button" className="rg-btn rg-btn-primary" onClick={onDone} ref={primaryRef}>
          Done
        </button>
      )}
      {onGoToWallet && (
        <button type="button" className="rg-btn rg-btn-white rg-btn-block" onClick={onGoToWallet}>
          Go to wallet
        </button>
      )}
      {onPlayAgain && (
        <button type="button" className="rg-link" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}

const liveDrawLine = (title: string, endPrizeName?: string) => <> It's still in the live draw for {drawFor(title, endPrizeName)}.</>;

/** Result of one ticket. */
export function ResultSheet({
  ticket,
  winKicker,
  noWinLine,
  inLiveDraw,
  endPrizeName,
  ...actions
}: SheetActions & { ticket: RevealTicket; winKicker: string; noWinLine?: string; inLiveDraw: boolean; endPrizeName?: string }) {
  const { copy } = useSkin();
  const prize = ticket.prize;
  return (
    <Sheet won={!!prize} actions={actions} credited={!!prize && isCredited(prize)}>
      {prize ? (
        <>
          <div className="rg-kicker">{prize.name === "Minimum prize" ? `You won ${prize.valuePence < 100 ? `${prize.valuePence}p` : formatPence(prize.valuePence)}!` : winKicker}</div>
          <div className={`rg-prize-big ${prize.name === "Minimum prize" ? "is-minimum" : ""} ${prizeHeadline(prize).length > 14 ? "is-long" : ""}`}>{prizeHeadline(prize)}</div>
          <p className="rg-sheet-sub">{isCredited(prize) ? "added to your wallet!" : "We'll be in touch to arrange delivery."}</p>
          <WalletChange wallet={actions.wallet} />
        </>
      ) : (
        <>
          <div className="rg-no-win">{copy.noWinTitle}</div>
          <p className="rg-sheet-body">
            Ticket <strong>{formatTicketNumber(ticket.ticketNumber)}</strong> didn't win an instant prize.
            {inLiveDraw && liveDrawLine(ticket.competitionTitle, endPrizeName)}
            {noWinLine && <> {noWinLine}</>}
          </p>
        </>
      )}
    </Sheet>
  );
}

/** Result of a whole competition's tickets played on one board (balloon pop). */
export function BatchResultSheet({
  tickets,
  unit,
  noWinLine,
  inLiveDraw,
  endPrizeName,
  ...actions
}: SheetActions & { tickets: readonly RevealTicket[]; unit: readonly [string, string]; noWinLine?: string; inLiveDraw: boolean; endPrizeName?: string }) {
  const { copy } = useSkin();
  const winners = tickets.filter((t) => t.prize);
  const total = winners.reduce((s, t) => s + t.prize!.valuePence, 0);
  const anyCredited = winners.some((t) => isCredited(t.prize!));
  const anyPhysical = winners.some((t) => !isCredited(t.prize!));
  const title = tickets[0]?.competitionTitle ?? "";
  const count = `${tickets.length.toLocaleString("en-GB")} ${tickets.length === 1 ? unit[0] : unit[1]}`;
  return (
    <Sheet won={winners.length > 0} actions={actions} credited={anyCredited}>
      {winners.length === 1 ? (
        <>
          <div className="rg-kicker">{copy.winKicker ?? "WINNER!"}</div>
          <div className={`rg-prize-big ${prizeHeadline(winners[0].prize!).length > 14 ? "is-long" : ""}`}>{prizeHeadline(winners[0].prize!)}</div>
          <p className="rg-sheet-sub">{anyCredited ? "added to your wallet!" : "We'll be in touch to arrange delivery."}</p>
          <WalletChange wallet={actions.wallet} />
        </>
      ) : winners.length > 1 ? (
        <>
          <div className="rg-kicker">{copy.manyWinKicker(winners.length, unit[1])}</div>
          <div className="rg-prize-big">{formatPence(total)}</div>
          <p className="rg-sheet-sub">
            {anyPhysical ? "in prizes. We'll be in touch about delivery." : "added to your wallet!"}
          </p>
          <WalletChange wallet={actions.wallet} />
        </>
      ) : (
        <>
          <div className="rg-no-win">{copy.noWinTitle}</div>
          <p className="rg-sheet-body">
            None of your {count} had an instant prize.
            {inLiveDraw && <> Your tickets are still in the live draw for {drawFor(title, endPrizeName)}.</>}
            {noWinLine && <> {noWinLine}</>}
          </p>
        </>
      )}
    </Sheet>
  );
}
