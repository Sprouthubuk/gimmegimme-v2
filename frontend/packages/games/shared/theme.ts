/**
 * Theme tokens. Every colour, label and background a game shows comes from here, so a competition can be
 * re-skinned (e.g. premium Christmas) without code changes. Gold is for wins and money only.
 */

export interface Theme {
  id: string;
  title: string;
  /** Page background and the scene's base colour. */
  background: string;
  /** Optional background image (replaces the procedural scene backdrop). */
  backgroundImage?: string;
  /** The two brand neons: rims, glows, accents. */
  neonA: string;
  neonB: string;
  /** Wins and money only. */
  gold: string;
  goldDeep: string;
  /** Glass panels. */
  panel: string;
  panelRim: string;
  text: string;
  muted: string;
  /** The scene. */
  bokeh: string[];
  gridColor: string;
  gridAlpha: number;
  spotlight: string;
  /** The card. */
  cardTop: string;
  cardBottom: string;
  cardRim: string;
  /** Scratch foil: base metal colour and its highlight. */
  foil: string;
  foilHighlight: string;
  /** Confetti colours for a win. */
  confetti: string[];
  /** Falling snow or similar in the scene (0 = none). */
  snow: number;
  fonts: { display: string; ui: string };
  labels: {
    loading: string;
    scratchHint: string;
    noWin: string;
    youWon: string;
    revealAll: string;
    skip: string;
    continue: string;
    verified: string;
    playAgain: string;
    viewWallet: string;
    totalWon: string;
    summaryTitle: string;
    ticket: string;
    soundOn: string;
    soundOff: string;
    back: string;
  };
}

const LABELS: Theme["labels"] = {
  loading: "Getting your cards ready",
  scratchHint: "Scratch to reveal",
  noWin: "No win this time",
  youWon: "You won",
  revealAll: "Reveal All",
  skip: "Skip",
  continue: "Continue",
  verified: "Verified fair",
  playAgain: "Play Again",
  viewWallet: "View Wallet",
  totalWon: "Total won",
  summaryTitle: "Your Results",
  ticket: "Ticket",
  soundOn: "Sound on",
  soundOff: "Sound off",
  back: "Back",
};

export const THEMES: Record<string, Theme> = {
  default: {
    id: "default",
    title: "Scratch Card",
    background: "#07070B",
    neonA: "#FF2DAA",
    neonB: "#22E6FF",
    gold: "#F5C542",
    goldDeep: "#B8861B",
    panel: "rgba(18,14,26,.62)",
    panelRim: "rgba(255,45,170,.55)",
    text: "#FFFFFF",
    muted: "#9C93AD",
    bokeh: ["#FF2DAA", "#22E6FF", "#7B5CFF"],
    gridColor: "#22E6FF",
    gridAlpha: 0.1,
    spotlight: "#C9B8FF",
    cardTop: "#1A1324",
    cardBottom: "#0B0910",
    cardRim: "#FF2DAA",
    foil: "#A9ADB8",
    foilHighlight: "#F4F6FA",
    confetti: ["#F5C542", "#FFE08A", "#FF2DAA", "#22E6FF", "#FFFFFF"],
    snow: 0,
    fonts: { display: "'Lilita One', 'Arial Black', sans-serif", ui: "Nunito, system-ui, sans-serif" },
    labels: LABELS,
  },
  christmas: {
    id: "christmas",
    title: "Christmas Scratch Card",
    background: "#0C0508",
    neonA: "#E8344E",
    neonB: "#F2D49B",
    gold: "#F5C542",
    goldDeep: "#A8761A",
    panel: "rgba(34,10,16,.66)",
    panelRim: "rgba(242,212,155,.5)",
    text: "#FFF8EE",
    muted: "#BFA6A0",
    bokeh: ["#F5C542", "#E8344E", "#FFB46B"],
    gridColor: "#F2D49B",
    gridAlpha: 0.06,
    spotlight: "#FFD9A0",
    cardTop: "#3A0E18",
    cardBottom: "#14050A",
    cardRim: "#F2D49B",
    foil: "#B79A5B",
    foilHighlight: "#FFF1C9",
    confetti: ["#F5C542", "#FFE08A", "#E8344E", "#FFFFFF", "#2F8F5B"],
    snow: 40,
    fonts: { display: "'Lilita One', 'Arial Black', sans-serif", ui: "Nunito, system-ui, sans-serif" },
    labels: { ...LABELS, scratchHint: "Scratch the gold to reveal", summaryTitle: "Your Festive Results" },
  },
};

export function resolveTheme(theme?: string | Partial<Theme>): Theme {
  if (!theme) return THEMES.default;
  if (typeof theme === "string") return THEMES[theme] ?? THEMES.default;
  const base = THEMES[theme.id ?? "default"] ?? THEMES.default;
  return { ...base, ...theme, labels: { ...base.labels, ...(theme.labels ?? {}) }, fonts: { ...base.fonts, ...(theme.fonts ?? {}) } };
}

/** "#RRGGBB" to 0xRRGGBB for Pixi. */
export const hex = (c: string): number => parseInt(c.replace("#", "").slice(0, 6), 16);
