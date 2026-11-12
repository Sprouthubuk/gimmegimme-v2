import { lazy, Suspense, useMemo, useState } from "react";
import type { RevealOutcome } from "../games/types";
import type { RevealContext } from "../games/arcade/games/types";

const ArcadeReveal = lazy(() => import("../games/arcade/ArcadeReveal"));

/** A free practice go with made-up tickets. Nothing is bought, won or credited. */
export default function DemoReveal({ game, skin, title }: { game: string; skin: string; title: string }) {
  const [round, setRound] = useState(0);
  const outcome = useMemo<RevealOutcome>(() => ({
    purchaseId: `demo-${game}-${round}`,
    tickets: [
      { ticketNumber: 1000 + round * 3, competitionId: "demo", competitionTitle: title, prize: { name: "£1 Demo Credit", valuePence: 100, type: "site_credit" } },
      { ticketNumber: 1001 + round * 3, competitionId: "demo", competitionTitle: title, prize: null },
      { ticketNumber: 1002 + round * 3, competitionId: "demo", competitionTitle: title, prize: null },
    ],
    totalWonPence: 100,
    creditedPence: 0,
  }), [game, round, title]);
  const context = useMemo<RevealContext>(() => ({ demo: { game, isInstantWin: true, prizeLabels: ["£1", "50p", "£5"], inLiveDraw: false, skin } as RevealContext[string] }), [game, skin]);
  return (
    <Suspense fallback={<div className="card empty"><span className="spin" /> Loading the game…</div>}>
      <ArcadeReveal key={outcome.purchaseId} outcome={outcome} context={context} presentation="inline" onComplete={() => setRound((r) => r + 1)} />
    </Suspense>
  );
}
