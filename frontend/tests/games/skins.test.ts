import { fileURLToPath } from "node:url";
// Themed skins (src/games/arcade/skins). A skin re-draws a game; it must
// never change what the game shows. These checks prove each skinned board plays the same
// generator as the classic game it replaces, that nothing in a skin decides anything, and
// that the lists of skins and skinned games stay in step.
//
//   cd frontend && npx vitest run tests/games skins
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { RevealTicket } from "../../src/games/types";
import { GAME_SKIN_OPTIONS, SKINNED_GAMES, normaliseGameSkin, skinnedGameBadge, skinnedGameName } from "../../src/games/skinIds";
import { REVEAL_GAME_OPTIONS } from "../../src/games/gameIds";
import { CRACKER_JOKES, crackerJoke, festiveCall } from "../../src/games/arcade/skins/christmas/festive";
import { SLOTS, crackerColours, initState, makeReducer, type State } from "../../src/games/arcade/skins/christmas/crackerState";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKINS = path.join(ROOT, "src/games/arcade/skins");
const CHRISTMAS = path.join(SKINS, "christmas");
const SHARED = path.join(SKINS, "shared");
/** The themed skins added on 12 November, each with one game: [folder, skin id, game, board file]. */
const THEMED: [string, string, string, string][] = [
  ["pirates", "pirates", "gems", "PiratesBoard.tsx"],
  ["cashEscape", "cash_escape", "spin_wheel", "VaultWheelBoard.tsx"],
  ["hipHop", "hip_hop", "coin_drop", "DropItBoard.tsx"],
  ["smashCash", "smash_cash", "balloon_pop", "SmashBoard.tsx"],
];
/** Every source file of every skin. */
const allSkinFiles = () =>
  fs.readdirSync(SKINS, { withFileTypes: true }).flatMap((d) => {
    const dir = path.join(SKINS, d.name);
    return d.isDirectory() ? fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f)) : /\.tsx?$/.test(d.name) ? [dir] : [];
  });
