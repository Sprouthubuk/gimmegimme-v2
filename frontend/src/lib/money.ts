import type { Pence } from "./types";

/** £12.50, £5, 25p, 1p. Whole pounds show no pence; under £1 shows as pence. */
export function formatPence(p: Pence, opts: { short?: boolean } = {}): string {
  const n = Math.round(p);
  if (opts.short !== false && n > 0 && n < 100) return `${n}p`;
  const pounds = n / 100;
  const whole = Number.isInteger(pounds);
  return "£" + pounds.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Always two decimals: £0.25, £12.50. Used for totals and balances. */
export function formatMoney(p: Pence): string {
  const n = Math.round(p);
  const sign = n < 0 ? "−" : "";
  return sign + "£" + (Math.abs(n) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse "12.50", "£12.50" or "12" to pence. Null when not a valid amount. */
export function parsePounds(input: string): Pence | null {
  const s = input.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

export const formatCount = (n: number) => n.toLocaleString("en-GB");
