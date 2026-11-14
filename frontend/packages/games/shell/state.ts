import type { GameTicket } from "../shared/types";

/**
 * The shell's state, with no rendering in it, so it can be tested on its own. The tickets are frozen when
 * the session starts: the session walks through them in order and reports them; it can't add, drop,
 * reorder or change one.
 */

export type TicketStatus = "pending" | "active" | "won" | "lost";

export interface SessionSnapshot {
  index: number;
  statuses: readonly TicketStatus[];
  totalWon: number;
  wins: number;
  finished: boolean;
  revealingAll: boolean;
}

type Listener = (s: SessionSnapshot) => void;

export class GameSession {
  readonly tickets: readonly GameTicket[];
  private statuses: TicketStatus[];
  private index = 0;
  private totalPence = 0;
  private finishedFlag = false;
  private revealingAllFlag = false;
  private listeners = new Set<Listener>();
  private revealPromise: Promise<unknown> | null = null;

  constructor(tickets: readonly GameTicket[], private readonly markRevealed?: () => Promise<unknown>) {
    if (!tickets.length) throw new Error("A game needs at least one ticket.");
    this.tickets = Object.freeze(tickets.map((t) => Object.freeze({ ...t, prize: t.prize ? Object.freeze({ ...t.prize }) : undefined })));
    this.statuses = this.tickets.map((_, i) => (i === 0 ? "active" : "pending"));
  }

  get current(): GameTicket | null {
    return this.finishedFlag ? null : this.tickets[this.index];
  }

  snapshot(): SessionSnapshot {
    return {
      index: this.index,
      statuses: [...this.statuses],
      totalWon: this.totalPence / 100,
      wins: this.statuses.filter((s) => s === "won").length,
      finished: this.finishedFlag,
      revealingAll: this.revealingAllFlag,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /**
   * The current ticket has been revealed. Returns what it was. Revealing the same ticket twice changes
   * nothing. The server is told once, on the first reveal of the session.
   */
  resolveCurrent(): GameTicket | null {
    const t = this.current;
    if (!t || this.statuses[this.index] !== "active") return null;
    this.statuses[this.index] = t.result === "win" ? "won" : "lost";
    if (t.result === "win" && t.prize) this.totalPence += Math.round(t.prize.value * 100);
    this.notifyServer();
    this.emit();
    return t;
  }

  /** Move on after a resolved ticket. Finishes after the last one. */
  advance(): void {
    if (this.finishedFlag || this.statuses[this.index] === "active") return;
    if (this.index >= this.tickets.length - 1) {
      this.finishedFlag = true;
      this.revealingAllFlag = false;
    } else {
      this.index += 1;
      this.statuses[this.index] = "active";
    }
    this.emit();
  }

  /** "Reveal all": the scene plays a fast cascade; each step still goes through resolveCurrent/advance. */
  startRevealAll(): void {
    if (this.finishedFlag) return;
    this.revealingAllFlag = true;
    this.emit();
  }

  /** "Skip": resolve everything that's left at once and go to the summary. */
  skip(): GameTicket[] {
    const shown: GameTicket[] = [];
    while (!this.finishedFlag) {
      const t = this.resolveCurrent();
      if (t) shown.push(t);
      this.advance();
    }
    return shown;
  }

  /** The one call that tells the server the results were watched. Safe to call many times. */
  notifyServer(): Promise<unknown> | null {
    if (!this.markRevealed) return null;
    if (!this.revealPromise) {
      this.revealPromise = this.markRevealed().catch(() => {
        this.revealPromise = null; // allow a later retry; the endpoint is idempotent
      });
    }
    return this.revealPromise;
  }

  private emit(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }
}
