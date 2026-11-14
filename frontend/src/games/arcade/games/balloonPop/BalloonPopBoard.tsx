import { useEffect, useId, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { RevealTicket } from "../../contract";
import type { BatchBoardProps } from "../types";
import { balloonLooks, type BalloonColour, type BalloonLook } from "../generators";
import { formatPence, formatTicketNumber, isCredited, prizeShortLabel } from "../../money";
import { Coin } from "../../shell/Coin";
import { GamePrompt, RESULT_SET_NOTE } from "../../shell/GamePrompt";
import { Scene3D } from "../../three/Scene3D";
import { buildBalloonScene, type BalloonState } from "../../three/balloonScene";
import "./balloonPop.css";

/** Where each balloon in the air floats, as % across the sky. Nine lanes, none sharing a column. */
const COLUMNS = [10, 30, 50, 70, 90, 20, 40, 60, 80];
const LANES = COLUMNS.length;
/** How long the dart takes to reach the balloon. */
const DART_MS = 130;
const RESPAWN_MS = 520;

const FILL: Record<BalloonColour, [string, string, string]> = {
  pink: ["#ffb3da", "#ff2d95", "#c70070"],
  cyan: ["#c4f1ff", "#1fc4f4", "#0a8fc2"],
  yellow: ["#fffbc2", "#ffd60a", "#e0a800"],
};

function Balloon({ colour }: { colour: BalloonColour }) {
  const id = useId();
  const [light, main, dark] = FILL[colour];
  return (
    <svg viewBox="0 0 60 96" className="rg-balloon-svg" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="34%" cy="28%" r="78%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.45" stopColor={main} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <path className="rg-balloon-string" d="M30 64 q-7 9 1 16 q7 6 -1 14" fill="none" stroke="#141414" strokeWidth="2" strokeLinecap="round" />
      <path d="M24.5 62 h11 l-5.5 -8 z" fill={dark} stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M30 3 C13 3 6 17 6 30 C6 46 20 57 30 57 C40 57 54 46 54 30 C54 17 47 3 30 3 Z" fill={`url(#${id})`} stroke="#141414" strokeWidth="3.5" />
      <ellipse cx="20" cy="19" rx="5.5" ry="9" fill="#fff" opacity="0.75" transform="rotate(-26 20 19)" />
      <circle cx="16" cy="33" r="2.2" fill="#fff" opacity="0.6" />
    </svg>
  );
}

function Dart() {
  return (
    <svg viewBox="0 0 16 44" className="rg-dart-svg" aria-hidden="true">
      <path d="M8 0 L10.5 12 H5.5 Z" fill="#d9dbe2" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="5.5" y="12" width="5" height="16" rx="2" fill="#ffe11a" stroke="#141414" strokeWidth="1.5" />
      <path d="M8 26 L1 40 L8 35 L15 40 Z" fill="#ff2d95" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ---- state ------------------------------------------------------------------

interface Lane {
  /** Which balloon (0, 1, 2 …) is floating in this lane, or null while it is empty. */
  serial: number | null;
  /** A dart is on its way. */
  hit: boolean;
}
interface PopFx {
  /** Pop order: the Nth pop always shows the Nth ticket. */
  order: number;
  lane: number;
  x: number;
  y: number;
  colour: BalloonColour;
  ticket: RevealTicket;
  /** Where the dart comes from, relative to the balloon, and the angle it flies at. */
  dart: { dx: number; dy: number; angle: number } | null;
}
interface State {
  lanes: Lane[];
  /** Balloons released so far. Never more than there are tickets. */
  spawned: number;
  popped: number;
  fx: PopFx[];
}
type Action =
  | { type: "hit"; lane: number; x: number; y: number; dart: PopFx["dart"] }
  | { type: "burst"; lane: number }
  | { type: "respawn"; lane: number }
  | { type: "rest" };

const EMPTY: Lane = { serial: null, hit: false };

function makeReducer(tickets: readonly RevealTicket[], looks: readonly BalloonLook[]) {
  const n = tickets.length;
  return (state: State, action: Action): State => {
    switch (action.type) {
      case "hit": {
        const lane = state.lanes[action.lane];
        if (lane.serial === null || lane.hit || state.popped >= n) return state;
        const order = state.popped;
        const fx: PopFx = { order, lane: action.lane, x: action.x, y: action.y, colour: looks[lane.serial].colour, ticket: tickets[order], dart: action.dart };
        return {
          ...state,
          popped: order + 1,
          lanes: state.lanes.map((l, i) => (i === action.lane ? { ...l, hit: true } : l)),
          fx: [...state.fx, fx],
        };
      }
      case "burst":
        return { ...state, lanes: state.lanes.map((l, i) => (i === action.lane && l.hit ? EMPTY : l)) };
      case "respawn": {
        const fx = state.fx.filter((f) => f.lane !== action.lane);
        if (state.lanes[action.lane].serial !== null || state.spawned >= n) return { ...state, fx };
        return {
          ...state,
          fx,
          spawned: state.spawned + 1,
          lanes: state.lanes.map((l, i) => (i === action.lane ? { serial: state.spawned, hit: false } : l)),
        };
      }
      case "rest":
        return { ...state, popped: n, spawned: n, lanes: state.lanes.map(() => EMPTY) };
    }
  };
}

function initState(n: number): State {
  const first = Math.min(LANES, n);
  return { lanes: Array.from({ length: LANES }, (_, i) => (i < first ? { serial: i, hit: false } : EMPTY)), spawned: first, popped: 0, fx: [] };
}

/**
 * A fairground balloon stall: one balloon per ticket, floating up the sky.
 * Tap one to throw a dart at it. Which balloon the player bursts is cosmetic:
 * the Nth balloon popped always shows the Nth ticket of the purchase, and a
 * balloon's colour, size and speed are seeded and unrelated to what it holds.
 */
export function BalloonPopBoard({ tickets, seed, reducedMotion, onProgress, onReveal }: BatchBoardProps) {
  const n = tickets.length;
  const looks = useMemo(() => balloonLooks(n, seed), [n, seed]);
  const reducer = useMemo(() => makeReducer(tickets, looks), [tickets, looks]);
  const [state, dispatch] = useReducer(reducer, n, initState);
  const [popAll, setPopAll] = useState(false);
  const done = state.popped === n;

  const skyRef = useRef<HTMLDivElement>(null);
  const balloonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Lanes with a pop in progress, set at once so a double tap can't pop one balloon twice. */
  const busy = useRef(new Set<number>());
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const popLane = (lane: number) => {
    const el = balloonRefs.current[lane];
    const sky = skyRef.current;
    if (!el || !sky || busy.current.has(lane)) return;
    busy.current.add(lane);
    const b = el.getBoundingClientRect();
    const s = sky.getBoundingClientRect();
    // Aim at the middle of the balloon itself, above the string.
    const px = b.left + b.width / 2 - s.left;
    const py = b.top + b.height * 0.32 - s.top;
    const dx = s.width / 2 - px;
    const dy = s.height + 30 - py;
    const flight = reducedMotion ? 0 : DART_MS;
    dispatch({
      type: "hit",
      lane,
      x: (px / s.width) * 100,
      y: (py / s.height) * 100,
      dart: reducedMotion ? null : { dx, dy, angle: (Math.atan2(-dy, -dx) * 180) / Math.PI + 90 },
    });
    if (!reducedMotion) navigator.vibrate?.(10);
    later(() => dispatch({ type: "burst", lane }), flight);
    later(() => {
      busy.current.delete(lane);
      dispatch({ type: "respawn", lane });
    }, flight + (reducedMotion ? 800 : RESPAWN_MS));
  };

  /** The same pop for the 3D board, which has no DOM balloon to measure. */
  const popLane3D = (lane: number) => {
    if (busy.current.has(lane) || popAll) return;
    busy.current.add(lane);
    const flight = reducedMotion ? 0 : DART_MS;
    dispatch({ type: "hit", lane, x: 50, y: 50, dart: null });
    if (!reducedMotion) navigator.vibrate?.(10);
    later(() => dispatch({ type: "burst", lane }), flight);
    later(() => {
      busy.current.delete(lane);
      dispatch({ type: "respawn", lane });
    }, flight + (reducedMotion ? 800 : RESPAWN_MS + 500));
  };

  const handlePopAll = () => {
    if (popAll || done) return;
    setPopAll(true);
    if (reducedMotion) {
      dispatch({ type: "rest" });
      return;
    }
    // Burst what's in the air one after another, then show the rest at once.
    const inAir = state.lanes.map((l, i) => (l.serial !== null && !l.hit ? i : -1)).filter((i) => i >= 0);
    inAir.forEach((lane, k) => later(() => (skyRef.current ? popLane(lane) : popLane3D(lane)), k * 70));
    later(() => dispatch({ type: "rest" }), inAir.length * 70 + DART_MS + 250);
  };

  useEffect(() => onProgress(state.popped), [state.popped, onProgress]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onReveal, reducedMotion ? 400 : 1200);
    return () => clearTimeout(t);
  }, [done, onReveal, reducedMotion]);

  const shown = tickets.slice(0, state.popped);
  const wins = shown.filter((t) => t.prize);
  const wonPence = wins.reduce((s, t) => s + (isCredited(t.prize!) ? t.prize!.valuePence : 0), 0);
  const otherPrizes = wins.filter((t) => !isCredited(t.prize!)).length;
  const left = n - state.popped;

  const flat = (
    <>
      <div className="rg-balloon-machine">
        <div className="rg-balloon-top">
          <div className="rg-marquee" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
          <div className="rg-balloon-title">BALLOON POP</div>
        </div>

        <div className="rg-balloon-sky" ref={skyRef}>
          <span className="rg-balloon-cloud is-1" aria-hidden="true" />
          <span className="rg-balloon-cloud is-2" aria-hidden="true" />
          <svg className="rg-balloon-bunting" viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 4 Q200 22 400 4" fill="none" stroke="#141414" strokeWidth="2.5" />
            {Array.from({ length: 10 }, (_, i) => {
              const x = 20 + i * 40;
              const y = 4 + 16 * (1 - Math.pow((x - 200) / 200, 2)) * 0.98;
              return <path key={i} d={`M${x - 13} ${y - 1} L${x + 13} ${y - 1} L${x} ${y + 17} Z`} fill={["#ff2d95", "#ffe11a", "#1fc4f4"][i % 3]} stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />;
            })}
          </svg>

          {state.lanes.map((lane, i) => {
            if (lane.serial === null) return null;
            const look = looks[lane.serial];
            // The first balloons start evenly spread up the sky (golden-ratio spacing, so neighbours
            // are never level); later ones rise from the bottom.
            const delay = lane.serial < LANES ? -look.duration * ((i * 0.618 + 0.08) % 1) : 0;
            return (
              <button
                key={lane.serial}
                ref={(el) => {
                  balloonRefs.current[i] = el;
                }}
                type="button"
                className={`rg-balloon is-${look.size} ${lane.hit ? "is-hit" : ""}`}
                style={
                  {
                    "--x": `${COLUMNS[i]}%`,
                    "--rest-y": i < 5 ? "34%" : "72%",
                    "--dur": `${look.duration}s`,
                    "--delay": `${delay}s`,
                    "--sway": `${look.sway}px`,
                  } as CSSProperties
                }
                onClick={() => popLane(i)}
                disabled={popAll}
                aria-label="Pop this balloon"
              >
                <span className="rg-balloon-sway">
                  <Balloon colour={look.colour} />
                </span>
              </button>
            );
          })}

          {state.fx.map((f) => (
            <div
              key={f.order}
              className={`rg-pop ${f.ticket.prize ? "is-win" : "is-none"}`}
              style={{ left: `${f.x}%`, top: `${f.y}%`, "--wait": f.dart ? `${DART_MS}ms` : "0ms" } as CSSProperties}
            >
              {f.dart && (
                <span className="rg-dart" style={{ "--dx": `${f.dart.dx}px`, "--dy": `${f.dart.dy}px`, "--angle": `${f.dart.angle}deg` } as CSSProperties}>
                  <Dart />
                </span>
              )}
              <span className="rg-pop-ring" aria-hidden="true" />
              <span className="rg-pop-shreds" aria-hidden="true">
                {Array.from({ length: 9 }, (_, k) => (
                  <i key={k} style={{ "--a": `${k * 40 + (f.order % 4) * 9}deg`, "--r": `${34 + ((k * 7 + f.order * 3) % 5) * 5}px`, background: FILL[f.colour][1] } as CSSProperties} />
                ))}
              </span>
              <span className="rg-pop-result">
                {f.ticket.prize ? (
                  <>
                    <Coin label={prizeShortLabel(f.ticket.prize)} />
                    <b>{isCredited(f.ticket.prize) ? `+${formatPence(f.ticket.prize.valuePence)}` : "Prize!"}</b>
                  </>
                ) : (
                  <em>No prize</em>
                )}
                <small>{formatTicketNumber(f.ticket.ticketNumber)}</small>
              </span>
            </div>
          ))}
        </div>

        <div className="rg-balloon-panel">
          <div className="rg-balloon-stats" aria-live="polite">
            <div>
              <strong>{state.popped.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} popped
            </div>
            <div className="rg-balloon-tray">
              {wins.length === 0 ? (
                <span className="rg-balloon-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-4).map((t) => (
                    <Coin key={t.ticketNumber} label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-balloon-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-balloon-all" onClick={handlePopAll} disabled={done || popAll}>
            POP ALL
          </button>
        </div>
      </div>
    </>
  );
  const state3d: BalloonState = {
    lanes: state.lanes,
    looks,
    results: state.fx.map((f) => ({ lane: f.lane, order: f.order, label: f.ticket.prize ? prizeShortLabel(f.ticket.prize) : null })),
    pop: popLane3D,
    laneCount: LANES,
  };

  return (
    <>
      <Scene3D
        state={state3d}
        setup={(ctx) => buildBalloonScene(ctx)}
        seed={seed}
        reducedMotion={reducedMotion}
        aspect={1.1}
        fallback={flat}
        label="Balloon pop"
      />
      <div className="rg-balloon-machine rg3-below">
        <div className="rg-balloon-panel">
          <div className="rg-balloon-stats" aria-live="polite">
            <div>
              <strong>{state.popped.toLocaleString("en-GB")}</strong> of {n.toLocaleString("en-GB")} popped
            </div>
            <div className="rg-balloon-tray">
              {wins.length === 0 ? (
                <span className="rg-balloon-tray-empty">Prizes you find land here</span>
              ) : (
                <>
                  {wins.slice(-4).map((t) => (
                    <Coin key={t.ticketNumber} label={prizeShortLabel(t.prize!)} />
                  ))}
                  <span className="rg-balloon-total">
                    {[wonPence > 0 ? formatPence(wonPence) : null, otherPrizes > 0 ? `${otherPrizes} prize${otherPrizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" + ")}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="rg-balloon-all" onClick={handlePopAll} disabled={done || popAll}>
            POP ALL
          </button>
        </div>
      </div>
      {done ? (
        <GamePrompt title="All popped!" tone="pink" />
      ) : state.popped === 0 ? (
        <GamePrompt title="Tap a balloon to pop it" sub={RESULT_SET_NOTE} />
      ) : (
        <GamePrompt title={`${left.toLocaleString("en-GB")} left to pop`} />
      )}
    </>
  );
}
