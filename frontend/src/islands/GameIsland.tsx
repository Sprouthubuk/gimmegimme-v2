import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/api";
import type { PlayResult } from "../lib/types";
import type { GameLinks, GameTicket, MountedGame } from "../../packages/games";

/**
 * Mounts a premium game (packages/games) in an Astro page: `<GameIsland client:visible ... />`.
 * Either give it `tickets` (the dev preview) or an `orderNumber`: then it asks the server for the order's
 * results (POST /api/orders/{n}/play: decided by Verity at payment, idempotent) and plays them.
 */
interface Props {
  game: string;
  theme?: string;
  title?: string;
  competitionTitle?: string;
  links?: GameLinks;
  tickets?: GameTicket[];
  /** The competition's real prize names, largest first (from the play context when an order is given). */
  prizeLabels?: string[];
  orderNumber?: string;
  /** Only this competition's tickets from the order. */
  competitionId?: string;
  reducedMotion?: boolean;
  /** Height of the play area; the game fills it. */
  height?: string;
}

export default function GameIsland(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let game: MountedGame | null = null;
    let cancelled = false;
    (async () => {
      try {
        const lib = await import("../../packages/games");
        if (!lib.isPremiumGame(p.game)) throw new Error(`Unknown game ${p.game}`);
        let tickets = p.tickets ?? [];
        let prizeLabels = p.prizeLabels;
        if (p.orderNumber) {
          const play = await api<PlayResult>(`/api/orders/${encodeURIComponent(p.orderNumber)}/play`, { json: {} });
          tickets = lib.fromRevealOutcome(play, p.competitionId);
          const cid = p.competitionId ?? play.outcome.tickets[0]?.competitionId;
          prizeLabels = cid ? [...(play.context[cid]?.prizeLabels ?? [])] : undefined;
        }
        if (cancelled || !host.current || !tickets.length) return;
        game = await lib.mountPremiumGame(p.game, host.current, {
          tickets,
          prizeLabels,
          theme: p.theme,
          title: p.title,
          competitionTitle: p.competitionTitle,
          links: p.links,
          reducedMotion: p.reducedMotion,
        });
        if (cancelled) game.destroy();
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    })();
    return () => {
      cancelled = true;
      game?.destroy();
    };
  }, [p.game, p.theme, p.orderNumber, p.competitionId, p.reducedMotion, JSON.stringify(p.tickets)]);

  if (error) return <p className="err" role="alert">{error}</p>;
  return <div ref={host} data-testid="game-host" style={{ width: "100%", height: p.height ?? "100dvh", position: "relative" }} />;
}
