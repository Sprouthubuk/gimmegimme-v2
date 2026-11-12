/**
 * The cracker table's state, kept apart from the drawing so it can be tested
 * (tests/reveal-games). Same rule as Balloon Pop: the Nth cracker pulled always
 * shows the Nth ticket of the purchase, whichever cracker the player taps.
 */
import type { RevealTicket } from "../../contract";
import { createRng, pick } from "../../rng";

/** Crackers on the table at once. */
export const SLOTS = 4;

/** Chris Cracker's colours: red, green and gold. */
export type Colour = "red" | "green" | "gold";
export const COLOURS: Colour[] = ["red", "green", "gold"];

/**
 * Cosmetic only, the same on every replay: the colour of each cracker, from the
 * seed and its place in the queue. A cracker's look never hints at what is inside.
 */
export function crackerColours(count: number, seed: string): Colour[] {
  const rng = createRng(`crackers:${seed}`);
  return Array.from({ length: count }, () => pick(rng, COLOURS));
}

// ---- state ------------------------------------------------------------------

export interface Slot {
  /** Which cracker (0, 1, 2 …) is on the table here, or null while the place is empty. */
  serial: number | null;
  pulled: boolean;
}
export interface Snap {
  /** Pull order: the Nth cracker pulled always shows the Nth ticket. */
  order: number;
  slot: number;
  colour: Colour;
  ticket: RevealTicket;
}
export interface State {
  slots: Slot[];
  /** Crackers put on the table so far. Never more than there are tickets. */
  spawned: number;
  pulled: number;
  snaps: Snap[];
  /** The most recent pull, shown in detail under the table. */
  latest: Snap | null;
}
export type Action = { type: "pull"; slot: number } | { type: "next"; slot: number } | { type: "rest" };

const EMPTY: Slot = { serial: null, pulled: false };

export function makeReducer(tickets: readonly RevealTicket[], colours: readonly Colour[]) {
  const n = tickets.length;
  return (state: State, action: Action): State => {
    switch (action.type) {
      case "pull": {
        const slot = state.slots[action.slot];
        if (slot.serial === null || slot.pulled || state.pulled >= n) return state;
        const snap: Snap = { order: state.pulled, slot: action.slot, colour: colours[slot.serial], ticket: tickets[state.pulled] };
        return {
          ...state,
          pulled: state.pulled + 1,
          slots: state.slots.map((s, i) => (i === action.slot ? { ...s, pulled: true } : s)),
          snaps: [...state.snaps, snap],
          latest: snap,
        };
      }
      case "next": {
        const snaps = state.snaps.filter((s) => s.slot !== action.slot);
        if (state.spawned >= n) return { ...state, snaps, slots: state.slots.map((s, i) => (i === action.slot ? EMPTY : s)) };
        return {
          ...state,
          snaps,
          spawned: state.spawned + 1,
          slots: state.slots.map((s, i) => (i === action.slot ? { serial: state.spawned, pulled: false } : s)),
        };
      }
      case "rest": {
        // Everything not yet pulled is shown at once. The latest result becomes the last ticket.
        const last = n > 0 ? { order: n - 1, slot: -1, colour: colours[n - 1] ?? "red", ticket: tickets[n - 1] } : state.latest;
        return { ...state, pulled: n, spawned: n, slots: state.slots.map(() => EMPTY), snaps: [], latest: state.pulled < n ? last : state.latest };
      }
    }
  };
}

export function initState(n: number): State {
  const first = Math.min(SLOTS, n);
  return { slots: Array.from({ length: first }, (_, i) => ({ serial: i, pulled: false })), spawned: first, pulled: 0, snaps: [], latest: null };
}

