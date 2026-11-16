import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "../types";
import { generateWhack, WHACK_HOLES, WHACK_TARGET } from "../generators";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import "./whackAMole.css";

/** How long a mole stays up, and the pause before the next one. Reduced motion: a mole waits until it is whacked. */
const UP_MS = 1150;
const GAP_MS = 320;
const BONK_MS = 480;
const SIGN_MS = 1500;

/** An original cartoon mole in a gold miner's hat. Drawn once per hole; shading is shared. */
export function Mole({ dizzy = false }: { dizzy?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="rg-mole-svg" aria-hidden="true">
      <defs>
        <radialGradient id="ml-fur" cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#b48cd9" />
          <stop offset="0.55" stopColor="#7a52a6" />
          <stop offset="1" stopColor="#4a2a70" />
        </radialGradient>
        <radialGradient id="ml-belly" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f6e7ff" />
          <stop offset="1" stopColor="#d2b8ee" />
        </radialGradient>
        <linearGradient id="ml-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3a8" />
          <stop offset="0.55" stopColor="#ffd23a" />
          <stop offset="1" stopColor="#d08a00" />
        </linearGradient>
      </defs>
      <path d="M14 100 V58 C14 30 30 16 50 16 C70 16 86 30 86 58 V100 Z" fill="url(#ml-fur)" />
      <ellipse cx="50" cy="80" rx="24" ry="22" fill="url(#ml-belly)" />
      <path d="M22 30 C24 10 76 10 78 30 Z" fill="url(#ml-hat)" />
      <rect x="18" y="27" width="64" height="7" rx="3.5" fill="#d08a00" />
      <circle cx="50" cy="20" r="6" fill="#fffbe0" />
      <circle cx="50" cy="20" r="3.4" fill="#ffe680" />
      {dizzy ? (
        <g stroke="#2b0f45" strokeWidth="3" strokeLinecap="round">
          <path d="M33 44 l8 8 m0 -8 l-8 8" />
          <path d="M59 44 l8 8 m0 -8 l-8 8" />
        </g>
      ) : (
        <g>
          <circle cx="37" cy="48" r="5.5" fill="#2b0f45" />
          <circle cx="63" cy="48" r="5.5" fill="#2b0f45" />
          <circle cx="38.8" cy="46.2" r="1.8" fill="#fff" />
          <circle cx="64.8" cy="46.2" r="1.8" fill="#fff" />
        </g>
      )}
      <circle cx="28" cy="58" r="4.5" fill="#ff8fc8" opacity="0.6" />
      <circle cx="72" cy="58" r="4.5" fill="#ff8fc8" opacity="0.6" />
      <ellipse cx="50" cy="59" rx="8" ry="6" fill="#ff5fa8" />
      <ellipse cx="47.5" cy="57" rx="2.6" ry="1.6" fill="#fff" opacity="0.7" />
      <path d="M44 66 Q50 71 56 66" fill="none" stroke="#2b0f45" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="46.5" y="67" width="7" height="6" rx="1.5" fill="#fff" />
    </svg>
  );
}

/** A wooden mallet with a red head. */
function Mallet() {
  return (
    <svg viewBox="0 0 80 80" className="rg-mallet-svg" aria-hidden="true">
      <defs>
        <linearGradient id="ml-wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8682a" />
          <stop offset="0.5" stopColor="#e3a660" />
          <stop offset="1" stopColor="#8a4f18" />
        </linearGradient>
        <linearGradient id="ml-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8fcb" />
          <stop offset="0.5" stopColor="#ff2d95" />
          <stop offset="1" stopColor="#a8005a" />
        </linearGradient>
      </defs>
      <rect x="36" y="26" width="8" height="52" rx="4" fill="url(#ml-wood)" />
      <rect x="10" y="4" width="60" height="26" rx="10" fill="url(#ml-head)" />
      <rect x="10" y="4" width="10" height="26" rx="5" fill="#ffd23a" />
      <rect x="60" y="4" width="10" height="26" rx="5" fill="#ffd23a" />
      <rect x="22" y="8" width="34" height="4" rx="2" fill="#fff" opacity="0.5" />
    </svg>
  );
}

type Phase = "ready" | "playing" | "done";

