/**
 * Development-only preview of the arcade reveal games: /dev/reveal-games
 *
 * Served at /dev/reveal-games by src/pages/dev/reveal-games.astro only when the
 * dev server is running (a production build answers 404). It uses made-up sample purchases and never touches the
 * database: nothing here is a real ticket, prize or balance.
 */
import { Suspense, lazy, useState } from "react";
import { ARCADE_GAMES } from "../games/arcade/definitions";
import type { RevealContext } from "../games/arcade/games/types";
import type { RevealOutcome, RevealPrize, RevealTicket } from "../games/types";
import { GAME_SKIN_OPTIONS, skinnedGameName } from "../games/skinIds";

const ArcadeReveal = lazy(() => import("../games/arcade/ArcadeReveal"));

const credit = (pence: number): RevealPrize => ({ name: `Sample credit`, valuePence: pence, type: "site_credit" });
const LADDER = ["£100", "£50", "£10", "£5", "£1"];

function tickets(competitionId: string, title: string, start: number, prizes: (RevealPrize | null)[]): RevealTicket[] {
  return prizes.map((prize, i) => ({ ticketNumber: start + i, competitionId, competitionTitle: title, prize }));
}

function outcome(purchaseId: string, all: RevealTicket[], balanceBefore?: number): RevealOutcome {
  const totalWonPence = all.reduce((s, t) => s + (t.prize?.valuePence ?? 0), 0);
  const creditedPence = all.reduce((s, t) => s + (t.prize && t.prize.type !== "physical" ? t.prize.valuePence : 0), 0);
  return { purchaseId, tickets: all, totalWonPence, creditedPence, balanceAfterPence: balanceBefore == null ? undefined : balanceBefore + creditedPence };
}

interface Sample { id: string; label: string; build: (game: string) => { outcome: RevealOutcome; context: RevealContext } }

// `balance: null` means the purchase arrives with no balance at all (an undefined argument would take the default).
const one = (game: string, prizes: (RevealPrize | null)[], ladder = LADDER, balance: number | null = 1250) => ({
  outcome: outcome(`sample-${game}-${prizes.length}`, tickets("c1", "Sample Competition", 3104, prizes), balance ?? undefined),
  context: { c1: { game, isInstantWin: true, prizeLabels: ladder, inLiveDraw: true } } as RevealContext,
});

const SAMPLES: Sample[] = [
  { id: "minimum", label: "1 ticket: minimum win 10p", build: (g) => ({ ...one(g,[{ name: "Minimum prize",valuePence:10,type:"site_credit" }],[...LADDER,"£0.10"]), context:{ c1:{game:g,isInstantWin:true,prizeLabels:[...LADDER,"£0.10"],inLiveDraw:false} } }) },
  { id: "mixed", label: "6 tickets: win, 3 no-wins, win, no-win", build: (g) => one(g, [credit(1000), null, null, null, credit(5000), null]) },
  { id: "win", label: "1 ticket: wins £10", build: (g) => one(g, [credit(1000)]) },
  { id: "lose", label: "1 ticket: no win", build: (g) => one(g, [null]) },
  { id: "all-lose", label: "4 tickets: no wins", build: (g) => one(g, [null, null, null, null]) },
  {
    id: "types",
    label: "Cash, physical and odd pence",
    build: (g) => one(g, [{ name: "£50 Cash", valuePence: 5000, type: "cash" }, { name: "AirPods Pro", valuePence: 22900, type: "physical" }, credit(666), null], [...LADDER, "AirPods Pro"]),
  },
  { id: "one-tier", label: "Competition with a single prize tier", build: (g) => one(g, [null, credit(500), null], ["£5"]) },
  { id: "end-prize", label: "Instant win with an end prize (PS5 Pro)", build: (g) => ({ ...one(g, [null, credit(1000)]), context: { c1: { game: g, isInstantWin: true, prizeLabels: LADDER, inLiveDraw: true, endPrizeName: "PS5 Pro" } } }) },
  { id: "no-end-prize", label: "No live draw, no balance supplied", build: (g) => ({ ...one(g, [null, credit(1000)], LADDER, null), context: { c1: { game: g, isInstantWin: true, prizeLabels: LADDER, inLiveDraw: false } } }) },
  { id: "many", label: "40 tickets, 4 wins", build: (g) => one(g, Array.from({ length: 40 }, (_, i) => (i === 3 ? credit(50) : i === 17 ? credit(500) : i === 26 ? credit(100) : i === 33 ? credit(50) : null))) },
  { id: "huge", label: "250 tickets, 6 wins", build: (g) => one(g, Array.from({ length: 250 }, (_, i) => (i % 41 === 7 ? credit(100) : null))) },
  {
    id: "basket",
    label: "Mixed basket: 4 games + a standard competition (ignores the game picker)",
    build: () => ({
      outcome: outcome(
        "sample-basket",
        [
          ...tickets("c-bingo", "Gimme Bingo", 417, [null, credit(500)]),
          ...tickets("c-pop", "Pop for Pennies", 9001, Array.from({ length: 22 }, (_, i) => (i === 4 ? credit(50) : i === 15 ? credit(200) : null))),
          ...tickets("c-product", "GTA 6 Ultimate Edition", 55, [null, null, null]),
          ...tickets("c-scratch", "Scratch & Gimme", 6047, [credit(100)]),
          ...tickets("c-spin", "Gimme a Spin", 8822, [null, credit(1000)]),
        ],
        1250,
      ),
      context: {
        "c-bingo": { game: "bingo_card", isInstantWin: true, prizeLabels: LADDER, inLiveDraw: true },
        "c-pop": { game: "balloon_pop", isInstantWin: true, prizeLabels: ["£2", "£0.50"], inLiveDraw: false },
        "c-product": { game: "classic", isInstantWin: false, prizeLabels: [], inLiveDraw: true },
        "c-scratch": { game: "classic", isInstantWin: true, prizeLabels: ["£1"], inLiveDraw: true },
        "c-spin": { game: "spin_wheel", isInstantWin: true, prizeLabels: LADDER, inLiveDraw: true },
      },
    }),
  },
];

