// The API contract between the Astro front end and the Laravel backend.
// Every shape here is documented in docs/api.md. Money is always whole pence.
// Dates are ISO 8601 strings in UTC; the front end shows them in UK time.
import type { RevealOutcome, RevealTicket } from "../games/types";
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
  /** A 400px WebP copy for thumbnails (the original when there are no copies). */
  imageSmall: string;
  /** "url 400w, url 800w, url 1200w" for srcset, or null when there are no copies. */
  imageSrcset: string | null;
  pricePence: Pence;
  /** Instant wins: the biggest prize value. Draws: the prize value. */
  topPrizePence: Pence | null;
  /** Shown under the price, e.g. "£50 cash alternative" or "2,516 wins". */
  subtitle: string | null;
  /** Rounded down; 100 only when it has actually sold out. Players never see ticket counts, only this. */
  soldPercent: number;
  /** Instant wins: how many instant prizes there are in total. Null for draws. */
  prizeCount: number | null;
  /** Instant wins with an end prize: what is drawn at the close, and for how many winners. Null otherwise. */
  endPrize: { name: string; valuePence: Pence; count: number } | null;
  /** When entries open (status is "scheduled" until then), or null when it opened on publish. */
  opensAt: string | null;
  closesAt: string;
  drawAt: string | null;
  featured: boolean;
  tags: string[];
  /** Live draws with bundles: the featured ("Our Pick") bundle on sale now, or null. */
  featuredBundle: Bundle | null;
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
  /** Live draws: the "Buy X Get Y Free" bundles on sale now, smallest first. Empty when there are none. */
  bundles: Bundle[];
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
  /** Meta Pixel ID from the admin; null when none is set (then nothing from Meta ever loads). */
  metaPixelId: string | null;
  /** Gimme Box (lucky dip): null while the feature is off. `available` is false when fewer than two draws can go in. */
  gimmeBox: { available: boolean; chipsPence: Pence[]; minPence: Pence; maxPence: Pence; bonusPct: number } | null;
  /** Refer a Friend: null while the feature is off. */
  referrals: { rewardType: "tickets" | "credit"; rewardTickets: number; rewardCreditPence: Pence; minPurchasePence: Pence } | null;
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
  /** ID check before the first withdrawal: verified, pending (being checked), rejected (send again, see idCheckNote) or needed. */
  idCheck: "verified" | "pending" | "rejected" | "needed";
  idCheckNote: string | null;
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
  competition: Pick<CompetitionSummary, "id" | "slug" | "title" | "type" | "image" | "imageSmall" | "imageSrcset" | "drawAt" | "closesAt" | "status">;
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
  /** Single tickets. Leave out (or 0) for a bundle line. */
  quantity: number;
  /** A "Buy X Get Y Free" bundle (live draws). The server works out its price and tickets. */
  bundleId?: number | null;
  /** Set when the line came from a Gimme Box: the server adds the box's bonus tickets while the line still matches it. */
  boxId?: string | null;
}

export type GimmeBoxMode = "surprise" | "big" | "most";

/** A box the server packed and priced. Only the player's own tickets and each draw's % sold: never a ticket count of a draw. */
export interface GimmeBox {
  id: string;
  mode: GimmeBoxMode;
  budgetPence: Pence;
  totalPence: Pence;
  /** Budget not spent: always less than one ticket of the cheapest draw in the box. */
  unusedPence: Pence;
  tickets: number;
  bonusTickets: number;
  /** The box's tickets are held until then. */
  expiresAt: string;
  lines: {
    competitionId: string; slug: string; title: string; image: string; imageSmall: string; imageSrcset: string | null;
    soldPercent: number; unitPence: Pence; bundleId: number | null; bundleLabel: string | null; singles: number;
    paidQuantity: number; freeQuantity: number; bonusQuantity: number; tickets: number; linePence: Pence;
    /** Neutral note when the draw's promo ticket cap stops its bonus (never a number). */
    notice: string | null;
  }[];
  /** What to put in the basket. */
  basketLines: { competitionId: string; quantity: number; bundleId?: number; boxId: string }[];
}

