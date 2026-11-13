import { useCallback, useEffect, useState } from "react";
import { GEM_PICKS, type GemKind, type GemsLayout } from "../generators";

/**
 * The picking rules of the Gems game, shared by every look of it (the classic gem
 * board and skinned ones such as Liam's Humbug Heist). The Nth tile tapped shows
 * the Nth pick of generateGems, whichever tile it is, so where the player taps is
 * cosmetic and the result is the one the ticket was given.
 */
export function useGemPicks(
  layout: GemsLayout,
  reducedMotion: boolean,
  onReveal: () => void,
  /** How long the finished board stays up before the result sheet, on a win and on a miss. */
  holdMs: { win: number; lose: number } = { win: 1300, lose: 900 },
) {
  // Tile index → pick number.
  const [opened, setOpened] = useState<number[]>([]);
  const done = opened.length === GEM_PICKS;

  // Checked inside the update, so two taps in one frame can never open a seventh tile or one tile twice.
  const open = useCallback((tile: number) => {
    setOpened((o) => (o.length >= GEM_PICKS || o.includes(tile) ? o : [...o, tile]));
  }, []);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onReveal, reducedMotion ? 300 : layout.winGem ? holdMs.win : holdMs.lose);
    return () => clearTimeout(t);
  }, [done, onReveal, reducedMotion, layout.winGem, holdMs.win, holdMs.lose]);

  const counts = new Map<GemKind, number>();
  opened.forEach((_, i) => {
    const g = layout.picks[i];
    if (g !== "dud") counts.set(g, (counts.get(g) ?? 0) + 1);
  });
  const [topKind, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  return {
    opened,
    done,
    open,
    left: GEM_PICKS - opened.length,
    /** What tile `tile` shows, or null while it is closed. */
    kindAt: (tile: number): GemKind | null => {
      const n = opened.indexOf(tile);
      return n >= 0 ? layout.picks[n] : null;
    },
    /** Only a ticket that really wins is told it has a pair; a loss never gets a "nearly" prompt. */
    pair: !done && topCount >= 2 && topKind && topKind === layout.winGem ? topKind : null,
  };
}
