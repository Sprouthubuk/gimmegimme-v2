import { fileURLToPath } from "node:url";
// Seasonal skins (src/games/arcade/skins). A skin re-draws a game; it must
// never change what the game shows. These checks prove each Christmas board plays the same
// generator as the classic game it replaces, that nothing in a skin decides anything, and
// that the lists of skins and skinned games stay in step.
//
//   cd tests/reveal-games && bun test skins
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
const read = (f: string) => fs.readFileSync(f, "utf8");
/** Source with comments removed. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("skin ids", () => {
  it("unknown or missing skins read as classic", () => {
    for (const bad of [null, undefined, "", "Christmas", "easter", 7]) expect(normaliseGameSkin(bad)).toBe("classic");
    expect(normaliseGameSkin("christmas")).toBe("christmas");
  });

  it("every skin in the picker is in the registry, and the reverse", () => {
    const registry = read(path.join(SKINS, "registry.ts"));
    const listed = [...registry.matchAll(/^\s+([a-z_]+): [A-Z_]+_SKIN,/gm)].map((m) => m[1]).sort();
    expect(listed).toEqual(GAME_SKIN_OPTIONS.map((o) => o.id).sort());
  });

  it("the Christmas skin's games are the ones the admin form says, and each is a real game", () => {
    const src = read(path.join(CHRISTMAS, "index.ts"));
    const games = [...src.matchAll(/^ {4}([a-z_]+): \{/gm)].map((m) => m[1]).sort();
    expect(games).toEqual(["balloon_pop", "bingo_card", "scratch_card", "spin_wheel"]);
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

  it("names: the Christmas competitions' names, and the classic name everywhere else", () => {
    expect(skinnedGameName("balloon_pop", "christmas")).toBe("Chris Cracker's Cash Bang");
    expect(skinnedGameName("spin_wheel", "christmas")).toBe("Dasher's Dosh Drop");
    expect(skinnedGameName("scratch_card", "christmas")).toBe("Scrooge's Secret Stash");
    expect(skinnedGameName("classic", "christmas")).toBe("Scrooge's Secret Stash");
    expect(skinnedGameName("bingo_card", "christmas")).toBe("Jingle Bell Bingo Bonanza");
    expect(skinnedGameName("hook_a_duck", "christmas")).toBeNull();
    expect(skinnedGameName("balloon_pop", "classic")).toBeNull();
    // Card badges: one short word.
    expect(["balloon_pop", "spin_wheel", "scratch_card", "classic", "bingo_card"].map((g) => skinnedGameBadge(g, "christmas"))).toEqual(["Cracker", "Sleigh", "Scratch", "Scratch", "Bingo"]);
    expect(skinnedGameBadge("hook_a_duck", "christmas")).toBeNull();
    expect(skinnedGameBadge("balloon_pop", "classic")).toBeNull();
    // The names in the skin match the names the site shows.
    const src = read(path.join(CHRISTMAS, "index.ts"));
    for (const [id, name] of [...src.matchAll(/id: "([a-z_]+)", name: "([^"]+)"/g)].map((m) => [m[1], m[2]])) {
      expect(skinnedGameName(id, "christmas")).toBe(name);
    }
  });
});

describe("the Christmas boards play the classic generators", () => {
  const uses: [string, string][] = [
    ["VaultScratchBoard.tsx", "generateScratch(ticket.prize, decoys, seed)"],
    ["SleighBoard.tsx", "generateWheel(ticket.prize, decoys, seed)"],
    ["JingleBingoBoard.tsx", "generateBingo(ticket.prize, seed)"],
  ];
  for (const [file, call] of uses) {
    it(`${file} draws ${call.split("(")[0]}`, () => {
      expect(code(path.join(CHRISTMAS, file))).toContain(call);
    });
  }

  it("no skin file builds a board of its own: none defines a generate… function or reads a prize to choose a layout", () => {
    const files = fs.readdirSync(CHRISTMAS).filter((f) => /\.tsx?$/.test(f));
    for (const f of files) expect(code(path.join(CHRISTMAS, f))).not.toMatch(/function generate[A-Z]/);
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
  it("every miss line is neutral: nothing that urges another go", () => {
    const words = fs.readdirSync(CHRISTMAS).filter((f) => /\.tsx?$/.test(f)).map((f) => code(path.join(CHRISTMAS, f))).join("\n").toLowerCase();
    for (const nudge of ["another cracker", "always another", "try again", "better luck", "next time", "so close", "nearly won", "unlucky"]) expect(words).not.toContain(nudge);
    const src = read(path.join(CHRISTMAS, "index.ts"));
    const lines = [...src.matchAll(/noWinLine: "([^"]+)"/g)].map((m) => m[1]);
    expect(lines.length).toBe(4);
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
  it("sound is off until the player turns it on", () => {
    const src = code(path.join(CHRISTMAS, "sounds.ts"));
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
    for (const f of ["CrackerBoard.tsx", "SleighBoard.tsx", "VaultScratchBoard.tsx"]) expect(code(path.join(CHRISTMAS, f))).toContain("RESULT_SET_NOTE");
    expect(code(path.join(CHRISTMAS, "JingleBingoBoard.tsx"))).toContain("Result set when you bought.");
  });
});