export default function RevealGamesPreview() {
  const games = Object.values(ARCADE_GAMES);
  const [game, setGame] = useState(games[0].id);
  const [skin, setSkin] = useState<string>("classic");
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [motion, setMotion] = useState<"system" | "reduced" | "full">("system");
  const [run, setRun] = useState(0);
  // "inline" keeps the controls above reachable. "auto" shows what a player gets: full screen on a phone.
  const [present, setPresent] = useState<"inline" | "auto">("inline");
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  const sample = SAMPLES.find((s) => s.id === sampleId)!;
  const built = sample.build(game);
  const o = built.outcome;
  // The chosen skin on every competition in the sample (a skin only changes the look).
  const context: RevealContext = Object.fromEntries(Object.entries(built.context).map(([id, info]) => [id, { ...info, skin }]));
  const restart = () => {
    setRun((r) => r + 1);
    setOpen(true);
  };
  const say = (msg: string) => setLog((l) => [msg, ...l].slice(0, 6));

  return (
    <div className="rgp">
      <div className="rgp-bar">
        <span className="rgp-note">
          Reveal games preview · development only · sample data, not real tickets or prizes
        </span>
        <label className="rgp-field">
          Game
          <select data-testid="game" className="rgp-input" value={game} onChange={(e) => { setGame(e.target.value); restart(); }}>
            {games.map((g) => <option key={g.id} value={g.id}>{skinnedGameName(g.id, skin) ?? g.name}</option>)}
          </select>
        </label>
        <label className="rgp-field">
          Skin
          <select data-testid="skin" className="rgp-input" value={skin} onChange={(e) => { setSkin(e.target.value); restart(); }}>
            {GAME_SKIN_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="rgp-field">
          Sample purchase
          <select data-testid="sample" className="rgp-input" value={sampleId} onChange={(e) => { setSampleId(e.target.value); restart(); }}>
            {SAMPLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="rgp-field">
          Motion
          <select data-testid="motion" className="rgp-input" value={motion} onChange={(e) => { setMotion(e.target.value as typeof motion); restart(); }}>
            <option value="system">Follow device</option>
            <option value="reduced">Reduced</option>
            <option value="full">Full</option>
          </select>
        </label>
        <label className="rgp-field">
          Layout
          <select data-testid="present" className="rgp-input" value={present} onChange={(e) => { setPresent(e.target.value as typeof present); restart(); }}>
            <option value="inline">Card (controls stay visible)</option>
            <option value="auto">As a player sees it</option>
          </select>
        </label>
        <button data-testid="replay" type="button" className="rgp-btn" onClick={restart}>Replay</button>
        <span data-testid="log" className="rgp-log">{log.join(" · ") || "onResultShown / onComplete appear here"}</span>
      </div>
      {open ? (
        <Suspense fallback={<p className="rgp-centre">Loading…</p>}>
          <ArcadeReveal
            key={`${o.purchaseId}:${game}:${skin}:${run}`}
            outcome={o}
            context={context}
            reducedMotion={motion === "system" ? undefined : motion === "reduced"}
            onResultShown={() => say("onResultShown")}
            onComplete={() => { say("onComplete"); setOpen(false); }}
            onGoToWallet={() => say("onGoToWallet")}
            onPlayAgain={() => say("onPlayAgain")}
            presentation={present}
          />
        </Suspense>
      ) : (
        <p data-testid="closed" className="rgp-centre rgp-bold">Reveal closed.</p>
      )}
    </div>
  );
}
