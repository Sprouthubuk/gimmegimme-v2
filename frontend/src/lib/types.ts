// The API contract between the Astro front end and the Laravel backend.
// Every shape here is documented in docs/api.md. Money is always whole pence.
// Dates are ISO 8601 strings in UTC; the front end shows them in UK time.
import type { RevealOutcome } from "../games/types";
import type { RevealContext } from "../games/arcade/games/types";

export type Pence = number;

export type CompetitionType = "instant" | "draw";
export type CompetitionStatus = "scheduled" | "live" | "sold_out" | "closed" | "drawn" | "ended";

export interface CompetitionSummary {
  id: string;
  slug: string;
  title: string;
  type: CompetitionType;
  status: CompetitionStatus;
  /** Reveal game id (shared/game-ids.json), instant wins only. */
  game: string | null;
  /** Player-facing label of the game, e.g. "Claw Machine". */
  gameLabel: string | null;
  skin: string;
  image: string;
  pricePence: Pence;
  /** Instant wins: the biggest prize value. Draws: the prize value. */
  topPrizePence: Pence | null;
  /** Shown under the price, e.g. "£50 cash alternative" or "2,516 wins". */
  subtitle: string | null;
  soldPercent: number;
  maxTickets: number;
  closesAt: string;
  drawAt: string | null;
  featured: boolean;
  tags: string[];
}

export interface PrizeTier {
  name: string;
  valuePence: Pence;
  type: "cash" | "site_credit" | "physical";
  quantity: number;
  won: number;
}

export interface CompetitionDetail extends CompetitionSummary {
  description: string;
  howToPlay: string | null;
  maxPerPerson: number;
  /** Tickets the signed-in player already holds (0 when signed out). */
  heldByMe: number;
  cashAlternativePence: Pence | null;
  /** Instant wins: one row per prize tier, biggest first. */
  prizes: PrizeTier[];
  /** Instant wins with an end prize, and draws: what is drawn. */
  endPrize: { name: string; valuePence: Pence } | null;
  /** Verity reference and public seed commitment. */
  verityRef: string | null;
  commitment: string | null;
  verifyUrl: string | null;
}

export interface SiteInfo {
  salesOpen: boolean;
  minDepositPence: Pence;
  minCardPence: Pence;
  minWithdrawalPence: Pence;
  maxTopUpPence: Pence;
  featuredSlug: string | null;
  socials: { instagram: string | null; facebook: string | null };
  supportEmail: string | null;
}

export interface WalletBalances {
  depositPence: Pence;
  bonusPence: Pence;
  winningsPence: Pence;
  totalPence: Pence;
  withdrawablePence: Pence;
}

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  dobVerified: boolean;
  address: { line1: string | null; line2: string | null; city: string | null; postcode: string | null };
  marketing: { email: boolean; sms: boolean; winNotifications: boolean };
  memberSince: string;
  wallet: WalletBalances;
  gamesWaiting: number;
  stats: { activeTickets: number; activeCompetitions: number; instantWins: number; totalWonPence: Pence; spentThisWeekPence: Pence };
  /** Why this account cannot play right now, or null. */
  playBlock: null | "staff" | "self_excluded" | "cool_off" | "on_hold" | "closed" | "under_18" | "no_date_of_birth" | "email_unverified";
}

export interface WalletTransaction {
  id: string;
  at: string;
  description: string;
  amountPence: Pence;
  direction: "in" | "out";
  bucket: "deposit" | "bonus" | "winnings";
}

export interface TicketGroup {
  competition: Pick<CompetitionSummary, "id" | "slug" | "title" | "type" | "image" | "drawAt" | "closesAt" | "status">;
  orderNumber: string | null;
  tickets: { number: number; won: boolean; played: boolean; prizeName: string | null }[];
  toPlay: number;
  wonPence: Pence;
  status: "in_draw" | "to_play" | "won" | "no_win" | "drawn";
}

export interface BasketLine {
  competitionId: string;
  quantity: number;
}

export interface PricedLine {
  competitionId: string;
  slug: string;
  title: string;
  image: string;
  type: CompetitionType;
  quantity: number;
  unitPence: Pence;
  linePence: Pence;
  maxQuantity: number;
  problem: string | null;
}

export interface PricedBasket {
  lines: PricedLine[];
  totalPence: Pence;
  ticketCount: number;
  promo: { code: string; discountPence: Pence } | null;
  /** What the wallet would pay if the player chooses wallet. */
  walletCanPayPence: Pence;
  walletCovers: boolean;
  problems: string[];
}

export type OrderStatus = "created" | "pending_payment" | "paid" | "failed" | "cancelled" | "expired" | "refunded";

export interface OrderView {
  number: string;
  status: OrderStatus;
  needsAttention: boolean;
  totalPence: Pence;
  cardPence: Pence;
  walletPence: Pence;
  paidAt: string | null;
  lines: { competitionId: string; slug: string; title: string; image: string; type: CompetitionType; quantity: number; tickets: number[]; drawAt: string | null }[];
  /** Instant-win tickets in this order not yet revealed. */
  toPlay: number;
}

export interface CheckoutResult {
  order: { number: string; status: OrderStatus };
  next: "play" | "redirect" | "attention";
  redirectUrl: string | null;
}

export interface PlayResult {
  outcome: RevealOutcome;
  context: RevealContext;
}

export interface InstantWinnerRow {
  id: string;
  name: string;
  prizeName: string;
  valuePence: Pence;
  game: string | null;
  gameLabel: string | null;
  competitionTitle: string;
  at: string;
}

export interface DrawWinnerRow {
  id: string;
  name: string;
  prizeName: string;
  competitionTitle: string;
  ticketNumber: number | null;
  at: string;
  videoUrl: string | null;
  verifyUrl: string | null;
}

export interface EntryRow {
  ticket: number;
  name: string;
  source: "paid" | "postal" | "free";
}

export interface Limits {
  weeklyDepositPence: Pence | null;
  pending: { weeklyDepositPence: Pence | null; appliesAt: string } | null;
  coolOffUntil: string | null;
  selfExcludedUntil: string | null;
  reminders: { sessionMinutes: number | null; weeklySummary: boolean };
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  code?: string;
}
