import { expect, test, type Page } from "@playwright/test";

/**
 * The 3D boards, played the way a player would on a phone: buttons under the stage, taps on the 3D
 * board itself, drags for the lever, the wheel and the scratch card. Every game in every look must reach
 * its result sheet and show the result it was given, with no errors, with and without reduced motion.
 * (The 2D boards, which show when a phone has no WebGL, are played by reveal-games-play.spec.ts.)
 */

const SKIN_GAMES: Record<string, readonly string[]> = {
  classic: ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "hook_a_duck", "claw_machine", "coin_drop", "slots", "gems"],
  christmas: ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "gems", "claw_machine", "slots"],
  pirates: ["gems"],
  cash_escape: ["spin_wheel"],
  hip_hop: ["coin_drop"],
  smash_cash: ["balloon_pop"],
};

/** Where to tap on the 3D stage, as fractions of it, in turn, when the board offers no button. */
const TAPS: Record<string, [number, number][]> = {
  gems: [
    ...[0.22, 0.4, 0.6, 0.78].flatMap((x) => [0.76, 0.6].map((y) => [x, y] as [number, number])),
    ...[0.27, 0.43, 0.57, 0.73].map((x) => [x, 0.45] as [number, number]),
  ],
  hook_a_duck: [[0.5, 0.66], [0.3, 0.62], [0.7, 0.62]],
  coin_drop: [[0.5, 0.2], [0.3, 0.2], [0.7, 0.2]],
  default: [[0.5, 0.5], [0.5, 0.35], [0.5, 0.65]],
};
const BUTTON = /spin|grab|drop|draw|pull|pop|smash|crack|stop|start|go|open|play|reveal|hook/i;

async function open(page: Page, game: string, skin: string, sample: string) {
  await page.goto("/dev/reveal-games");
  await page.getByTestId("skin").selectOption(skin);
  await page.getByTestId("present").selectOption("auto");
  await page.getByTestId("game").selectOption(game);
  await page.getByTestId("sample").selectOption(sample);
  await expect(page.locator(".rg-reveal.is-play")).toBeVisible({ timeout: 20_000 });
  // The 3D stage, not the 2D fallback.
  await expect(page.locator(".rg3-stage.is-ready").first()).toBeVisible({ timeout: 20_000 });
}

async function scratchAll(page: Page) {
  const canvas = page.locator(".rg-scratch-foil");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  for (let r = 0; r < Math.ceil(box.height / 26) + 1; r++) {
    const y = Math.min(box.y + box.height - 3, box.y + 4 + r * 26);
    const [from, to] = r % 2 ? [box.x + box.width - 4, box.x + 4] : [box.x + 4, box.x + box.width - 4];
    await page.mouse.move(from, y, { steps: 2 });
    await page.mouse.move(to, y, { steps: 14 });
  }
  await page.mouse.up();
}

/** Presses what the board offers, or taps the stage, until the result sheet shows. */
async function play(page: Page, game: string) {
  const sheet = page.locator(".rg-sheet");
  if (game === "scratch_card") await scratchAll(page);
  const taps = TAPS[game] ?? TAPS.default;
  for (let k = 0; k < 40 && !(await sheet.isVisible()); k++) {
    const buttons = page.locator(".rg-board button:not([disabled]):not(.rg-xmas-sound):not(.rg3-arrow)");
    let pressed = false;
    for (let i = 0; i < (await buttons.count()); i++) {
      const b = buttons.nth(i);
      if ((await b.isVisible()) && BUTTON.test((await b.innerText()) || (await b.getAttribute("aria-label")) || "")) {
        // force: the 3D buttons pulse, so they are never "still" enough for a normal click.
        await b.click({ timeout: 2_000, force: true }).catch(() => {});
        pressed = true;
        break;
      }
    }
    if (!pressed) {
      const stage = page.locator(".rg3-stage canvas").first();
      if (await stage.count()) {
        await stage.scrollIntoViewIfNeeded();
        const r = (await stage.boundingBox())!;
        const [fx, fy] = taps[k % taps.length];
        await page.mouse.click(r.x + r.width * fx, r.y + r.height * fy);
      }
    }
    await page.waitForTimeout(1_200);
  }
  await expect(sheet).toBeVisible({ timeout: 30_000 });
}

for (const motion of ["no-preference", "reduce"] as const) {
  test.describe(`3D games, motion ${motion}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, reducedMotion: motion, hasTouch: false });
    for (const [skin, games] of Object.entries(SKIN_GAMES)) {
      for (const game of games) {
        test(`${skin} ${game}: a win shows the prize, a miss shows none`, async ({ page }) => {
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          page.on("console", (m) => {
            if (m.type() === "error" && !/vibrate|DevTools|GPU stall|WebGL/i.test(m.text())) errors.push(m.text());
          });
          for (const sample of motion === "reduce" ? (["win"] as const) : (["win", "lose"] as const)) {
            await open(page, game, skin, sample);
            await play(page, game);
            const sheet = page.locator(".rg-sheet");
            if (sample === "win") {
              await expect(sheet).toContainText("£10");
              await expect(sheet.locator(".rg-no-win")).toHaveCount(0);
            } else {
              await expect(sheet.locator(".rg-no-win")).toBeVisible();
              await expect(sheet).not.toContainText("£10 credit");
            }
            await page.screenshot({ path: `/tmp/gg-games/${motion}-${skin}-${game}-${sample}.png` });
          }
          expect(errors).toEqual([]);
        });
      }
    }
  });
}

test.describe("3D games: a whole purchase", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  for (const game of ["spin_wheel", "hook_a_duck", "slots"]) {
    test(`classic ${game}: six tickets, played one after another, add up`, async ({ page }) => {
      await open(page, game, "classic", "mixed");
      for (let n = 1; n <= 6; n++) {
        await expect(page.locator(".rg-counter")).toContainText(`${n} of 6`);
        await play(page, game);
        const sheet = page.locator(".rg-sheet");
        if (n === 1) await expect(sheet).toContainText("£10");
        else if (n === 5) await expect(sheet).toContainText("£50");
        else await expect(sheet.locator(".rg-no-win")).toBeVisible();
        if (n < 6) {
          await sheet.locator(".rg-btn-primary").click();
          await expect(sheet).toBeHidden({ timeout: 10_000 });
          await expect(page.locator(".rg3-stage.is-ready").first()).toBeVisible({ timeout: 20_000 });
        }
      }
    });
  }
});
