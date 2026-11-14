import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, resolveTheme } from "../../packages/games/shared/theme";
import { PREMIUM_GAMES } from "../../packages/games";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/games");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const code = files(ROOT).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => ({ f: path.relative(ROOT, f), src: readFileSync(f, "utf8") }));

describe("the games only present results", () => {
  it("no game file talks to the network (results arrive from the page, already decided)", () => {
    for (const { f, src } of code) expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  });

  it("nothing assigns a ticket's result or prize", () => {
    for (const { f, src } of code) expect(src, f).not.toMatch(/\.(result|prize)\s*=[^=]/);
  });

  it("randomness is never used where results are handled", () => {
    for (const f of ["shell/state.ts", "shared/adapter.ts", "shared/types.ts"]) {
      expect(code.find((c) => c.f === f)!.src, f).not.toMatch(/Math\.random|crypto\.getRandomValues/);
    }
  });

  it("text from the server or a config is never written as HTML", () => {
    for (const { f, src } of code) {
      for (const m of src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) expect(m[1], `${f}: ${m[1]}`).toBe("ICONS[k]");
    }
  });

  it("no unseeded third-party scripts, no eval", () => {
    for (const { f, src } of code) expect(src, f).not.toMatch(/\beval\s*\(|new Function\s*\(|<script|https?:\/\/(?!gsap\.com)/);
  });

  it("every registered game has a folder with an index", () => {
    for (const id of Object.keys(PREMIUM_GAMES)) expect(code.some((c) => c.f === `${id.replace(/_/g, "-")}/index.ts`), id).toBe(true);
  });
});

describe("themes", () => {
  it("every theme has every token and label as the default does", () => {
    const keys = Object.keys(THEMES.default).sort();
    const labels = Object.keys(THEMES.default.labels).sort();
    for (const [id, t] of Object.entries(THEMES)) {
      expect(Object.keys(t).filter((k) => k !== "backgroundImage").sort(), id).toEqual(keys.filter((k) => k !== "backgroundImage"));
      expect(Object.keys(t.labels).sort(), id).toEqual(labels);
      for (const c of [t.background, t.neonA, t.neonB, t.gold, t.cardTop, t.cardBottom, t.cardRim, t.foil, t.foilHighlight]) expect(c, id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("an unknown theme falls back to the default; a partial theme keeps the rest", () => {
    expect(resolveTheme("nope").id).toBe("default");
    const t = resolveTheme({ id: "christmas", title: "Elf's Envelope", labels: { noWin: "Not this time" } as never });
    expect([t.title, t.labels.noWin, t.labels.continue, t.gold]).toEqual(["Elf's Envelope", "Not this time", "Continue", THEMES.christmas.gold]);
  });

  it("gold is used for wins and money only (the same gold in every theme)", () => {
    for (const t of Object.values(THEMES)) expect(t.gold.toUpperCase()).toBe("#F5C542");
  });
});