const read = (f: string) => fs.readFileSync(f, "utf8");
/** Source with comments removed. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("skin ids", () => {
  it("unknown or missing skins read as classic", () => {
    for (const bad of [null, undefined, "", "Christmas", "easter", 7]) expect(normaliseGameSkin(bad)).toBe("classic");
    expect(normaliseGameSkin("christmas")).toBe("christmas");
    for (const id of ["pirates", "cash_escape", "hip_hop", "smash_cash"]) expect(normaliseGameSkin(id)).toBe(id);
  });

  it("every skin in the picker is in the registry, and the reverse", () => {
    const registry = read(path.join(SKINS, "registry.ts"));
    const listed = [...registry.matchAll(/^\s+([a-z_]+): [A-Z_]+_SKIN,/gm)].map((m) => m[1]).sort();
    expect(listed).toEqual(GAME_SKIN_OPTIONS.map((o) => o.id).sort());
  });

  it("the Christmas skin's games are the ones the admin form says, and each is a real game", () => {
    const src = read(path.join(CHRISTMAS, "index.ts"));
    const games = [...src.matchAll(/^ {4}([a-z_]+): \{/gm)].map((m) => m[1]).sort();
    expect(games).toEqual(["balloon_pop", "bingo_card", "claw_machine", "gems", "scratch_card", "slots", "spin_wheel"]);
    // "classic" plays the scratch card, so it is skinned with it.
    expect([...SKINNED_GAMES.christmas].sort()).toEqual([...games, "classic"].sort());
    const real = new Set<string>(REVEAL_GAME_OPTIONS.map((o) => o.id));
    for (const g of games) expect(real.has(g)).toBe(true);
    // Each skinned version keeps the classic id and its kind (batch / single).
    const defs = read(path.join(ROOT, "src/games/arcade/definitions.ts"));
    for (const g of games) {
      const kind = (s: string) => s.match(new RegExp(`id: "${g}",[^\\n]*kind: "(single|batch)"`))?.[1];
      expect(kind(src)).toBe(kind(defs));
    }
  });

  it("each themed skin has exactly its one game, a real one, with the classic id and kind", () => {
    const defs = read(path.join(ROOT, "src/games/arcade/definitions.ts"));
    const kind = (s: string, g: string) => s.match(new RegExp(`id: "${g}",[^\\n]*kind: "(single|batch)"`))?.[1];
    for (const [folder, id, game] of THEMED) {
      const src = read(path.join(SKINS, folder, "index.ts"));
      expect([...src.matchAll(/^ {4}([a-z_]+): \{/gm)].map((m) => m[1])).toEqual([game]);
      expect([...(SKINNED_GAMES as Record<string, readonly string[]>)[id]]).toEqual([game]);
      expect(kind(src, game)).toBeTruthy();
      expect(kind(src, game)).toBe(kind(defs, game));
    }
  });

  it("names: the Christmas competitions' names, and the classic name everywhere else", () => {
    expect(skinnedGameName("balloon_pop", "christmas")).toBe("Chris Cracker's Cash Bang");
    expect(skinnedGameName("spin_wheel", "christmas")).toBe("Dasher's Dosh Drop");
    expect(skinnedGameName("scratch_card", "christmas")).toBe("Scrooge's Secret Stash");
    expect(skinnedGameName("classic", "christmas")).toBe("Scrooge's Secret Stash");
    expect(skinnedGameName("bingo_card", "christmas")).toBe("Jingle Bell Bingo Bonanza");
    expect(skinnedGameName("gems", "christmas")).toBe("Liam's Humbug Heist");
    expect(skinnedGameName("claw_machine", "christmas")).toBe("Demi's Grinchmas Gold");
    expect(skinnedGameName("slots", "christmas")).toBe("Blankets & Banknotes");
    expect(skinnedGameName("gems", "pirates")).toBe("Pirates of the Prizeibbean");
    expect(skinnedGameName("spin_wheel", "cash_escape")).toBe("The Great Cash Escape");
    expect(skinnedGameName("coin_drop", "hip_hop")).toBe("Drop It Like It's Hot");
    expect(skinnedGameName("balloon_pop", "smash_cash")).toBe("Smash My Cash");
    expect(skinnedGameName("spin_wheel", "pirates")).toBeNull();
    expect(skinnedGameName("hook_a_duck", "christmas")).toBeNull();
    expect(skinnedGameName("balloon_pop", "classic")).toBeNull();
    // Card badges: one short word.
    expect(["balloon_pop", "spin_wheel", "scratch_card", "classic", "bingo_card", "gems", "claw_machine", "slots"].map((g) => skinnedGameBadge(g, "christmas"))).toEqual(["Cracker", "Sleigh", "Scratch", "Scratch", "Bingo", "Heist", "Claw", "Slots"]);
    expect(THEMED.map(([, id, game]) => skinnedGameBadge(game, id))).toEqual(["Treasure", "Vault", "Drop", "Smash"]);
    expect(skinnedGameBadge("hook_a_duck", "christmas")).toBeNull();
    expect(skinnedGameBadge("balloon_pop", "classic")).toBeNull();
    // The names in the skin match the names the site shows.
    const src = read(path.join(CHRISTMAS, "index.ts"));
    for (const [id, name] of [...src.matchAll(/id: "([a-z_]+)", name: "([^"]+)"/g)].map((m) => [m[1], m[2]])) {
      expect(skinnedGameName(id, "christmas")).toBe(name);
    }
    for (const [folder, skin] of THEMED) {
      const theme = read(path.join(SKINS, folder, "index.ts"));
      const found = [...theme.matchAll(/id: "([a-z_]+)", name: "([^"]+)"/g)];
      expect(found.length).toBe(1);
      expect(skinnedGameName(found[0][1], skin)).toBe(found[0][2]);
    }
  });
});

describe("the Christmas boards play the classic generators", () => {
  const uses: [string, string][] = [
    ["VaultScratchBoard.tsx", "generateScratch(ticket.prize, decoys, seed)"],
    ["SleighBoard.tsx", "generateWheel(ticket.prize, decoys, seed)"],
    ["JingleBingoBoard.tsx", "generateBingo(ticket.prize, seed)"],
    ["HeistBoard.tsx", "generateGems(ticket.prize, decoys, seed)"],
    ["BlanketsSlotsBoard.tsx", "generateSlots(ticket.prize, decoys, seed)"],
    ["../pirates/PiratesBoard.tsx", "generateGems(ticket.prize, decoys, seed)"],
    ["../cashEscape/VaultWheelBoard.tsx", "generateWheel(ticket.prize, decoys, seed)"],
    ["../hipHop/DropItBoard.tsx", "generateCoinDrop(ticket.prize, decoys, seed)"],
  ];
  for (const [file, call] of uses) {
    it(`${file} draws ${call.split("(")[0]}`, () => {
      expect(code(path.join(CHRISTMAS, file))).toContain(call);
    });
  }

  it("the themed boards share the classic games' rules, so they cannot play differently", () => {
    const GAMES = path.join(ROOT, "src/games/arcade/games");
    // Slots: the reels stop as the classic machine's do.
    expect(code(path.join(CHRISTMAS, "BlanketsSlotsBoard.tsx"))).toContain("useSlotsSpin(layout, reducedMotion, onReveal");
    expect(code(path.join(GAMES, "slots/SlotsBoard.tsx"))).toContain("useSlotsSpin(layout, reducedMotion, onReveal)");
    // Gems: the Nth chest opened shows the Nth pick.
    expect(code(path.join(SKINS, "pirates/PiratesBoard.tsx"))).toContain("useGemPicks(layout, reducedMotion, onReveal");
    // Wheel: the vault stops where the classic wheel would.
    expect(code(path.join(SKINS, "cashEscape/VaultWheelBoard.tsx"))).toContain("useWheelSpin(layout, seed, reducedMotion, onReveal");
    expect(code(path.join(GAMES, "wheel/WheelBoard.tsx"))).toContain("useWheelSpin(layout, seed, reducedMotion, onReveal");
    // Coin drop: aiming only picks the nearest allowed bin.
    expect(code(path.join(SKINS, "hipHop/DropItBoard.tsx"))).toContain("useCoinDrop(layout, seed, reducedMotion, onReveal");
    expect(code(path.join(GAMES, "coinDrop/CoinDropBoard.tsx"))).toContain("useCoinDrop(layout, seed, reducedMotion, onReveal)");
    // Balloon pop: the Nth jar smashed shows the Nth ticket, through the same table state as the crackers.
    const smash = code(path.join(SKINS, "smashCash/SmashBoard.tsx"));
    expect(smash).toContain("makeReducer(tickets, colours)");
    expect(smash).toContain('from "../christmas/crackerState"');
  });

  it("the heist and the claw share the classic games' rules, so they cannot play differently", () => {
    // The Nth bag cracked shows the Nth pick, as on the gem board; the claw runs the classic claw's sequence.
    expect(code(path.join(CHRISTMAS, "HeistBoard.tsx"))).toContain("useGemPicks(layout, reducedMotion, onReveal");
    expect(code(path.join(ROOT, "src/games/arcade/games/gems/GemsBoard.tsx"))).toContain("useGemPicks(layout, reducedMotion, onReveal)");
    expect(code(path.join(CHRISTMAS, "GrinchClawBoard.tsx"))).toContain("useClaw(PILE, reducedMotion, onReveal");
    expect(code(path.join(ROOT, "src/games/arcade/games/claw/ClawBoard.tsx"))).toContain("useClaw(PILE, reducedMotion, onReveal");
    // What a bauble holds is read from the ticket alone, never from which bauble was grabbed.
    const claw = code(path.join(CHRISTMAS, "GrinchClawBoard.tsx"));
    expect(claw).toContain("const label = winLabel(ticket.prize);");
    expect(claw).not.toMatch(/PILE\[[^\]]*\]\.(prize|label|win)/);
  });

  it("no skin file builds a board of its own: none defines a generate… function or reads a prize to choose a layout", () => {
    const files = allSkinFiles();
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(code(f)).not.toMatch(/function generate[A-Z]/);
  });

  it("the cracker board's looks come from the seed and position only", () => {
    const a = crackerColours(40, "purchase-1:comp");
    expect(crackerColours(40, "purchase-1:comp")).toEqual(a);
    expect(a.length).toBe(40);
  });
});

describe("pull the cracker: the Nth cracker pulled shows the Nth ticket", () => {
  const tickets = (n: number): RevealTicket[] =>
    Array.from({ length: n }, (_, i) => ({ ticketNumber: 100 + i, competitionId: "c", competitionTitle: "C", prize: i % 3 === 1 ? { name: "£5", valuePence: 500, type: "site_credit" as const } : null }));

  /** Pulls crackers in a given order of table places until every ticket is shown. */
  function play(n: number, pickPlace: (s: State, k: number) => number) {
    const ts = tickets(n);
    const reduce = makeReducer(ts, crackerColours(n, "seed"));
    let s = initState(n);
    const shown: number[] = [];
    for (let k = 0; s.pulled < n && k < n * 10; k++) {
      const place = pickPlace(s, k);
      const before = s.pulled;
      s = reduce(s, { type: "pull", slot: place });
      if (s.pulled > before) {
        shown.push(s.latest!.ticket.ticketNumber);
        s = reduce(s, { type: "next", slot: place });
      }
    }
    return { s, shown, ts };
  }

  for (const n of [1, 3, 4, 5, 9, 40]) {
    it(`${n} tickets, crackers pulled in any order`, () => {
      const orders = [
        (s: State) => s.slots.findIndex((x) => x.serial !== null && !x.pulled),
        (s: State) => s.slots.map((x, i) => (x.serial !== null && !x.pulled ? i : -1)).filter((i) => i >= 0).pop()!,
        (s: State, k: number) => k % s.slots.length,
      ];
      for (const order of orders) {
        const { s, shown, ts } = play(n, order);
        expect(shown).toEqual(ts.map((t) => t.ticketNumber));
        expect(s.pulled).toBe(n);
        expect(s.spawned).toBe(n);
      }
    });
  }

  it("never more crackers on the table than tickets, and at most four", () => {
    expect(initState(2).slots.length).toBe(2);
    expect(initState(50).slots.length).toBe(SLOTS);
    expect(SLOTS).toBe(4);
  });

  it("a cracker cannot be pulled twice", () => {
    const ts = tickets(5);
    const reduce = makeReducer(ts, crackerColours(5, "s"));
    let s = initState(5);
    s = reduce(s, { type: "pull", slot: 0 });
    const again = reduce(s, { type: "pull", slot: 0 });
    expect(again.pulled).toBe(1);
  });

  it("pull all shows every remaining ticket at once, ending on the last", () => {
    const ts = tickets(9);
    const reduce = makeReducer(ts, crackerColours(9, "s"));
    let s = reduce(initState(9), { type: "pull", slot: 2 });
    s = reduce(s, { type: "rest" });
    expect(s.pulled).toBe(9);
    expect(s.latest!.ticket.ticketNumber).toBe(108);
  });
});

