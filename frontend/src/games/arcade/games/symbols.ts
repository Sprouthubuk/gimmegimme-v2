import type { RevealPrize } from "../contract";
import { prizeShortLabel } from "../money";

export type Tone = "yellow" | "cyan" | "pink" | "white";
const TONES: Tone[] = ["yellow", "cyan", "pink"];

/** Same label → same colour everywhere on a board. */
export function toneFor(label: string): Tone {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

/** Font-size bucket so "£5" and "£1,000" both fit on a coin. */
export function sizeClass(label: string): "rg-fit-l" | "rg-fit-m" | "rg-fit-s" | "rg-fit-xs" {
  const n = label.length;
  if (n <= 3) return "rg-fit-l";
  if (n <= 4) return "rg-fit-m";
  if (n <= 6) return "rg-fit-s";
  return "rg-fit-xs";
}

export const winLabel = (prize: RevealPrize | null): string | null => (prize ? prizeShortLabel(prize) : null);

/**
 * The competition's published prize labels with this ticket's own prize removed.
 * Never padded: a board only ever shows prizes the competition really has, and
 * fills any remaining space with plain symbols or "no win".
 */
export function usableDecoys(prizeLabels: readonly string[], exclude: string | null): string[] {
  return [...new Set(prizeLabels)].filter((d) => d !== exclude);
}