export type ReferralStatus = "pending" | "missed" | "blocked" | "review" | "rewarded" | "capped" | "rejected" | "clawed_back";

export interface Voucher {
  id: number;
  tickets: number;
  status: "available" | "redeemed" | "expired" | "clawed_back";
  expiresAt: string;
  competition: { title: string; slug: string } | null;
}

export interface MyReferrals {
  code: string;
  link: string;
  stats: { invited: number; qualified: number; rewards: number; leftThisMonth: number; cap: number };
  rewardType: "tickets" | "credit";
  rewardTickets: number;
  rewardCreditPence: Pence;
  minPurchasePence: Pence;
  vouchers: Voucher[];
  friends: { name: string; status: ReferralStatus; joinedAt: string }[];
}

/** A bundle a live draw is selling now. Only what fits is sent; nothing about the ticket pool. */
export interface Bundle {
  id: number;
  label: string;
  paid: number;
  free: number;
  tickets: number;
  pricePence: Pence;
  /** free × ticket price. */
  savePence: Pence;
  /** The admin's featured bundle: badged "Our Pick" and preselected. */
  ourPick: boolean;
}

export interface PricedLine {
  competitionId: string;
  slug: string;
  title: string;
  image: string;
  imageSmall: string;
  imageSrcset: string | null;
  type: CompetitionType;
  /** Tickets on the line: paid + free. */
  quantity: number;
  bundleId: number | null;
  bundleLabel: string | null;
  paidQuantity: number;
  freeQuantity: number;
  unitPence: Pence;
  linePence: Pence;
  minQuantity: number;
  /** Extra tickets from a Gimme Box, already inside `quantity`. */
  bonusQuantity: number;
  source: "gimme_box" | null;
  gimmeBoxId: string | null;
  problem: string | null;
  /** Neutral note that doesn't stop checkout, e.g. a Gimme Box bonus the draw's promo cap no longer allows. */
  notice: string | null;
  /** The next bundle up, for "Upgrade to … for +£X". */
  upgrade: { bundleId: number; label: string; tickets: number; freeQuantity: number; extraPence: Pence } | null;
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
  /** What Meta is told the order was worth: real money only (card, deposit, winnings), never bonus credit. */
  trackValuePence: Pence;
  paidAt: string | null;
  lines: { competitionId: string; slug: string; title: string; image: string; imageSmall: string; imageSrcset: string | null; type: CompetitionType; quantity: number; paidQuantity: number; freeQuantity: number; bundleLabel: string | null; tickets: number[]; drawAt: string | null }[];
  /** Instant-win tickets in this order not yet revealed. */
  toPlay: number;
}

export interface CheckoutResult {
  order: { number: string; status: OrderStatus };
  next: "play" | "redirect" | "attention";
  redirectUrl: string | null;
}

export interface PlayResult {
  /** Each ticket also links to its competition's fairness record (`/verify/{ref}`), or null. */
  outcome: RevealOutcome & { tickets: readonly (RevealTicket & { proofUrl: string | null })[] };
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
  /** Instant wins: the prize this ticket won, or null. */
  prizeName: string | null;
}

/** One instant prize and its winning ticket number, public from publish. Won once that ticket is sold. */
export interface WinningNumberRow {
  ticket: number;
  prizeName: string;
  valuePence: Pence;
  type: "cash" | "site_credit" | "physical";
  won: boolean;
  /** "Amy B." (or "Postal entrant" / "Anonymous") once won; null until then, and for a paid win its player hasn't played yet (up to an hour). */
  winnerName: string | null;
  wonAt: string | null;
}

/** GET /api/competitions/{slug}/winning-numbers?show=all|won|left&q=&prize=&page= (100 a page, biggest prize first). */
export interface WinningNumbersPage {
  competition: CompetitionSummary;
  data: WinningNumberRow[];
  /** Every winning number in the competition, and how many are won. */
  total: number;
  won: number;
  /** Rows matching show and q. */
  matching: number;
  hasMore: boolean;
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
