/**
 * Reveal game ids and their public labels. Plain data, no component imports,
 * so cards and the admin form can use it without loading any game.
 *
 * These are the only values competitions.reveal_game may hold
 * (supabase/sql/20261010_reveal_game_ids.sql). "classic" is the original
 * reveal; every other id is an arcade game in ./arcade/definitions.ts.
 */
export const REVEAL_GAME_OPTIONS = [
  { id: "classic", label: "Classic reveal" },
  { id: "scratch_card", label: "Scratch Card" },
  { id: "spin_wheel", label: "Spin the Wheel" },
  { id: "bingo_card", label: "Bingo Card" },
  { id: "balloon_pop", label: "Balloon Pop" },
  { id: "hook_a_duck", label: "Hook a Duck" },
  { id: "claw_machine", label: "Claw Machine" },
  { id: "coin_drop", label: "Coin Drop" },
  { id: "slots", label: "Slots" },
  { id: "gems", label: "Gems" },
] as const;

export type RevealGameOptionId = (typeof REVEAL_GAME_OPTIONS)[number]["id"];

const ARCADE_IDS: ReadonlySet<string> = new Set(REVEAL_GAME_OPTIONS.map((o) => o.id).filter((id) => id !== "classic"));

/** True for every game except "classic" (and anything unrecognised). */
export const isArcadeGameId = (id: string | null | undefined): boolean => !!id && ARCADE_IDS.has(id);

const LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(REVEAL_GAME_OPTIONS.map((o) => [o.id, o.label])),
  // Shown to players. The classic reveal has always been labelled "Scratch Card" on cards.
  classic: "Scratch Card",
};

/** Player-facing name for a competition's game. Unknown ids read as the classic one. */
export const revealGameLabel = (id?: string | null): string => (id && LABELS[id.toLowerCase()]) || LABELS.classic;
