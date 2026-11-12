import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { RevealGameProps, RevealTicket } from "./contract";
import { skinnedDefinitionFor } from "./definitions";
import type { RevealCompetitionInfo, RevealContext, RevealGameDefinition } from "./games/types";
import { usableDecoys, winLabel } from "./games/symbols";
import { isCredited } from "./money";
import { useReducedMotion } from "./useReducedMotion";
import { Confetti } from "./shell/Confetti";
import { Header, Pips, TicketChip } from "./shell/Header";
import { BatchResultSheet, ResultSheet } from "./shell/ResultSheet";
import { Summary } from "./shell/Summary";
import { CLASSIC_SKIN } from "./skins/classic";
import { SkinContext } from "./skins/SkinContext";
import type { GameSkin } from "./skins/types";
import "./shell/reveal.css";

export interface ArcadeRevealProps extends RevealGameProps {
  /** Public facts about each competition in the purchase (game, prize list). */
  context: RevealContext;
  /** Shows a "Go to wallet" button after a credited win when provided. */
  onGoToWallet?: () => void;
  /** Shows a "Play again" button on the last screen when provided: back to the competition, never a replay of a result. */
  onPlayAgain?: () => void;
  /**
   * - `auto` (default): on a phone the game takes the whole screen and the page behind cannot scroll;
   *   on a tablet or desktop it sits in the page as a card.
   * - `fill`: fills the box it is given (used inside the demo dialog, which is already full screen on a phone).
   * - `inline`: always a card in the page.
   */
  presentation?: "auto" | "fill" | "inline";
}

const PHONE = "(max-width: 767px)";
function subscribePhone(cb: () => void) {
  const mql = window.matchMedia(PHONE);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
const useIsPhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);

type Phase = "play" | "result" | "summary";

/** One screen of play: a single ticket, or a whole competition's tickets for a batch game. */
interface Step {
  def: RevealGameDefinition;
  info: RevealCompetitionInfo;
  tickets: readonly RevealTicket[];
  /** All of this competition's tickets, and where this step sits among them. */
  group: readonly RevealTicket[];
  indexInGroup: number;
  /** Played tickets before this step. */
  offset: number;
  /** The look this step is drawn in (classic when the competition's skin has no version of its game). */
  skin: GameSkin;
}

const NO_INFO: RevealCompetitionInfo = { game: null, isInstantWin: false, prizeLabels: [], inLiveDraw: false };
const credit = (t: RevealTicket) => (t.prize && isCredited(t.prize) ? t.prize.valuePence : 0);

function buildSteps(tickets: readonly RevealTicket[], context: RevealContext): Step[] {
  const steps: Step[] = [];
  let offset = 0;
  // The server sorts tickets by competition, so each competition is one run.
  let i = 0;
  while (i < tickets.length) {
    const id = tickets[i].competitionId;
    let j = i;
    while (j < tickets.length && tickets[j].competitionId === id) j++;
    const group = tickets.slice(i, j);
    const info = context[id] ?? NO_INFO;
    const { def, skin } = skinnedDefinitionFor(info.game, info.skin);
    if (def.kind === "batch") {
      steps.push({ def, info, tickets: group, group, indexInGroup: 0, offset, skin });
      offset += group.length;
    } else {
      group.forEach((t, k) => steps.push({ def, info, tickets: [t], group, indexInGroup: k, offset: offset + k, skin }));
      offset += group.length;
    }
    i = j;
  }
  return steps;
}

/**
 * Plays a purchase through the arcade games, one competition after another,
 * each with its own game. Presentation only: every result on screen is read
 * from `outcome`, which the server decided and credited before this rendered.
 * Standard (non instant-win) competitions are not played; they have no instant
 * result to show.
 */