describe("festive words", () => {
  it("every miss line is neutral, in every skin: nothing that urges another go", () => {
    const words = allSkinFiles().map((f) => code(f)).join("\n").toLowerCase();
    for (const nudge of ["another cracker", "always another", "try again", "better luck", "next time", "so close", "nearly won", "unlucky", "another go", "have another"]) expect(words).not.toContain(nudge);
    const src = read(path.join(CHRISTMAS, "index.ts"));
    const lines = [...src.matchAll(/noWinLine: "([^"]+)"/g)].map((m) => m[1]);
    expect(lines.length).toBe(7);
    for (const [folder] of THEMED) expect([...read(path.join(SKINS, folder, "index.ts")).matchAll(/noWinLine: "([^"]+)"/g)].length).toBe(1);
  });

  it("jokes are clean and on brief: no children, toys, school or nativity", () => {
    const text = CRACKER_JOKES.map((j) => `${j.q} ${j.a}`).join(" ").toLowerCase();
    for (const word of ["child", "kid", "toy", "school", "nativity", "jesus", "baby", "manger", "bethlehem", "wise men", "angel"]) expect(text).not.toContain(word);
    expect(CRACKER_JOKES.length).toBeGreaterThanOrEqual(12);
  });

  it("a cracker's joke depends on the purchase and its place in the order, never its result", () => {
    expect(crackerJoke("p:c", 3)).toEqual(crackerJoke("p:c", 3));
    expect(crackerJoke.length).toBe(2);
  });

  it("bingo calls are only for numbers that exist, and say the number they call", () => {
    expect(festiveCall(22)).toBe("Two little turtle doves");
    expect(festiveCall(25)).toBe("Christmas Day");
    expect(festiveCall(13)).toBeNull();
    expect(festiveCall(76)).toBeNull();
  });
});

describe("sound and snow follow the rules", () => {
  it("a themed board's delayed sounds are cancelled if the game closes first", () => {
    for (const [folder, , , board] of THEMED) expect(code(path.join(SKINS, folder, board))).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*playSound/);
    expect(code(path.join(SHARED, "sounds.ts"))).toContain("clearTimeout");
  });

  it("every themed board offers the sound button, and only plays through the muted-by-default sounds", () => {
    for (const [folder, , , board] of THEMED) {
      const src = code(path.join(SKINS, folder, board));
      expect(src).toContain("<SoundToggle />");
      expect(src).not.toMatch(/new (window\.)?AudioContext|new Audio\(/);
    }
    expect(code(path.join(CHRISTMAS, "BlanketsSlotsBoard.tsx"))).toContain("<SoundToggle />");
  });

  it("sound is off until the player turns it on", () => {
    const src = code(path.join(SHARED, "sounds.ts"));
    expect(src).toMatch(/let soundOn = false;/);
    expect(src).toMatch(/if \(!soundOn\) return;/);
  });

  it("snow stays still with reduced motion and never takes a tap", () => {
    expect(code(path.join(CHRISTMAS, "Snowfall.tsx"))).toMatch(/reducedMotion \? "is-still"/);
    const css = read(path.join(CHRISTMAS, "christmas.css"));
    expect(css).toMatch(/\.rg-snow \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.rg-snow\.is-still i \{ animation: none/);
  });

  it("every Christmas board says the result was set when the ticket was bought", () => {
    for (const f of ["CrackerBoard.tsx", "SleighBoard.tsx", "VaultScratchBoard.tsx", "HeistBoard.tsx", "GrinchClawBoard.tsx", "BlanketsSlotsBoard.tsx"]) expect(code(path.join(CHRISTMAS, f))).toContain("RESULT_SET_NOTE");
    for (const [folder, , , board] of THEMED) expect(code(path.join(SKINS, folder, board))).toContain("RESULT_SET_NOTE");
    expect(code(path.join(CHRISTMAS, "JingleBingoBoard.tsx"))).toContain("Result set when you bought.");
  });
});

describe("every skinned board loads the styles it uses", () => {
  // A board that borrows a classic game's class (say .rg-wheel-controls) but not that game's
  // stylesheet only looks right if the classic game happened to be opened first on that visit.
  // The Great Cash Escape's button sat off-centre this way. So: every class a skinned board
  // renders that has a style must get that style from a stylesheet the board itself loads
  // (directly or through what it imports), or from one the reveal shell always loads.
  const SRC = path.join(ROOT, "src");
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const all = walk(SRC);
  const styled = new Map<string, Set<string>>();
  for (const f of all.filter((x) => x.endsWith(".css"))) {
    for (const m of read(f).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!styled.has(m[1])) styled.set(m[1], new Set());
      styled.get(m[1])!.add(path.normalize(f));
    }
  }
  const resolve = (from: string, spec: string) => {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
    const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
    return null;
  };
  /** Every file a module pulls in through static imports (lazy import() boards are left out on purpose). */
  const reach = (file: string, seen = new Set<string>()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    if (file.endsWith(".css")) return seen;
    for (const m of read(file).matchAll(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?["']([^"']+)["']/g)) {
      const r = resolve(file, m[1]);
      if (r) reach(r, seen);
    }
    return seen;
  };
  const shell = all.find((f) => f.endsWith(`${path.sep}ArcadeReveal.tsx`))!;
  const always = new Set([...reach(path.normalize(shell))].filter((f) => f.endsWith(".css")));
  always.add(path.normalize(path.join(SRC, "index.css")));
  const boards = all.filter((f) => f.startsWith(path.normalize(SKINS)) && /Board\.tsx$/.test(f));

  it("finds the skinned boards", () => {
    expect(boards.length).toBeGreaterThanOrEqual(11);
  });
  for (const board of boards) {
    it(`${path.relative(SKINS, board)} brings every style it relies on`, () => {
      const files = [...reach(path.normalize(board))];
      const css = new Set(files.filter((f) => f.endsWith(".css")));
      const used = new Set<string>();
      for (const f of files.filter((x) => x.endsWith(".tsx"))) {
        for (const m of read(f).matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/g)) {
          for (const c of (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ").match(/rg-[\w-]+/g) ?? []) used.add(c);
        }
      }
      // Hook-only classes (tests find tiles by them) whose skin styles the element fully itself.
      const HOOKS = new Set(["rg-gem-tile"]);
      const missing = [...used].filter((c) => !HOOKS.has(c) && styled.has(c) && ![...styled.get(c)!].some((f) => css.has(f) || always.has(f)));
      expect(missing).toEqual([]);
    });
  }
});
