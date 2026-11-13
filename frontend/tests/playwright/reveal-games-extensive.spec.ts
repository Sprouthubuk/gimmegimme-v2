import { expect, test, type Page } from "@playwright/test";

/**
 * Pre-launch sweep of every reveal game (classic look and Christmas skin) through every
 * sample purchase on the development preview page, /dev/reveal-games. Sample tickets only:
 * nothing is bought and the database is never touched.
 *
 * For every game, skin and purchase it plays each screen to the end and checks:
 *  - each ticket's result screen shows exactly what that ticket was given;
 *  - the closing summary's total, list of wins and wallet balance are right;
 *  - nothing errors in the console, nothing scrolls sideways, the buttons are on screen.
 * Then awkward play (closing early, double taps, reset, sound on), the "Try the demo"
 * button on the real competition pages (read only), and smoothness on a slowed-down phone.
 *
 * The board generators themselves are proven across thousands of seeds in tests/reveal-games.
 */

const CLASSIC_GAMES = ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "hook_a_duck", "claw_machine", "coin_drop", "slots", "gems"];
const CHRISTMAS_GAMES = ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "gems", "claw_machine", "slots"];
/** The games each skin draws its own way. */
const SKIN_GAMES: Record<string, string[]> = {
  classic: CLASSIC_GAMES,
  christmas: CHRISTMAS_GAMES,
  pirates: ["gems"],
  cash_escape: ["spin_wheel"],
  hip_hop: ["coin_drop"],
  smash_cash: ["balloon_pop"],
};
/** The looks with their own sounds: every skin but classic. */
const THEMED = ["pirates", "cash_escape", "hip_hop", "smash_cash"];
const BATCH = new Set(["balloon_pop"]);
const FIRST_TICKET = 3104;

const c = (p: string) => `${p} credit`;
/** What each sample purchase holds, ticket by ticket (headline shown on a win, or null), and what it adds up to. */
const SAMPLES: Record<string, { tickets: (string | null)[]; total: string | null; wins: number; wallet: string | null }> = {
  win: { tickets: [c("£10")], total: "£10", wins: 1, wallet: "£22.50" },
  lose: { tickets: [null], total: null, wins: 0, wallet: "£12.50" },
  mixed: { tickets: [c("£10"), null, null, null, c("£50"), null], total: "£60", wins: 2, wallet: "£72.50" },
  "all-lose": { tickets: [null, null, null, null], total: null, wins: 0, wallet: "£12.50" },
  types: { tickets: ["£50 cash", "AirPods Pro", c("£6.66"), null], total: "£285.66", wins: 3, wallet: "£69.16" },
  "one-tier": { tickets: [null, c("£5"), null], total: "£5", wins: 1, wallet: "£17.50" },
  "end-prize": { tickets: [null, c("£10")], total: "£10", wins: 1, wallet: "£22.50" },
  "no-end-prize": { tickets: [null, c("£10")], total: "£10", wins: 1, wallet: null },
  many: { tickets: Array.from({ length: 40 }, (_, i) => (i === 3 || i === 33 ? c("£0.50") : i === 17 ? c("£5") : i === 26 ? c("£1") : null)), total: "£7", wins: 4, wallet: "£19.50" },
  huge: { tickets: Array.from({ length: 250 }, (_, i) => (i % 41 === 7 ? c("£1") : null)), total: "£6", wins: 6, wallet: "£18.50" },
};

