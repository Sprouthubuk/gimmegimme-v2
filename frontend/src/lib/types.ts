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
  /** Instant wins: how many instant prizes there are in total. Null for draws. */
  prizeCount: number | null;
  /** Instant wins with an end prize: what is drawn at the close, and for how many winners. Null otherwise. */
  endPrize: { name: string; valuePence: Pence; count: number } | null;
  maxTickets: number;
  /** When entries open (status is "scheduled" until then), or null when it opened on publish. */
  opensAt: string | null;
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
  /** Instant wins with an end prize, and draws: what is drawn, and for how many winners (one each). */
  endPrize: { name: string; valuePence: Pence; count: number } | null;
  /** Ticket quick-pick buttons, smallest first. */
  presets: number[];
  /** The button marked "Most popular", or null. */
  popularPreset: number | null;
  /** Fewest tickets in one order for this competition (1 unless set). */
  minTickets: number;
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
  /** A preview: the first 40 tickets plus every winning one. `ticketCount` is how many there are. */
  tickets: TicketRow[];
  ticketCount: number;
  toPlay: number;
  wonPence: Pence;
  status: "in_draw" | "to_play" | "won" | "no_win" | "drawn";
}

export interface TicketRow {
  number: number;
  won: boolean;
  played: boolean;
  prizeName: string | null;
}

/** GET /api/me/tickets/{order}/{competition}?page=: one order line's tickets, 500 a page. */
export interface TicketPage {
  competition: Pick<CompetitionSummary, "id" | "slug" | "title" | "type">;
  orderNumber: string;
  data: TicketRow[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
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
  minQuantity: number;
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
