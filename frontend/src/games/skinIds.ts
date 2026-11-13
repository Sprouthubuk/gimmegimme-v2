/**
 * Game skin ids and their admin labels. Plain data, no component imports, so the
 * admin form and the competition pages can use it without loading any game.
 *
 * A skin changes how a reveal game looks and reads (pictures, names, animation,
 * wording, sounds), never how a result is decided: every skin plays the same
 * board generators in ./arcade/games/generators.ts. "classic" is the original
 * look and the default for every competition.
 *
 * These are the only values competitions.game_skin may hold
 * (the CHECK in the latest supabase/sql/*_game_skins.sql file, now
 * 20261112_more_game_skins.sql): keep the two lists in step (a test
 * compares them). To add a seasonal skin: add it here and to that file's CHECK,
 * then add its folder under ./arcade/skins/ and one line in ./arcade/skins/registry.ts.
 */
export const GAME_SKIN_OPTIONS = [
  { id: "classic", label: "Classic" },
  { id: "christmas", label: "Christmas" },
  { id: "pirates", label: "Pirates of the Prizeibbean (Gems)" },
  { id: "cash_escape", label: "The Great Cash Escape (Spin the Wheel)" },
  { id: "hip_hop", label: "Drop It Like It's Hot (Coin Drop)" },
  { id: "smash_cash", label: "Smash My Cash (Balloon Pop)" },
] as const;

export type GameSkinId = (typeof GAME_SKIN_OPTIONS)[number]["id"];

export const DEFAULT_GAME_SKIN: GameSkinId = "classic";

const IDS: ReadonlySet<string> = new Set(GAME_SKIN_OPTIONS.map((o) => o.id));

export const isGameSkinId = (id: unknown): id is GameSkinId => typeof id === "string" && IDS.has(id);

/** Unknown, missing or misspelt values read as the classic skin, so a bad value never blocks a result. */
export const normaliseGameSkin = (id: unknown): GameSkinId => (isGameSkinId(id) ? id : DEFAULT_GAME_SKIN);

/**
 * The reveal games each skin has its own version of. A competition whose game is not
 * listed plays the classic look whatever skin is chosen. "classic" (the original reveal,
 * which the site calls "Scratch Card") plays the scratch card.
 */
export const SKINNED_GAMES: Readonly<Record<GameSkinId, readonly string[]>> = {
  classic: [],
  christmas: ["scratch_card", "classic", "spin_wheel", "bingo_card", "balloon_pop", "gems", "claw_machine", "slots"],
  pirates: ["gems"],
  cash_escape: ["spin_wheel"],
  hip_hop: ["coin_drop"],
  smash_cash: ["balloon_pop"],
};

/** Player-facing game names under a skin. Missing ones keep the classic name. */
const SKIN_GAME_NAMES: Readonly<Record<GameSkinId, Readonly<Record<string, string>>>> = {
  classic: {},
  christmas: {
    scratch_card: "Scrooge's Secret Stash",
    classic: "Scrooge's Secret Stash",
    spin_wheel: "Dasher's Dosh Drop",
    bingo_card: "Jingle Bell Bingo Bonanza",
    balloon_pop: "Chris Cracker's Cash Bang",
    gems: "Liam's Humbug Heist",
    claw_machine: "Demi's Grinchmas Gold",
    slots: "Blankets & Banknotes",
  },
  pirates: { gems: "Pirates of the Prizeibbean" },
  cash_escape: { spin_wheel: "The Great Cash Escape" },
  hip_hop: { coin_drop: "Drop It Like It's Hot" },
  smash_cash: { balloon_pop: "Smash My Cash" },
};

/** The short word on a competition card's game badge under a skin. Missing ones use the game's name. */
const SKIN_GAME_BADGES: Readonly<Record<GameSkinId, Readonly<Record<string, string>>>> = {
  classic: {},
  christmas: {
    scratch_card: "Scratch",
    classic: "Scratch",
    spin_wheel: "Sleigh",
    bingo_card: "Bingo",
    balloon_pop: "Cracker",
    gems: "Heist",
    claw_machine: "Claw",
    slots: "Slots",
  },
  pirates: { gems: "Treasure" },
  cash_escape: { spin_wheel: "Vault" },
  hip_hop: { coin_drop: "Drop" },
  smash_cash: { balloon_pop: "Smash" },
};

/** The skinned name for a game, or null when the skin has no version of it. */
export const skinnedGameName = (game: string | null | undefined, skin: unknown): string | null =>
  (game && SKIN_GAME_NAMES[normaliseGameSkin(skin)][game.toLowerCase()]) || null;

/** The skinned card badge for a game, or null when the skin has no version of it. */
export const skinnedGameBadge = (game: string | null | undefined, skin: unknown): string | null =>
  (game && SKIN_GAME_BADGES[normaliseGameSkin(skin)][game.toLowerCase()]) || null;