/** Fails the test on any console error or uncaught exception (the blocked phone buzz excepted). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/vibrate|Download the React DevTools/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function open(page: Page, game: string, skin: string, sample: string, motion: "reduced" | "full" = "reduced") {
  await page.goto("/dev/reveal-games");
  await page.getByTestId("skin").selectOption(skin);
  await page.getByTestId("motion").selectOption(motion);
  await page.getByTestId("present").selectOption("auto");
  await page.getByTestId("game").selectOption(game);
  await page.getByTestId("sample").selectOption(sample);
  await expect(page.locator(".rg-reveal")).toBeVisible();
}

/** Plays whatever board is on screen until its result appears. */
async function playBoard(page: Page, game: string) {
  const sheetOrSummary = page.locator(".rg-sheet, .rg-summary");
  const press = async (sel: string) => {
    const el = page.locator(sel).first();
    await expect(el).toBeVisible({ timeout: 10_000 });
    await el.click();
  };
  switch (game) {
    case "scratch_card":
      await press(".rg-scratch-actions .rg-btn-cyan, .rg-scratch-actions .rg-btn-xmas-gold");
      break;
    case "spin_wheel":
      await press(".rg-wheel-controls .rg-btn:not([disabled]), .rg-ce-controls .rg-btn:not([disabled]), .rg-sleigh-controls .rg-btn:not([disabled])");
      break;
    case "bingo_card":
      await press(".rg-bingo-controls .rg-btn");
      break;
    case "balloon_pop":
      await press(".rg-balloon-all, .rg-cracker-all, .rg-smash-all");
      break;
    case "hook_a_duck":
      await press(".rg-duck:not([disabled])");
      break;
    case "claw_machine":
      await press(".rg-grab");
      break;
    case "coin_drop":
      await press(".rg-coin-board");
      break;
    case "slots":
      await press(".rg-board .rg-btn-yellow, .rg-lever");
      break;
    case "gems":
      for (let k = 0; k < 9 && !(await sheetOrSummary.isVisible()); k++) {
        const tile = page.locator(".rg-gem-tile:not([disabled])").first();
        if (await tile.count()) await tile.click();
        await page.waitForTimeout(250);
      }
      break;
  }
  await expect(sheetOrSummary).toBeVisible({ timeout: 25_000 });
}

/** Nothing scrolls sideways, and the sheet's main button is on screen. */
async function checkLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const btn = page.locator(".rg-sheet .rg-btn-primary, .rg-summary .rg-btn-primary").first();
  if (await btn.count()) {
    // Let the sheet finish sliding up before measuring it.
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".rg-sheet, .rg-summary")].every((el) => el.getAnimations().every((a) => a.playState !== "running")),
    );
    // A long results list scrolls: the button must be reachable, then fully on screen.
    await btn.scrollIntoViewIfNeeded();
    const box = (await btn.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  }
}

/** Plays a whole purchase, checking each result screen against its ticket, and returns at the last screen. */
async function playPurchase(page: Page, game: string, sample: string) {
  const s = SAMPLES[sample];
  const single = s.tickets.length === 1;
  for (let step = 0; step < 400; step++) {
    if (await page.locator(".rg-summary").isVisible()) return;
    const sheet = page.locator(".rg-sheet");
    if (!(await sheet.isVisible())) {
      await playBoard(page, game);
      if (await page.locator(".rg-summary").isVisible()) return;
    }
    await checkLayout(page);
    if (BATCH.has(game)) {
      // One screen for all of this competition's tickets.
      if (s.wins === 0) await expect(sheet.locator(".rg-no-win")).toBeVisible();
      else await expect(sheet.locator(".rg-prize-big")).toHaveText(s.wins === 1 ? s.tickets.find(Boolean)! : s.total!);
    } else {
      const n = Number((await page.locator(".rg-ticket-chip").textContent())!.replace(/\D/g, ""));
      const expected = s.tickets[n - FIRST_TICKET];
      if (expected) {
        await expect(sheet.locator(".rg-prize-big")).toHaveText(expected);
        await expect(sheet.locator(".rg-no-win")).toHaveCount(0);
      } else {
        await expect(sheet.locator(".rg-no-win")).toBeVisible();
        await expect(sheet.locator(".rg-prize-big")).toHaveCount(0);
        await expect(sheet).toContainText(`#${n}`);
      }
    }
    if (single) return;
    // Long purchases: check the first few screens, then reveal the rest at once, as a player can.
    const revealAll = sheet.getByRole("button", { name: /^Reveal all \d+ left$/ });
    if (step >= 3 && (await revealAll.count())) await revealAll.click();
    else await sheet.locator(".rg-btn-primary").click();
  }
  throw new Error("purchase never finished");
}

async function checkFinal(page: Page, sample: string) {
  const s = SAMPLES[sample];
  if (s.tickets.length === 1) {
    const sheet = page.locator(".rg-sheet");
    if (s.total) await expect(sheet.locator(".rg-prize-big")).toHaveText(s.tickets[0]!);
    else await expect(sheet.locator(".rg-no-win")).toBeVisible();
  } else {
    const summary = page.locator(".rg-summary");
    await expect(summary).toBeVisible();
    if (s.total) {
      await expect(summary.locator(".rg-prize-big")).toHaveText(s.total);
      await expect(summary.locator(".rg-summary-list li")).toHaveCount(s.wins);
    } else {
      await expect(summary.locator(".rg-no-win")).toBeVisible();
      await expect(summary.locator(".rg-summary-list li")).toHaveCount(0);
    }
    if (sample === "types") await expect(summary).toContainText("We'll be in touch to arrange delivery");
  }
  const pill = page.locator(".rg-wallet-amount");
  if (s.wallet) await expect(pill).toHaveText(s.wallet);
  else await expect(pill).toHaveCount(0);
  await checkLayout(page);
}

