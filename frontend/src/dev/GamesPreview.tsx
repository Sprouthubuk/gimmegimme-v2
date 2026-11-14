import { useState } from "react";
import GameIsland from "../islands/GameIsland";
import type { GameTicket } from "../../packages/games";

/** Development only (/games-preview): play every premium game with mock results, no purchase. */
export const MOCK_TICKETS: GameTicket[] = [
  { ticketNumber: 1041, result: "lose" },
  { ticketNumber: 1042, result: "win", prize: { label: "£1 Site Credit", value: 1, tier: "small" }, proofUrl: "/verify/VTY-DEMO01" },
  { ticketNumber: 1043, result: "lose" },
  { ticketNumber: 1044, result: "lose" },
  { ticketNumber: 1045, result: "win", prize: { label: "£10 Site Credit", value: 10, tier: "small" }, proofUrl: "/verify/VTY-DEMO01" },
  { ticketNumber: 1046, result: "lose" },
  { ticketNumber: 1047, result: "lose" },
  { ticketNumber: 1048, result: "win", prize: { label: "£5 Site Credit", value: 5, tier: "small" }, proofUrl: "/verify/VTY-DEMO01" },
  { ticketNumber: 1049, result: "lose" },
  { ticketNumber: 1050, result: "win", prize: { label: "£500 Cash", value: 500, tier: "big" }, proofUrl: "/verify/VTY-DEMO01" },
];

/** The mock competition's prize list (largest first), as the server sends it in the play context. */
export const MOCK_PRIZES = ["£500 Cash", "£10 Site Credit", "£5 Site Credit", "£1 Site Credit"];

const GAMES = ["scratch_card", "balloon_pop", "gems", "spin_wheel", "slots", "claw_machine"];

export default function GamesPreview() {
  const [game, setGame] = useState(GAMES[0]);
  const [theme, setTheme] = useState("default");
  const [reduced, setReduced] = useState(false);
  const [run, setRun] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#000" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, alignItems: "center", font: "800 14px Nunito, sans-serif", color: "#fff", borderBottom: "1px solid #333" }}>
        <select data-testid="pv-game" value={game} onChange={(e) => setGame(e.target.value)} style={sel}>{GAMES.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select data-testid="pv-theme" value={theme} onChange={(e) => setTheme(e.target.value)} style={sel}><option value="default">Default</option><option value="christmas">Christmas</option></select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 44 }}><input data-testid="pv-reduced" type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Reduced motion</label>
        <button data-testid="pv-restart" type="button" onClick={() => setRun((r) => r + 1)} style={{ ...sel, background: "#FFF23A", color: "#000" }}>Restart</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GameIsland key={`${game}-${theme}-${reduced}-${run}`} game={game} theme={theme} reducedMotion={reduced} tickets={MOCK_TICKETS} prizeLabels={MOCK_PRIZES} competitionTitle={theme === "christmas" ? "Scrooge's Secret Stash" : "The Great Cash Escape"} links={{ back: "/games-preview", playAgain: "/games-preview", wallet: "/games-preview" }} height="100%" />
      </div>
    </div>
  );
}

const sel = { minHeight: 44, fontSize: 16, padding: "0 10px", borderRadius: 8, border: "1px solid #555", background: "#111", color: "#fff" } as const;