export default function ArcadeReveal({ outcome, context, onComplete, onResultShown, onGoToWallet, onPlayAgain, presentation = "auto", reducedMotion: rmProp }: ArcadeRevealProps) {
  const reducedMotion = useReducedMotion(rmProp);
  const fullScreen = useIsPhone() && presentation === "auto";

  // Full screen on a phone: the page behind must not scroll, bounce or pull-to-refresh during play.
  useEffect(() => {
    if (!fullScreen) return;
    document.documentElement.classList.add("rg-lock");
    return () => document.documentElement.classList.remove("rg-lock");
  }, [fullScreen]);
  const played = useMemo(() => outcome.tickets.filter((t) => context[t.competitionId]?.isInstantWin), [outcome.tickets, context]);
  const steps = useMemo(() => buildSteps(played, context), [played, context]);
  const total = played.length;

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(steps.length === 0 ? "summary" : "play");
  const [batchProgress, setBatchProgress] = useState(0);
  const step = steps[Math.min(stepIndex, steps.length - 1)] as Step | undefined;

  // Running wallet: work back from the server's final balance.
  const balanceBefore = outcome.balanceAfterPence == null ? undefined : outcome.balanceAfterPence - outcome.creditedPence;
  const creditThrough = useCallback((count: number) => played.slice(0, count).reduce((s, t) => s + credit(t), 0), [played]);
  const revealedCount =
    phase === "summary" || !step ? total : step.offset + (phase === "result" ? step.tickets.length : step.def.kind === "batch" ? batchProgress : 0);
  const balanceShown =
    balanceBefore == null ? undefined : phase === "summary" ? outcome.balanceAfterPence : balanceBefore + creditThrough(revealedCount);

  // onResultShown fires once: when the player has seen every result.
  const lastStep = stepIndex >= steps.length - 1;
  const allShown = phase === "summary" || (phase === "result" && lastStep);
  const firedRef = useRef(false);
  useEffect(() => {
    if (allShown && !firedRef.current) {
      firedRef.current = true;
      onResultShown?.();
    }
  }, [allShown, onResultShown]);

  // Boards call onReveal from timers — ignore anything that arrives late.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const handleReveal = useCallback(() => {
    if (phaseRef.current === "play") setPhase("result");
  }, []);

  // Set through the DOM so it works on React 18, which has no `inert` prop.
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boardRef.current?.toggleAttribute("inert", phase === "result");
  }, [phase, stepIndex]);

  const next = () => {
    if (!lastStep) {
      setStepIndex(stepIndex + 1);
      setBatchProgress(0);
      setPhase("play");
    } else if (total > 1) setPhase("summary");
    else onComplete();
  };
  // Closing never skips a win silently: unrevealed tickets go to the summary first.
  const close = () => (allShown ? onComplete() : setPhase("summary"));

  const ticket = step?.tickets[0];
  const decoys = useMemo(
    () => (step && ticket ? usableDecoys(step.info.prizeLabels, winLabel(ticket.prize)) : []),
    [step, ticket],
  );
  const liveDrawTickets = useMemo(() => outcome.tickets.filter((t) => context[t.competitionId]?.inLiveDraw).length, [outcome.tickets, context]);

  const def = step?.def;
  // The results screen keeps a skin only when every game in the purchase was drawn in it.
  const summarySkin = steps.length > 0 && steps.every((s) => s.skin.id === steps[0].skin.id) ? steps[0].skin : CLASSIC_SKIN;
  const skin = phase === "summary" || !step ? summarySkin : step.skin;
  const Backdrop = skin.Backdrop;
  const nextStep = steps[stepIndex + 1] as Step | undefined;
  const primaryLabel = !nextStep
    ? total > 1
      ? "See all results"
      : "Done"
    : def && def.kind === "single" && nextStep.def.id === def.id && nextStep.group === step?.group
      ? def.playNextLabel
      : `Next: ${nextStep.def.name}`;
  const wallet =
    balanceBefore != null && step
      ? { before: balanceBefore + creditThrough(step.offset), after: balanceBefore + creditThrough(step.offset + step.tickets.length) }
      : undefined;
  const stepWon = !!step && step.tickets.some((t) => t.prize);

  // A short buzz when a win lands, on phones that support it. Purely decorative, so it fails silently.
  useEffect(() => {
    if (phase !== "result" || !stepWon || reducedMotion) return;
    try {
      navigator.vibrate?.(40);
    } catch {
      /* not supported */
    }
  }, [phase, stepWon, stepIndex, reducedMotion]);
  const showConfetti = (phase === "result" && stepWon) || (phase === "summary" && outcome.totalWonPence > 0);
  const sheetActions = {
    primaryLabel,
    onPrimary: next,
    remaining: step ? total - step.offset - step.tickets.length : 0,
    onRevealAll: () => setPhase("summary"),
    onGoToWallet,
    wallet,
    // The last screen of a one-ticket purchase has no summary after it, so it carries the closing buttons.
    final: !nextStep && total <= 1,
    onPlayAgain,
    onDone: onComplete,
  };

  const view = (
    <div
      className={`rg-reveal rg-skin-${skin.id} rg-theme-${def?.theme ?? "pink"} rg-game-${def?.id ?? "none"} is-${phase} ${reducedMotion ? "is-reduced-motion" : ""} ${fullScreen ? "rg-fullscreen" : presentation === "fill" ? "rg-fill" : ""}`}
      role="group"
      aria-label={def ? `${def.name} reveal` : "Your results"}
    >
      {Backdrop && <Backdrop reducedMotion={reducedMotion} />}
      {phase === "summary" || !step || !def ? (
        <>
          <Header counter="Your results" balancePence={balanceShown} onClose={onComplete} closeLabel="Close" />
          <div className="rg-summary-scroll">
            <Summary outcome={outcome} played={played} liveDrawTickets={liveDrawTickets} balanceBefore={balanceBefore} onDone={onComplete} onGoToWallet={onGoToWallet} onPlayAgain={onPlayAgain} />
          </div>
        </>
      ) : (
        <>
          <Header
            title={step.tickets[0].competitionTitle}
            counter={
              def.kind === "single"
                ? `${def.noun} ${step.indexInGroup + 1} of ${step.group.length}`
                : `${step.tickets.length.toLocaleString("en-GB")} ${step.tickets.length === 1 ? def.unit[0] : def.unit[1]}`
            }
            balancePence={balanceShown}
            onClose={close}
            closeLabel={allShown ? "Close" : "Close and see all results"}
          />
          {def.kind === "single" && (
            <>
              <Pips tickets={step.group} index={step.indexInGroup} revealedThrough={step.indexInGroup - (phase === "play" ? 1 : 0)} />
              <TicketChip ticketNumber={step.tickets[0].ticketNumber} />
            </>
          )}
          <div className={`rg-board ${def.kind === "batch" ? "is-batch" : ""} ${phase === "result" ? "is-compact" : ""}`} ref={boardRef}>
            <Suspense fallback={<div className="rg-board-loading" role="status">Loading…</div>}>
              {def.kind === "single" ? (
                <def.Board
                  key={stepIndex}
                  ticket={step.tickets[0]}
                  seed={`${outcome.purchaseId}:${step.tickets[0].competitionId}:${step.tickets[0].ticketNumber}`}
                  reducedMotion={reducedMotion}
                  decoys={decoys}
                  onReveal={handleReveal}
                />
              ) : (
                <def.BatchBoard
                  key={stepIndex}
                  tickets={step.tickets}
                  seed={`${outcome.purchaseId}:${step.tickets[0].competitionId}`}
                  reducedMotion={reducedMotion}
                  onProgress={setBatchProgress}
                  onReveal={handleReveal}
                />
              )}
            </Suspense>
          </div>
          {phase === "result" &&
            (def.kind === "single" ? (
              <ResultSheet ticket={step.tickets[0]} winKicker={skin.copy.winKicker ?? def.winKicker ?? "WINNER!"} noWinLine={def.noWinLine ?? skin.copy.noWinLine} inLiveDraw={step.info.inLiveDraw} endPrizeName={step.info.endPrizeName} {...sheetActions} />
            ) : (
              <BatchResultSheet tickets={step.tickets} unit={def.unit} noWinLine={def.noWinLine ?? skin.copy.noWinLine} inLiveDraw={step.info.inLiveDraw} endPrizeName={step.info.endPrizeName} {...sheetActions} />
            ))}
        </>
      )}
      {showConfetti && <Confetti key={`${phase}:${stepIndex}`} seed={`${outcome.purchaseId}:${stepIndex}:${phase}`} reducedMotion={reducedMotion} small={phase === "result" ? (step?.tickets.every(t => !t.prize || t.prize.valuePence <= 10) ?? false) : outcome.tickets.every(t => !t.prize || t.prize.valuePence <= 10)} />}
    </div>
  );

  // On a phone the game is drawn straight onto the page body, so nothing around it (a padded column,
  // a blurred overlay) can shrink it or let the page show through.
  const skinned = <SkinContext.Provider value={skin}>{view}</SkinContext.Provider>;
  return fullScreen ? createPortal(skinned, document.body) : skinned;
}