// ---------------------------------------------------------------------------------------------
// 1. Every game, both looks, every purchase.
// ---------------------------------------------------------------------------------------------
for (const size of [
  { width: 390, height: 844, samples: Object.keys(SAMPLES) },
  { width: 360, height: 640, samples: ["mixed", "types", "lose"] },
]) {
  test.describe(`every game and purchase at ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });
    for (const skin of Object.keys(SKIN_GAMES)) {
      for (const game of SKIN_GAMES[skin]) {
        for (const sample of size.samples) {
          test(`${skin} ${game} · ${sample}`, async ({ page }) => {
            const errors = watchErrors(page);
            await open(page, game, skin, sample);
            await playPurchase(page, game, sample);
            await checkFinal(page, sample);
            expect(errors).toEqual([]);
          });
        }
      }
      if (THEMED.includes(skin)) continue;
      test(`${skin} mixed basket of four games and a standard competition`, async ({ page }) => {
        const errors = watchErrors(page);
        await open(page, "scratch_card", skin, "basket");
        for (let k = 0; k < 40 && !(await page.locator(".rg-summary").isVisible()); k++) {
          if (await page.locator(".rg-sheet").isVisible()) {
            await page.locator(".rg-sheet .rg-btn-primary").click();
            continue;
          }
          const cls = (await page.locator(".rg-reveal").getAttribute("class")) ?? "";
          const game = CLASSIC_GAMES.find((g) => cls.includes(`rg-game-${g} `)) ?? "scratch_card";
          await playBoard(page, game);
        }
        const summary = page.locator(".rg-summary");
        await expect(summary.locator(".rg-prize-big")).toHaveText("£18.50");
        await expect(summary.locator(".rg-summary-list li")).toHaveCount(5);
        await expect(page.locator(".rg-wallet-amount")).toHaveText("£31.00");
        expect(errors).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 2. Awkward play, with full animation.
// ---------------------------------------------------------------------------------------------
test.describe("awkward play", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

  for (const skin of ["classic", "christmas"]) {
    test(`${skin}: closing mid-purchase never loses a win`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, "spin_wheel", skin, "mixed", "full");
      await page.locator(".rg-close").click(); // before playing anything
      await expect(page.locator(".rg-summary .rg-prize-big")).toHaveText("£60");
      await expect(page.locator(".rg-summary-list li")).toHaveCount(2);
      expect(errors).toEqual([]);
    });

    test(`${skin}: a burst of taps on the spin button lands once, on the right result`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, "spin_wheel", skin, "win", "full");
      const btn = page.locator(".rg-wheel-controls .rg-btn, .rg-ce-controls .rg-btn, .rg-sleigh-controls .rg-btn").first();
      await btn.click();
      await btn.click({ force: true }).catch(() => {});
      await btn.dblclick({ force: true }).catch(() => {});
      await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 20_000 });
      expect(errors).toEqual([]);
    });

    test(`${skin}: hammering one balloon or cracker pops it once`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, "balloon_pop", skin, "many", "full");
      // Six taps on the same one, faster than it can burst.
      await page.locator(".rg-balloon, .rg-cracker").first().evaluate((el: HTMLElement) => {
        for (let k = 0; k < 6; k++) el.click();
      });
      await expect(page.locator(".rg-balloon-stats, .rg-cracker-stats")).toContainText(/^\s*1 of 40/);
      await page.locator(".rg-balloon-all, .rg-cracker-all").click();
      await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£7", { timeout: 20_000 });
      expect(errors).toEqual([]);
    });

    test(`${skin}: scratch, reset, scratch, then open the rest`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, "scratch_card", skin, "win", "full");
      const box = (await page.locator(".rg-scratch-foil").boundingBox())!;
      const swipe = async (f: number) => {
        await page.mouse.move(box.x + 6, box.y + box.height * f);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 6, box.y + box.height * f, { steps: 12 });
        await page.mouse.up();
      };
      await swipe(0.17);
      await page.locator(".rg-scratch-actions .rg-btn-white").click(); // reset
      await swipe(0.5);
      await page.locator(".rg-scratch-actions .rg-btn-cyan, .rg-scratch-actions .rg-btn-xmas-gold").click();
      await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 10_000 });
      expect(errors).toEqual([]);
    });

    test(`${skin}: sound turned on plays without errors`, async ({ page }) => {
      test.skip(skin === "classic", "the classic look has no sounds");
      const errors = watchErrors(page);
      await open(page, "balloon_pop", skin, "mixed", "full");
      await page.locator(".rg-xmas-sound").click();
      await expect(page.locator(".rg-xmas-sound")).toHaveAttribute("aria-pressed", "true");
      await page.locator(".rg-cracker").first().click();
      await page.waitForTimeout(800);
      await page.locator(".rg-cracker-all").click();
      await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });
  }
});

test.describe("awkward play in the themed looks", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

  test("cash escape: closing mid-purchase never loses a win", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "spin_wheel", "cash_escape", "mixed", "full");
    await page.locator(".rg-close").click();
    await expect(page.locator(".rg-summary .rg-prize-big")).toHaveText("£60");
    await expect(page.locator(".rg-summary-list li")).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("cash escape: a burst of taps on the button cracks the vault once, on the right result", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "spin_wheel", "cash_escape", "win", "full");
    const btn = page.locator(".rg-ce-controls .rg-btn").first();
    await btn.click();
    await btn.click({ force: true }).catch(() => {});
    await btn.dblclick({ force: true }).catch(() => {});
    await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("blankets & banknotes: a burst of taps on SPIN and the lever spins once", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "slots", "christmas", "win", "full");
    await page.locator(".rg-bb-spin").click();
    await page.locator(".rg-bb-lever").click({ force: true }).catch(() => {});
    await page.locator(".rg-bb-lever").dblclick({ force: true }).catch(() => {});
    await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("pirates: tapping every chest at once opens six", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "gems", "pirates", "lose", "full");
    await page.locator(".rg-pir-deck").evaluate((deck) => deck.querySelectorAll<HTMLButtonElement>(".rg-pir-tile").forEach((b) => b.click()));
    await expect(page.locator(".rg-pir-tile.is-open")).toHaveCount(6);
    await expect(page.locator(".rg-sheet .rg-no-win")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("drop it: taps while the coin is falling drop nothing more", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "coin_drop", "hip_hop", "win", "full");
    const board = page.locator(".rg-coin-board");
    await board.click();
    for (let k = 0; k < 4; k++) await board.click({ force: true });
    await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("smash my cash: hammering one jar smashes it once, then smash all", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "balloon_pop", "smash_cash", "many", "full");
    await page.locator(".rg-smash-jar").first().evaluate((el: HTMLElement) => {
      for (let k = 0; k < 6; k++) el.click();
    });
    await expect(page.locator(".rg-smash-stats")).toContainText(/^\s*1 of 40/);
    await page.locator(".rg-smash-all").click();
    await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£7", { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  for (const [skin, game] of [
    ["pirates", "gems"],
    ["cash_escape", "spin_wheel"],
    ["hip_hop", "coin_drop"],
    ["smash_cash", "balloon_pop"],
    ["christmas", "slots"],
  ] as const) {
    test(`${skin} ${game}: sound turned on plays without errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, game, skin, "win", "full");
      const sound = page.locator(".rg-xmas-sound");
      await expect(sound).toHaveAttribute("aria-pressed", "false");
      await sound.click();
      await expect(sound).toHaveAttribute("aria-pressed", "true");
      await playBoard(page, game);
      expect(errors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 3. "Try the demo" on the real competition pages (read only: nothing signs in or buys).
// ---------------------------------------------------------------------------------------------
test.describe("the themed looks are laid out properly on a fresh page", () => {
  // Each test starts on a freshly loaded page, so no classic game's styles are already
  // loaded: a board must look right on its own (the vault's button once sat off-centre
  // unless the classic wheel had been opened first).
  const LOOKS: [string, string, string][] = [
    ["pirates", "gems", "win"],
    ["christmas", "slots", "win"],
    ["cash_escape", "spin_wheel", "win"],
    ["hip_hop", "coin_drop", "win"],
    ["smash_cash", "balloon_pop", "mixed"],
  ];
  const SIZES: [number, number][] = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1280, 720], [1366, 768], [1440, 900]];
  for (const [w, h] of SIZES) {
    for (const [skin, game, sample] of LOOKS) {
      test(`${skin} at ${w}x${h}: centred, nothing off screen, cut off or covered`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.setViewportSize({ width: w, height: h });
        await open(page, game, skin, sample, "full");
        await page.waitForTimeout(900);
        const issues = await page.evaluate(() => {
          const reveal = document.querySelector(".rg-reveal")!;
          const rr = reveal.getBoundingClientRect();
          const board = (document.querySelector(".rg-board") ?? reveal).getBoundingClientRect();
          const mid = board.left + board.width / 2;
          const out: string[] = [];
          const sideways = document.documentElement.scrollWidth - window.innerWidth;
          if (sideways > 0) out.push(`page scrolls sideways by ${sideways}px`);
          const shown = (el: Element) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0 && Number(s.opacity) > 0.05 && !el.closest("[aria-hidden=true]");
          };
          const name = (el: Element) => `${el.getAttribute("class")} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`;
          for (const el of reveal.querySelectorAll("button, .rg-prompt, .rg-note")) {
            if (!shown(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.left < rr.left - 1 || r.right > rr.right + 1 || r.left < -1 || r.right > window.innerWidth + 1) out.push(`off the edge: ${name(el)}`);
            // Full screen on a phone, the game must fit the screen; as a card (desktop) the page scrolls as usual.
            const floor = reveal.classList.contains("rg-fullscreen") ? Math.min(rr.bottom, window.innerHeight) : rr.bottom;
            if (r.bottom > floor + 1) out.push(`cut off at the bottom: ${name(el)}`);
            if (el instanceof HTMLButtonElement && !el.disabled) {
              el.scrollIntoView({ block: "nearest" });
              const q = el.getBoundingClientRect();
              const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
              if (hit && !el.contains(hit) && !hit.contains(el)) out.push(`covered: ${name(el)} by ${hit.getAttribute("class")}`);
            }
          }
          const rail = reveal.querySelector(".rg-di-rail");
          const coins = reveal.querySelector(".rg-di-board");
          if (rail && coins && Math.abs(rail.getBoundingClientRect().width - coins.getBoundingClientRect().width) > 2) out.push("the Drop It rail and board are different widths");
          for (const sel of [".rg-ce-spin", ".rg-bb-spin", ".rg-bb-cabinet", ".rg-ce-vault", ".rg-prompt", ".rg-note", ".rg-coin-board"]) {
            const el = reveal.querySelector(sel);
            if (!el || !shown(el)) continue;
            const r = el.getBoundingClientRect();
            const off = Math.round(r.left + r.width / 2 - mid);
            if (Math.abs(off) > 2) out.push(`${sel} is ${off}px off centre`);
          }
          return out;
        });
        expect(issues).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }

  test("smash my cash, reduced motion: each smashed jar's prize shows at once, fully", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "balloon_pop", "smash_cash", "mixed", "reduced");
    await page.locator(".rg-smash-place").first().locator(".rg-smash-jar:not([disabled])").click();
    const result = page.locator(".rg-smash-result").first();
    await expect(result).toBeVisible({ timeout: 2_000 });
    // Well inside the moment before the next jar arrives: already fully shown, not waiting on a delay.
    await page.waitForTimeout(120);
    expect(Number(await result.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
    expect(errors).toEqual([]);
  });

  test("the vault's prize labels each fit inside their slice", async ({ page }) => {
    for (const sample of ["minimum", "win", "types", "end-prize", "many"]) {
      await open(page, "spin_wheel", "cash_escape", sample, "reduced");
      const tooWide = await page.evaluate(() =>
        [...document.querySelectorAll<SVGTextElement>(".rg-ce-seg-text:not(.is-none)")].flatMap((t) => {
          const m = /translate\(0\s+(-?[\d.]+)\)/.exec(t.parentElement?.getAttribute("transform") ?? "");
          if (!m) return [];
          const bb = t.getBBox();
          const inner = -parseFloat(m[1]) - (bb.y + bb.height); // the label's edge nearest the hub, where the slice is narrowest
          const room = 2 * inner * Math.sin(Math.PI / 12);
          return bb.width > room ? [`${t.textContent} is ${bb.width.toFixed(1)} wide in a ${room.toFixed(1)} slice`] : [];
        }),
      );
      expect(tooWide, sample).toEqual([]);
    }
  });
});

// Not in this build: v1 opened the demo from a "Try the demo" button on /competition/{slug}, behind
// v1's cookie banner. Here the demo is its own page (/demo/{game}), covered by the visual tests.
test.describe.skip("demo on the competition pages", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  // The launch copies ("-fresh-2026", made on 22 October) and the four tested originals, now ended.
  for (const slug of ["pop-for-pennies-fresh-2026", "gimme-a-spin-fresh-2026", "scratch-gimme-fresh-2026", "gimme-bingo-fresh-2026", "pop-for-pennies", "gimme-a-spin", "scratch-gimme", "gimme-bingo"]) {
    test(`${slug}: the demo opens, plays to the end and closes`, async ({ page }) => {
      const errors = watchErrors(page);
      // The cookie banner covers the button until it is answered. Answering it would save the choice
      // through the meta-tracking function, so that call is answered inside the browser: nothing is written.
      await page.route("**/functions/v1/meta-tracking**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "{}" }),
      );
      await page.goto(`/competition/${slug}`);
      const banner = page.getByRole("dialog", { name: "Cookie choices" });
      await banner.waitFor({ timeout: 10_000 }).catch(() => {});
      if (await banner.isVisible()) {
        await banner.getByRole("button", { name: "Reject all" }).click();
        await expect(banner).toBeHidden();
      }
      const demo = page.getByRole("button", { name: "Try the demo" });
      // The page loads the competition first: give it time before deciding there is no demo.
      await demo.first().waitFor({ timeout: 20_000 }).catch(() => {});
      if (!(await demo.count())) test.skip(true, "this competition shows no demo (no game chosen, or sold out)");
      await demo.first().click();
      await expect(page.locator(".rg-reveal")).toBeVisible();
      const cls = (await page.locator(".rg-reveal").getAttribute("class")) ?? "";
      const game = CLASSIC_GAMES.find((g) => cls.includes(`rg-game-${g} `)) ?? "scratch_card";
      for (let k = 0; k < 6 && !(await page.locator(".rg-summary").isVisible()); k++) {
        if (await page.locator(".rg-sheet").isVisible()) await page.locator(".rg-sheet .rg-btn-primary").click();
        else await playBoard(page, game);
      }
      await expect(page.locator(".rg-summary")).toBeVisible();
      await page.locator(".rg-summary").getByRole("button", { name: "Done" }).click();
      await expect(page.locator(".rg-reveal")).toHaveCount(0);
      expect(errors.filter((e) => !/Failed to load resource|status of 40[0-9]/.test(e))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Smooth on a slowed-down phone: the moving parts keep the frame rate up.
// ---------------------------------------------------------------------------------------------
test.describe("smoothness on a slowed-down phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  for (const [skin, game] of [["christmas", "spin_wheel"], ["christmas", "balloon_pop"], ["christmas", "bingo_card"], ["christmas", "scratch_card"], ["christmas", "gems"], ["christmas", "claw_machine"], ["christmas", "slots"], ["pirates", "gems"], ["cash_escape", "spin_wheel"], ["hip_hop", "coin_drop"], ["smash_cash", "balloon_pop"], ["classic", "balloon_pop"], ["classic", "spin_wheel"]] as const) {
    test(`${skin} ${game}: at least 40 frames a second with the processor slowed 4x`, async ({ page }) => {
      await open(page, game, skin, "mixed", "full");
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.waitForTimeout(500);
      if (game === "bingo_card") await page.locator(".rg-bingo-controls .rg-btn").click();
      // Measured while the board is busy: bags bursting, or the claw on its way down.
      if (game === "gems") for (const k of [0, 5, 10]) await page.locator(".rg-gem-tile").nth(k).click();
      if (game === "claw_machine") await page.locator(".rg-grab").click();
      // The themed looks are measured mid-play: reels spinning, the vault turning, the coin falling, a jar smashing.
      if (skin !== "classic" && game === "slots") await page.locator(".rg-bb-spin").click();
      if (skin === "cash_escape") await page.locator(".rg-ce-spin").click();
      if (skin === "hip_hop") await page.locator(".rg-coin-board").click();
      if (skin === "smash_cash") await page.locator(".rg-smash-jar").first().click();
      const fps = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frames = 0;
            const start = performance.now();
            const tick = (now: number) => {
              frames++;
              if (now - start < 2000) requestAnimationFrame(tick);
              else resolve((frames * 1000) / (now - start));
            };
            requestAnimationFrame(tick);
          }),
      );
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      console.log(`${skin} ${game}: ${fps.toFixed(0)} fps at 4x slowdown`);
      expect(fps).toBeGreaterThanOrEqual(40);
    });
  }
});
