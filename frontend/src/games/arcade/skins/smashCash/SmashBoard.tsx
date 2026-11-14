import { useEffect, useId, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { BatchBoardProps } from "../../games/types";
import { formatPence, formatTicketNumber, isCredited, prizeShortLabel } from "../../money";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { crackerColours, initState, makeReducer, type Colour } from "../christmas/crackerState";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import { Scene3D } from "../../three/Scene3D";
import { buildSmashScene, type SmashState } from "./smash3d";
import "../shared/themed.css";
import "./smash.css";

/**
 * Smash My Cash, a skin of Balloon Pop: glass jars stuffed with cash, one per
 * ticket, and a golden sledgehammer. Tap a jar to smash it. Which jar the player
 * smashes is cosmetic: the Nth jar smashed always shows the Nth ticket of the
 * purchase, exactly as Balloon Pop does (the same table state as the Christmas
 * crackers, crackerState.ts).
 */

/** The hammer swings, then the glass goes. */
const SMASH_MS = 300;
const NEXT_MS = 1400;

const TINT: Record<Colour, [string, string]> = {
  red: ["rgba(255, 150, 210, 0.5)", "#ff4fb0"],
  green: ["rgba(140, 230, 255, 0.5)", "#2ad4ff"],
  gold: ["rgba(255, 226, 140, 0.5)", "#ffcc33"],
};

/** A glass jar of cash with a gold lid. */
function Jar({ colour }: { colour: Colour }) {
  const id = useId();
  const [glass, rim] = TINT[colour];
  const body = "M18 32 C18 25 26 24 30 27 H70 C74 24 82 25 82 32 V92 C82 101 75 106 66 106 H34 C25 106 18 101 18 92 Z";
  return (
    <svg viewBox="0 0 100 112" className="rg-smash-jar-svg" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-in`}>
          <path d={body} />
        </clipPath>
      </defs>
      <ellipse cx="50" cy="108" rx="34" ry="4" fill="rgba(0,0,0,0.45)" />
      <g className="rg-smash-glass">
        <path d={body} fill="rgba(20, 8, 40, 0.55)" />
        <g clipPath={`url(#${id}-in)`}>
          {/* Notes and coins packed in. */}
          {[[24, 84, -14], [46, 88, 10], [30, 66, 18], [52, 70, -8], [26, 48, -6], [48, 52, 14], [36, 36, -18]].map(([x, y, r], i) => (
            <g key={i} transform={`rotate(${r} ${x + 16} ${y + 8})`}>
              <rect x={x} y={y} width="34" height="17" rx="2" fill="url(#rg-smash-note)" stroke="#141414" strokeWidth="1.6" />
              <circle cx={x + 8} cy={y + 8.5} r="3.6" fill="#f6c4b2" />
              <text x={x + 23} y={y + 9.5} textAnchor="middle" dominantBaseline="middle" className="rg-smash-note-text">50</text>
            </g>
          ))}
          {[[28, 100], [42, 102], [58, 101], [72, 98], [64, 90]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" fill="url(#rg-smash-gold)" stroke="#141414" strokeWidth="1.5" />
          ))}
        </g>
        <path d={body} fill={glass} opacity="0.35" />
        <path d={body} fill="none" stroke="#141414" strokeWidth="3.5" />
        <path d="M25 40 C24 56 24 76 26 92" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.6" fill="none" />
        <path d="M74 44 V62" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
        <rect x="22" y="58" width="56" height="7" fill={rim} stroke="#141414" strokeWidth="2" opacity="0.9" />
        {[28, 44, 56, 72].map((x) => (
          <circle key={x} cx={x} cy="61.5" r="1.6" fill="#141414" />
        ))}
      </g>
      <g className="rg-smash-lid">
        <rect x="24" y="8" width="52" height="16" rx="4" fill="url(#rg-smash-gold)" stroke="#141414" strokeWidth="3" />
        <path d="M30 12 V20 M38 12 V20 M46 12 V20 M54 12 V20 M62 12 V20 M70 12 V20" stroke="#b37800" strokeWidth="1.6" />
        <rect x="28" y="22" width="44" height="6" rx="2" fill="#c98a00" stroke="#141414" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** A golden sledgehammer. */
function Hammer() {
  return (
    <svg viewBox="0 0 100 100" className="rg-smash-hammer-svg" aria-hidden="true">
      <path d="M38 30 L92 88" stroke="#141414" strokeWidth="12" strokeLinecap="round" />
      <path d="M38 30 L92 88" stroke="url(#rg-smash-handle)" strokeWidth="7" strokeLinecap="round" />
      <path d="M78 73 L90 86" stroke="#141414" strokeWidth="13" strokeLinecap="round" />
      <path d="M78 73 L90 86" stroke="#2a1a3a" strokeWidth="8" strokeLinecap="round" />
      <g transform="rotate(-47 34 26)">
        <rect x="8" y="12" width="52" height="28" rx="5" fill="url(#rg-smash-gold)" stroke="#141414" strokeWidth="3.5" />
        <rect x="4" y="15" width="8" height="22" rx="2" fill="#c98a00" stroke="#141414" strokeWidth="2.5" />
        <rect x="56" y="15" width="8" height="22" rx="2" fill="#c98a00" stroke="#141414" strokeWidth="2.5" />
        <path d="M14 18 H50" stroke="#fff6c2" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function SharedDefs() {
  return (
    <svg className="rg-smash-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rg-smash-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.5" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
        <linearGradient id="rg-smash-note" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a8e" />
          <stop offset="0.55" stopColor="#e2525a" />
          <stop offset="1" stopColor="#a8283a" />
        </linearGradient>
        <linearGradient id="rg-smash-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="1" stopColor="#d99a00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** "SMASH MY CASH": cracked gold lettering. */
function Title() {
  return (
    <svg viewBox="0 0 320 84" className="rg-themed-sign rg-smash-title" role="img" aria-label="Smash My Cash">
      <text x="160" y="40" textAnchor="middle" className="rg-smash-title-top">SMASH</text>
      <text x="160" y="78" textAnchor="middle" className="rg-smash-title-bottom">MY CASH</text>
      {/* Cracks through the letters. */}
      <path d="M96 8 L104 20 L98 28 L108 40 M214 6 L206 18 L214 26 L204 40 M150 50 L158 60 L152 68 L160 80" className="rg-smash-title-crack" />
    </svg>
  );
}

export function SmashBoard({ tickets, seed, reducedMotion, onProgress, onReveal }: BatchBoardProps) {
  const n = tickets.length;
  const colours = useMemo(() => crackerColours(n, seed), [n, seed]);
  const reducer = useMemo(() => makeReducer(tickets, colours), [tickets, colours]);
  const [state, dispatch] = useReducer(reducer, n, initState);
  const [smashAll, setSmashAll] = useState(false);
  const done = state.pulled === n;

  /** Places with a smash in progress, set at once so a double tap can't smash one jar twice. */
  const busy = useRef(new Set<number>());
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const smashSlot = (slot: number) => {
    if (busy.current.has(slot) || state.slots[slot]?.serial == null || state.slots[slot].pulled) return;
    busy.current.add(slot);
    dispatch({ type: "pull", slot });
    if (!reducedMotion) later(() => navigator.vibrate?.(18), SMASH_MS);
    later(() => playSound("smash"), reducedMotion ? 0 : SMASH_MS);
    later(() => {
      busy.current.delete(slot);
      dispatch({ type: "next", slot });
    }, reducedMotion ? 700 : NEXT_MS);
  };

  const handleSmashAll = () => {
    if (smashAll || done) return;
    setSmashAll(true);
    if (reducedMotion) {
      dispatch({ type: "rest" });
      return;
    }
    // Smash what's on the shelf one after another, then show the rest at once.
    const onShelf = state.slots.map((s, i) => (s.serial !== null && !s.pulled ? i : -1)).filter((i) => i >= 0);
    onShelf.forEach((slot, k) => later(() => smashSlot(slot), k * 140));
    later(() => dispatch({ type: "rest" }), onShelf.length * 140 + SMASH_MS + 700);
  };

  useEffect(() => onProgress(state.pulled), [state.pulled, onProgress]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onReveal, reducedMotion ? 400 : 1300);
    return () => clearTimeout(t);
  }, [done, onReveal, reducedMotion]);

  const shown = tickets.slice(0, state.pulled);
  const wins = shown.filter((t) => t.prize);
  const wonPence = wins.reduce((s, t) => s + (isCredited(t.prize!) ? t.prize!.valuePence : 0), 0);
  const otherPrizes = wins.filter((t) => !isCredited(t.prize!)).length;
  const left = n - state.pulled;
  const latest = state.latest;

  const flat = (
    <>
      <div className="rg-smash">
        <SharedDefs />
        <div className="rg-smash-top">
          <span className="rg-smash-laser is-a" aria-hidden="true" />
          <span className="rg-smash-laser is-b" aria-hidden="true" />
          <Title />
        </div>

        <div className="rg-smash-shelf">
          {state.slots.map((slot, i) => {
            const snap = state.snaps.find((s) => s.slot === i);
            return (
              <div className="rg-smash-place" key={i}>
                {slot.serial !== null && (
                  <button
                    key={slot.serial}
                    type="button"
                    className={`rg-smash-jar ${slot.pulled ? "is-smashed" : ""}`}
                    style={{ "--tilt": `${((slot.serial * 37) % 7) - 3}deg` } as CSSProperties}
                    onClick={() => smashSlot(i)}
                    disabled={smashAll || slot.pulled}
                    aria-label="Smash this jar"
                  >
                    <Jar colour={colours[slot.serial]} />
                  </button>
                )}
                {snap && (
                  <div className={`rg-smash-hit ${snap.ticket.prize ? "is-win" : "is-none"}`} aria-hidden="true">
                    {!reducedMotion && (
                      <span className="rg-smash-hammer">
                        <Hammer />
                      </span>
                    )}
                    <span className="rg-smash-flash" />
                    <span className="rg-smash-shards">
                      {Array.from({ length: 12 }, (_, k) => (
                        <i key={k} style={{ "--a": `${k * 30 + (snap.order % 5) * 9}deg`, "--r": `${44 + ((k * 7 + snap.order * 3) % 5) * 9}px`, "--s": `${0.7 + ((k * 3) % 4) * 0.2}` } as CSSProperties} />
                      ))}
                    </span>
                    {snap.ticket.prize && !reducedMotion && (
                      <span className="rg-smash-notes">
                        {Array.from({ length: 6 }, (_, k) => (
                          <i key={k} style={{ "--a": `${-150 + k * 24}deg`, "--r": `${50 + ((k * 13) % 30)}px` } as CSSProperties} />
                        ))}
                      </span>
                    )}
                    <span className="rg-smash-result">
                      {snap.ticket.prize ? (
                        <b className={`rg-smash-prize ${prizeShortLabel(snap.ticket.prize).length > 6 ? "is-long" : ""}`}>{prizeShortLabel(snap.ticket.prize)}</b>
                      ) : (
                        <em>No win</em>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rg-smash-latest" aria-live="polite">
          {!latest ? (
            <span className="rg-smash-latest-empty">Each jar holds a ticket's result</span>
          ) : latest.ticket.prize ? (
            <div className="rg-smash-latest-win">
              <Coin tone="yellow" label={prizeShortLabel(latest.ticket.prize)} />
              <div>
                <strong>{isCredited(latest.ticket.prize) ? `+${formatPence(latest.ticket.prize.valuePence)}` : latest.ticket.prize.name}</strong>
                <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
              </div>
            </div>
          ) : (
            <div className="rg-smash-latest-none">
              <strong>No win</strong>
              <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
            </div>
          )}
        </div>

        <div className="rg-smash-panel">
          <div className="rg-smash-stats">
            <div>
              <strong>{state.pulled.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} smashed
            </div>
            <div className="rg-smash-tray">
              {wins.length === 0 ? (
                <span className="rg-smash-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-3).map((t) => (
                    <Coin key={t.ticketNumber} tone="yellow" label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-smash-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-smash-all" onClick={handleSmashAll} disabled={done || smashAll}>
            SMASH ALL
          </button>
        </div>
      </div>
    </>
  );
  const state3d: SmashState = {
    slots: state.slots,
    snaps: state.snaps,
    colours,
    labelFor: (snap) => (snap.ticket.prize ? prizeShortLabel(snap.ticket.prize) : null),
    smash: (slot) => !smashAll && smashSlot(slot),
    done,
  };

  return (
    <>
      <Scene3D
        state={state3d}
        setup={(ctx) => buildSmashScene(ctx)}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={0.82}
        fallback={flat}
        label="Smash My Cash: glass jars of cash"
      >
      </Scene3D>
      <div className="rg-smash rg3-smash-below">
        <div className="rg-smash-latest" aria-live="polite">
          {!latest ? (
            <span className="rg-smash-latest-empty">Each jar holds a ticket's result</span>
          ) : latest.ticket.prize ? (
            <div className="rg-smash-latest-win">
              <Coin tone="yellow" label={prizeShortLabel(latest.ticket.prize)} />
              <div>
                <strong>{isCredited(latest.ticket.prize) ? `+${formatPence(latest.ticket.prize.valuePence)}` : latest.ticket.prize.name}</strong>
                <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
              </div>
            </div>
          ) : (
            <div className="rg-smash-latest-none">
              <strong>No win</strong>
              <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
            </div>
          )}
        </div>

        <div className="rg-smash-panel">
          <div className="rg-smash-stats">
            <div>
              <strong>{state.pulled.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} smashed
            </div>
            <div className="rg-smash-tray">
              {wins.length === 0 ? (
                <span className="rg-smash-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-3).map((t) => (
                    <Coin key={t.ticketNumber} tone="yellow" label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-smash-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-smash-all" onClick={handleSmashAll} disabled={done || smashAll}>
            SMASH ALL
          </button>
        </div>
      </div>
      {done ? (
        <GamePrompt title="All smashed!" tone="pink" />
      ) : state.pulled === 0 ? (
        <GamePrompt title="Tap a jar to smash it" sub={RESULT_SET_NOTE} />
      ) : (
        <GamePrompt title={`${left.toLocaleString("en-GB")} left to smash`} />
      )}
      <SoundToggle />
    </>
  );
}
