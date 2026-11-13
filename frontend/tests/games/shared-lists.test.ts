// shared/game-ids.json is what the backend validates against and builds its database check from.
// It must say exactly what src/games/gameIds.ts and skinIds.ts say.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REVEAL_GAME_OPTIONS } from "../../src/games/gameIds";
import { GAME_SKIN_OPTIONS, SKINNED_GAMES } from "../../src/games/skinIds";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shared = JSON.parse(fs.readFileSync(path.join(ROOT, "../shared/game-ids.json"), "utf8"));

describe("shared/game-ids.json matches the games", () => {
  it("lists the same reveal games", () => {
    expect([...shared.games].sort()).toEqual(REVEAL_GAME_OPTIONS.map((o) => o.id).sort());
  });
  it("lists the same skins, with the same admin labels, in the same order", () => {
    expect(shared.skins).toEqual(GAME_SKIN_OPTIONS.map((o) => o.id));
    expect(shared.skinLabels).toEqual(Object.fromEntries(GAME_SKIN_OPTIONS.map((o) => [o.id, o.label])));
  });
  it("says which games each skin covers, as skinIds.ts does", () => {
    expect(shared.skinnedGames).toEqual(Object.fromEntries(Object.entries(SKINNED_GAMES).map(([k, v]) => [k, [...v]])));
  });
});
