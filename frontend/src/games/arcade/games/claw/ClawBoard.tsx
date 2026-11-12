import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BoardProps } from "../types";
import { winLabel } from "../symbols";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./claw.css";

type Tone = "pink" | "cyan" | "yellow";
const TONES: Tone[] = ["pink", "cyan", "yellow"];

// Capsule centres as % of the glass. Later rows sit on top.
const PILE: { x: number; y: number; tone: Tone }[] = [
  ...[8, 24, 40, 56, 72, 88].map((x, i) => ({ x, y: 86, tone: TONES[i % 3] })),
  ...[16, 32, 48, 64, 80].map((x, i) => ({ x, y: 73, tone: TONES[(i + 1) % 3] })),
  ...[24, 40, 56, 72].map((x, i) => ({ x, y: 60, tone: TONES[(i + 2) % 3] })),
  ...[33, 50, 66].map((x, i) => ({ x, y: 48, tone: TONES[i % 3] })),
];
const REST_LEN = 12;
const MIN_X = 12;
const MAX_X = 88;
const lenFor = (y: number) => y - 25; // head bottom meets the capsule's top

type Phase = "aim" | "descend" | "close" | "ascend" | "open";

function Capsule({ tone, open }: { tone: Tone; open?: boolean }) {
  return (
    <span className={`rg-capsule rg-capsule-${tone} ${open ? "is-open" : ""}`}>
      <span className="rg-capsule-top" />
      <span className="rg-capsule-bottom" />
    </span>
  );
}

export function ClawBoard({ ticket, reducedMotion, onReveal }: BoardProps) {
  const label = winLabel(ticket.prize);
  const [x, setX] = useState(50);
  const [phase, setPhase] = useState<Phase>("aim");
  const [target, setTarget] = useState<number | null>(null);
  const [tilt, setTilt] = useState(0);
  const hold = useRef<number | null>(null);
  const glassRef = useRef<HTMLDivElement>(null);

  const move = (dx: number) => setX((v) => Math.max(MIN_X, Math.min(MAX_X, v + dx)));
  const startHold = (dir: -1 | 1) => {
    if (phase !== "aim") return;
    setTilt(dir);
    stopHold();
    hold.current = window.setInterval(() => move(dir * 1.2), 30);
  };
  const stopHold = () => {
    if (hold.current) window.clearInterval(hold.current);
    hold.current = null;
    setTilt(0);
  };
  useEffect(() => stopHold, []);

  const grab = () => {
    if (phase !== "aim") return;
    stopHold();
    // Top-most capsule under the claw, else the nearest one.
    const under = PILE.map((c, i) => ({ ...c, i })).filter((c) => Math.abs(c.x - x) <= 9);
    const pickFrom = under.length ? under : PILE.map((c, i) => ({ ...c, i }));
    const chosen = pickFrom.sort((a, b) => (under.length ? a.y - b.y : Math.abs(a.x - x) - Math.abs(b.x - x)))[0];
    setTarget(chosen.i);
    setX(PILE[chosen.i].x);
    setPhase("descend");
  };

  useEffect(() => {
    if (phase === "aim") return;
    const rm = reducedMotion;
    const steps: Partial<Record<Phase, [number, Phase | "reveal"]>> = {
      descend: [rm ? 80 : 950, "close"],
      close: [rm ? 80 : 350, "ascend"],
      // Win or lose, the capsule comes up and opens. A loss is simply an empty capsule.
      ascend: [rm ? 80 : 1050, "open"],
      open: [rm ? 300 : 1300, "reveal"],
    };
    const step = steps[phase];
    if (!step) return;
    const t = setTimeout(() => (step[1] === "reveal" ? onReveal() : setPhase(step[1])), step[0]);
    return () => clearTimeout(t);
  }, [phase, label, reducedMotion, onReveal]);

  const cap = target != null ? PILE[target] : null;
  const down = phase === "descend" || phase === "close";
  const carrying = !!cap && (phase === "ascend" || phase === "open");
  const len = cap && down ? lenFor(cap.y) : REST_LEN;
  const closed = phase === "close" || phase === "ascend" || phase === "open";

  const onGlassPointer = (e: React.PointerEvent) => {
    if (phase !== "aim" || !(e.buttons & 1)) return;
    const r = glassRef.current!.getBoundingClientRect();
    setX(Math.max(MIN_X, Math.min(MAX_X, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <>
      <div className={`rg-claw-machine is-${phase}`}>
        <div className="rg-claw-top">
          <div className="rg-marquee" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
          <div className="rg-claw-title">CLAW MACHINE</div>
        </div>
        <div className="rg-claw-glass" ref={glassRef} onPointerDown={onGlassPointer} onPointerMove={onGlassPointer}>
          <div className="rg-claw-rail" />
          {PILE.map((c, i) =>
            i === target && carrying ? null : (
              <span
                key={i}
                className="rg-capsule-slot"
                style={{ left: `${c.x}%`, top: `${c.y}%`, zIndex: Math.round(c.y) }}
              >
                <Capsule tone={c.tone} />
              </span>
            ),
          )}
          <div className="rg-claw-rig" style={{ left: `${x}%`, "--len": len } as CSSProperties}>
            <span className="rg-claw-carriage" />
            <span className="rg-claw-cable" />
            <span className={`rg-claw-head ${closed ? "is-closed" : ""}`}>
              <svg viewBox="0 0 60 50" aria-hidden="true">
                <rect x="18" y="0" width="24" height="16" rx="7" fill="#e9e9ee" stroke="#141414" strokeWidth="3.5" />
                <path className="rg-prong is-left" d="M22 14 L8 34 L16 46" fill="none" stroke="#141414" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-left" d="M22 14 L8 34 L16 46" fill="none" stroke="#e9e9ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-right" d="M38 14 L52 34 L44 46" fill="none" stroke="#141414" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path className="rg-prong is-right" d="M38 14 L52 34 L44 46" fill="none" stroke="#e9e9ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {cap && carrying && (
                <span className="rg-claw-held">
                  <Capsule tone={cap.tone} open={phase === "open"} />
                  {phase === "open" && (label ? <Coin label={label} className="rg-claw-prize" /> : <span className="rg-claw-empty">No prize</span>)}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="rg-claw-panel">
          <div className="rg-joystick" aria-label="Move the claw">
            <button
              type="button"
              className="rg-joy-btn is-left"
              aria-label="Move claw left"
              disabled={phase !== "aim"}
              onPointerDown={() => startHold(-1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && move(-8)}
            />
            <span className="rg-joy-stick" style={{ rotate: `${tilt * 18}deg` }} />
            <span className="rg-joy-base" />
            <button
              type="button"
              className="rg-joy-btn is-right"
              aria-label="Move claw right"
              disabled={phase !== "aim"}
              onPointerDown={() => startHold(1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && move(8)}
            />
          </div>
          <div className="rg-claw-chute">PRIZE</div>
          <button type="button" className="rg-grab" onClick={grab} disabled={phase !== "aim"}>
            GRAB
          </button>
        </div>
      </div>
      {phase === "aim" ? (
        <GamePrompt title="Move the claw, then press GRAB" sub={RESULT_SET_NOTE} />
      ) : phase === "open" ? (
        <GamePrompt title={label ? `${label}!` : "No prize inside"} tone="pink" />
      ) : carrying ? (
        <GamePrompt title="Got one!" tone="cyan" sub="Bringing it up…" />
      ) : (
        <GamePrompt title="Grabbing…" tone="pink" />
      )}
    </>
  );
}
