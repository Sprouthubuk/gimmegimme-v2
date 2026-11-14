import { useEffect, useId, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { BatchBoardProps } from "../../games/types";
import { formatPence, formatTicketNumber, isCredited, prizeShortLabel } from "../../money";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { crackerJoke } from "./festive";
import { crackerColours, initState, makeReducer, type Colour } from "./crackerState";
import { playSound } from "../shared/sounds";
import { SoundToggle } from "../shared/SoundToggle";
import "./cracker.css";
import { Scene3D } from "../../three/Scene3D";
import { buildCrackerScene, type CrackerState3D } from "./cracker3d";

/** Wobble, then the snap. */
const SNAP_MS = 380;
const NEXT_MS = 1300;

const FILL: Record<Colour, [string, string, string]> = {
  red: ["#ff8a96", "#e0283a", "#a3121f"],
  green: ["#8ae9b1", "#1fae5b", "#0b7339"],
  gold: ["#fff1a8", "#ffd23f", "#d99a00"],
};
const BAND: Record<Colour, string> = { red: "#ffd23f", green: "#ffd23f", gold: "#e0283a" };

/** One half of a cracker: frilled end, twisted neck, half the tube. The other half is this, mirrored. */
function Half({ colour, gradient }: { colour: Colour; gradient: string }) {
  const [, main, dark] = FILL[colour];
  return (
    <>
      <path d="M8 10 L14 18 L8 26 L14 34 L8 42 L14 50 L8 58 L14 66 L8 72 C30 66 52 56 72 48 L72 32 C52 24 30 14 8 10 Z" fill={main} stroke="#141414" strokeWidth="4" strokeLinejoin="round" />
      <path d="M20 22 C36 26 52 31 66 36" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.5" fill="none" />
      <rect x="68" y="30" width="16" height="20" rx="4" fill={dark} stroke="#141414" strokeWidth="4" />
      <path d="M82 16 H150 L146 24 L150 32 L146 40 L150 48 L146 56 L150 64 H82 Z" fill={`url(#${gradient})`} stroke="#141414" strokeWidth="4" strokeLinejoin="round" />
      <rect x="92" y="16" width="10" height="48" fill={BAND[colour]} stroke="#141414" strokeWidth="3" />
      <path d="M108 22 L122 22 L112 58 L98 58 Z" fill="#fff" opacity="0.22" />
      <path d="M128 22 L140 22 L132 58 L120 58 Z" fill="#fff" opacity="0.22" />
    </>
  );
}

function Cracker({ colour }: { colour: Colour }) {
  const id = useId();
  const [light, main, dark] = FILL[colour];
  return (
    <svg viewBox="0 0 300 80" className="rg-cracker-svg" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.45" stopColor={main} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <g className="rg-cracker-left">
        <Half colour={colour} gradient={id} />
      </g>
      <g className="rg-cracker-right">
        <g transform="translate(300 0) scale(-1 1)">
          <Half colour={colour} gradient={id} />
        </g>
      </g>
      {/* The ribbon over the join. It goes when the cracker snaps. */}
      <g className="rg-cracker-ribbon">
        <rect x="140" y="14" width="20" height="52" rx="3" fill={BAND[colour]} stroke="#141414" strokeWidth="4" />
        <ellipse cx="96" cy="26" rx="5" ry="3" fill="#fff" opacity="0.8" />
      </g>
    </svg>
  );
}

/** A paper crown with the prize written on it. */
function Crown({ label }: { label: string }) {
  return (
    <span className="rg-crown">
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <path d="M6 60 L6 18 L26 36 L42 8 L60 32 L78 8 L94 36 L114 18 L114 60 Z" fill="#ffd23f" stroke="#141414" strokeWidth="4" strokeLinejoin="round" />
        <path d="M10 52 H110" stroke="#e0283a" strokeWidth="5" />
      </svg>
      <b className={label.length > 6 ? "is-long" : ""}>{label}</b>
    </span>
  );
}

/**
 * Christmas skin of Balloon Pop, Chris Cracker's Cash Bang: a market stall of crackers, one per ticket. Tap one to
 * pull it. Which cracker the player pulls is cosmetic: the Nth one pulled always
 * shows the Nth ticket of the purchase, exactly as Balloon Pop does.
 */
export function CrackerBoard({ tickets, seed, reducedMotion, onProgress, onReveal }: BatchBoardProps) {
  const n = tickets.length;
  const colours = useMemo(() => crackerColours(n, seed), [n, seed]);
  const reducer = useMemo(() => makeReducer(tickets, colours), [tickets, colours]);
  const [state, dispatch] = useReducer(reducer, n, initState);
  const [pullAll, setPullAll] = useState(false);
  const done = state.pulled === n;

  /** Places with a pull in progress, set at once so a double tap can't pull one cracker twice. */
  const busy = useRef(new Set<number>());
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const pullSlot = (slot: number) => {
    if (busy.current.has(slot) || state.slots[slot]?.serial == null || state.slots[slot].pulled) return;
    busy.current.add(slot);
    dispatch({ type: "pull", slot });
    if (!reducedMotion) navigator.vibrate?.(10);
    later(() => playSound("bang"), reducedMotion ? 0 : SNAP_MS);
    later(() => {
      busy.current.delete(slot);
      dispatch({ type: "next", slot });
    }, reducedMotion ? 700 : NEXT_MS);
  };

  const handlePullAll = () => {
    if (pullAll || done) return;
    setPullAll(true);
    if (reducedMotion) {
      dispatch({ type: "rest" });
      return;
    }
    // Snap what's on the table one after another, then show the rest at once.
    const onTable = state.slots.map((s, i) => (s.serial !== null && !s.pulled ? i : -1)).filter((i) => i >= 0);
    onTable.forEach((slot, k) => later(() => pullSlot(slot), k * 110));
    later(() => dispatch({ type: "rest" }), onTable.length * 110 + SNAP_MS + 500);
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
  const joke = latest && !latest.ticket.prize ? crackerJoke(seed, latest.order) : null;

  const flat = (
    <>
      <div className="rg-cracker-box">
        <div className="rg-cracker-top">
          <div className="rg-xmas-lights" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
          <div className="rg-xmas-title">CHRIS CRACKER'S CASH BANG</div>
        </div>

        <div className="rg-cracker-table">
          {state.slots.map((slot, i) => {
            const snap = state.snaps.find((s) => s.slot === i);
            return (
              <div className="rg-cracker-place" key={i}>
                {slot.serial !== null && (
                  <button
                    key={slot.serial}
                    type="button"
                    className={`rg-cracker ${slot.pulled ? "is-pulled" : ""}`}
                    style={{ "--tilt": `${((slot.serial * 37) % 7) - 3}deg` } as CSSProperties}
                    onClick={() => pullSlot(i)}
                    disabled={pullAll || slot.pulled}
                    aria-label="Pull this cracker"
                  >
                    <Cracker colour={colours[slot.serial]} />
                  </button>
                )}
                {snap && (
                  <div className={`rg-cracker-snap ${snap.ticket.prize ? "is-win" : "is-none"}`} aria-hidden="true">
                    <span className="rg-cracker-bang">
                      <svg viewBox="0 0 120 70">
                        <path d="M60 2 L70 20 L92 6 L88 28 L116 26 L96 40 L114 58 L88 54 L82 68 L66 54 L50 68 L42 52 L14 60 L28 42 L4 30 L32 26 L26 6 L50 18 Z" fill="#ffe11a" stroke="#141414" strokeWidth="4" strokeLinejoin="round" />
                      </svg>
                      <b>BANG!</b>
                    </span>
                    <span className="rg-cracker-bits">
                      {Array.from({ length: 10 }, (_, k) => (
                        <i key={k} style={{ "--a": `${k * 36 + (snap.order % 5) * 7}deg`, "--r": `${46 + ((k * 7 + snap.order * 3) % 5) * 8}px`, background: ["#e0283a", "#1fae5b", "#ffd23f", "#ffffff", "#ffd23f"][k % 5] } as CSSProperties} />
                      ))}
                    </span>
                    <span className="rg-cracker-result">
                      {snap.ticket.prize ? <Crown label={prizeShortLabel(snap.ticket.prize)} /> : <em>No win</em>}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rg-cracker-latest" aria-live="polite">
          {!latest ? (
            <span className="rg-cracker-latest-empty">Each cracker holds a ticket's result</span>
          ) : latest.ticket.prize ? (
            <div className="rg-cracker-latest-win">
              <Coin tone="yellow" label={prizeShortLabel(latest.ticket.prize)} />
              <div>
                <strong>{isCredited(latest.ticket.prize) ? `+${formatPence(latest.ticket.prize.valuePence)}` : latest.ticket.prize.name}</strong>
                <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
              </div>
            </div>
          ) : (
            <div className="rg-cracker-latest-joke">
              <small>
                No win this time · Ticket {formatTicketNumber(latest.ticket.ticketNumber)}
              </small>
              <p>{joke!.q}</p>
              <p className="rg-cracker-answer">{joke!.a}</p>
            </div>
          )}
        </div>

        <div className="rg-cracker-panel">
          <div className="rg-cracker-stats">
            <div>
              <strong>{state.pulled.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} pulled
            </div>
            <div className="rg-cracker-tray">
              {wins.length === 0 ? (
                <span className="rg-cracker-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-3).map((t) => (
                    <Coin key={t.ticketNumber} tone="yellow" label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-cracker-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-cracker-all" onClick={handlePullAll} disabled={done || pullAll}>
            PULL ALL
          </button>
        </div>
      </div>
      {done ? (
        <GamePrompt title="All pulled!" tone="pink" />
      ) : state.pulled === 0 ? (
        <GamePrompt title="Tap a cracker to pull it" sub={RESULT_SET_NOTE} />
      ) : (
        <GamePrompt title={`${left.toLocaleString("en-GB")} left to pull`} />
      )}
      <SoundToggle />
    </>
  );

  const state3d: CrackerState3D = {
    slots: state.slots,
    snaps: state.snaps,
    colours,
    labelFor: (snap) => (snap.ticket.prize ? prizeShortLabel(snap.ticket.prize) : null),
    pull: (slot) => !pullAll && pullSlot(slot),
    done,
  };

  return (
    <>
      <Scene3D
        state={state3d}
        setup={(ctx) => buildCrackerScene(ctx)}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={1.0}
        fallback={flat}
        label="Chris Cracker's Cash Bang: crackers on a market stall"
      />
      <div className="rg-cracker-box rg3-cracker-below">
        <div className="rg-cracker-latest" aria-live="polite">
          {!latest ? (
            <span className="rg-cracker-latest-empty">Each cracker holds a ticket's result</span>
          ) : latest.ticket.prize ? (
            <div className="rg-cracker-latest-win">
              <Coin tone="yellow" label={prizeShortLabel(latest.ticket.prize)} />
              <div>
                <strong>{isCredited(latest.ticket.prize) ? `+${formatPence(latest.ticket.prize.valuePence)}` : latest.ticket.prize.name}</strong>
                <small>Ticket {formatTicketNumber(latest.ticket.ticketNumber)}</small>
              </div>
            </div>
          ) : (
            <div className="rg-cracker-latest-joke">
              <small>
                No win this time · Ticket {formatTicketNumber(latest.ticket.ticketNumber)}
              </small>
              <p>{joke!.q}</p>
              <p className="rg-cracker-answer">{joke!.a}</p>
            </div>
          )}
        </div>

        <div className="rg-cracker-panel">
          <div className="rg-cracker-stats">
            <div>
              <strong>{state.pulled.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} pulled
            </div>
            <div className="rg-cracker-tray">
              {wins.length === 0 ? (
                <span className="rg-cracker-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-3).map((t) => (
                    <Coin key={t.ticketNumber} tone="yellow" label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-cracker-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-cracker-all" onClick={handlePullAll} disabled={done || pullAll}>
            PULL ALL
          </button>
        </div>
      </div>
      {done ? (
        <GamePrompt title="All pulled!" tone="pink" />
      ) : state.pulled === 0 ? (
        <GamePrompt title="Tap a cracker to pull it" sub={RESULT_SET_NOTE} />
      ) : (
        <GamePrompt title={`${left.toLocaleString("en-GB")} left to pull`} />
      )}
      <SoundToggle />
    </>
  );
}