export function WhackAMoleBoard({ ticket, seed, reducedMotion, onReveal }: BoardProps) {
  const layout = useMemo(() => generateWhack(ticket.prize, seed), [ticket.prize, seed]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [popIndex, setPopIndex] = useState(0);
  /** The hole whose mole is up, or null between moles. */
  const [up, setUp] = useState<number | null>(null);
  const [whacks, setWhacks] = useState(0);
  /** The last hole hit, for the bonk and stars. */
  const [bonk, setBonk] = useState<{ hole: number; n: number } | null>(null);
  const [finalHole, setFinalHole] = useState<number | null>(null);

  // Moles pop up in the seeded order. A mole goes back down if not whacked (except with reduced motion).
  useEffect(() => {
    if (phase !== "playing") return;
    if (up === null) {
      const t = setTimeout(() => setUp(layout.pops[popIndex % layout.pops.length]), popIndex === 0 ? 250 : GAP_MS);
      return () => clearTimeout(t);
    }
    if (reducedMotion) return;
    const t = setTimeout(() => {
      setUp(null);
      setPopIndex((i) => i + 1);
    }, UP_MS);
    return () => clearTimeout(t);
  }, [phase, up, popIndex, layout.pops, reducedMotion]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(onReveal, reducedMotion ? 400 : SIGN_MS);
    return () => clearTimeout(t);
  }, [phase, onReveal, reducedMotion]);

  const whack = (hole: number) => {
    if (phase !== "playing" || hole !== up) return;
    if (!reducedMotion) navigator.vibrate?.(14);
    const n = whacks + 1;
    setWhacks(n);
    setBonk({ hole, n });
    if (n >= WHACK_TARGET) {
      setFinalHole(hole);
      setPhase("done");
      return;
    }
    setUp(null);
    setPopIndex((i) => i + 1);
  };

  // A bonked mole shows its dizzy face briefly as it drops.
  const [dizzy, setDizzy] = useState<number | null>(null);
  useEffect(() => {
    if (!bonk || phase === "done") return;
    setDizzy(bonk.hole);
    const t = setTimeout(() => setDizzy(null), BONK_MS);
    return () => clearTimeout(t);
  }, [bonk, phase]);

  let prompt: React.ReactNode;
  if (phase === "ready") prompt = null;
  else if (phase === "done") prompt = <GamePrompt title={layout.label ? `${layout.label}!` : "No prize this time"} tone={layout.label ? "pink" : "ink"} />;
  else prompt = <GamePrompt title={whacks === 0 ? "Whack a mole!" : "Bonk! Keep going…"} tone="pink" sub={`${WHACK_TARGET - whacks} to whack`} />;

  return (
    <>
      <div className={`rg-whack is-${phase}`}>
        <div className="rg-whack-sign">
          <span>WHACK-A-MOLE</span>
        </div>
        <div className="rg-whack-lawn">
          <div className="rg-whack-grid">
            {Array.from({ length: WHACK_HOLES }, (_, hole) => {
              const isFinal = finalHole === hole;
              const isUp = up === hole || isFinal;
              const isDizzy = dizzy === hole;
              return (
                <button
                  key={hole}
                  type="button"
                  className={`rg-hole ${isUp ? "is-up" : ""} ${isDizzy ? "is-bonked" : ""} ${isFinal ? "is-final" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    whack(hole);
                  }}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && whack(hole)}
                  disabled={phase !== "playing"}
                  aria-label={isUp && phase === "playing" ? "A mole is up: whack it" : `Hole ${hole + 1}`}
                >
                  <span className="rg-hole-back" />
                  <span className="rg-hole-pit">
                    <span className="rg-mole">
                      <Mole dizzy={isDizzy || (isFinal && !layout.label)} />
                      {isFinal && <span className={`rg-mole-sign ${layout.label ? "is-win" : ""}`}>{layout.label ?? "No prize"}</span>}
                    </span>
                  </span>
                  <span className="rg-hole-front" />
                  {bonk?.hole === hole && (
                    <span key={bonk.n} className="rg-bonk" aria-hidden="true">
                      <span className="rg-mallet">
                        <Mallet />
                      </span>
                      <span className="rg-stars">
                        <i />
                        <i />
                        <i />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="rg-whack-count" aria-label={`${whacks} of ${WHACK_TARGET} whacked`}>
            {Array.from({ length: WHACK_TARGET }, (_, i) => (
              <i key={i} className={i < whacks ? "is-done" : ""} />
            ))}
          </div>
        </div>
      </div>
      {phase === "ready" ? (
        <div className="rg-whack-controls">
          <button type="button" className="rg-cta" onClick={() => setPhase("playing")}>
            START
          </button>
          <p className="rg-note">Whack {WHACK_TARGET} moles to see your result. {RESULT_SET_NOTE}</p>
        </div>
      ) : (
        prompt
      )}
    </>
  );
}
