// Wording for "Buy X Get Y Free" bundles, shared by the picker, basket, checkout and order pages.
import { formatCount, formatPence } from "./money";

/** "20 paid + 40 free = 60 tickets" for a bundle; "4 × 59p" for single tickets. */
export function lineMakeup(l: { quantity: number; paidQuantity?: number; freeQuantity?: number; unitPence?: number }): string {
  const free = l.freeQuantity ?? 0;
  if (free > 0) return `${formatCount(l.paidQuantity ?? l.quantity - free)} paid + ${formatCount(free)} free = ${formatCount(l.quantity)} tickets`;
  return l.unitPence != null ? `${formatCount(l.quantity)} × ${formatPence(l.unitPence)}` : `${formatCount(l.quantity)} ${l.quantity === 1 ? "ticket" : "tickets"}`;
}

/** A wallet top-up that covers a shortfall: rounded up to whole pounds, never under the minimum deposit. */
export function topUpFor(shortPence: number, minDepositPence: number): number {
  return Math.max(minDepositPence, Math.ceil(shortPence / 100) * 100);
}
