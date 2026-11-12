import { fileURLToPath } from "node:url";
// Static checks on the arcade reveal games (docs/drafts/spec-next-builds.md §2):
// a game is a way of showing a decided result, so no file under arcade/ may
// talk to the server or use unseeded randomness.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REVEAL_GAME_OPTIONS } from "../../src/games/gameIds";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARCADE = path.join(ROOT, "src/games/arcade");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const files = walk(ARCADE);
/** Source with comments removed, so a rule can be described in a comment without tripping it. */
const code = (file: string) => fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("arcade games are presentation only", () => {
  it("found the game files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  const banned: [string, RegExp][] = [
    ["the Supabase client", /supabase/i],
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["Math.random", /Math\.random/],
    ["crypto random values", /getRandomValues|randomUUID/],
    ["Date-based seeds", /Date\.now\s*\(|new Date\s*\(/],
  ];
  for (const [name, pattern] of banned) {
    it(`no file uses ${name}`, () => {
      const hits = files.filter((f) => pattern.test(code(f))).map((f) => path.relative(ROOT, f));
      expect(hits).toEqual([]);
    });
  }
});

describe("game ids stay in step", () => {
  const ids = REVEAL_GAME_OPTIONS.map((o) => o.id).sort();

  it("every arcade game in definitions.ts is in the picker list, and the reverse", () => {
    const src = fs.readFileSync(path.join(ARCADE, "definitions.ts"), "utf8");
    const defined = [...src.matchAll(/\bid: "([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(defined).toEqual(ids.filter((id) => id !== "classic"));
  });

  it("the shared list the backend validates against has exactly the same ids", () => {
    const shared = JSON.parse(fs.readFileSync(path.join(ROOT, "../shared/game-ids.json"), "utf8"));
    expect([...shared.games].sort()).toEqual(ids);
  });
});
