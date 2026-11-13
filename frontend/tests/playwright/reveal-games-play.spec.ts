import { expect, test, type Page } from "@playwright/test";

/**
 * Plays every reveal game, classic and in every skin, on the development preview page
 * (/dev/reveal-games: sample tickets only, nothing touches the database), the way a
 * player would: real taps and real scratching with the pointer, at phone sizes.
 *
 * Each game must reach its result sheet, show the result it was given (a win shows
 * the prize, a miss shows no prize), and never get stuck. Scratch cards are
 * scratched by dragging across the card only, never by pressing "Open all": every
 * square must open. 390x667 is a short phone, where the board is drawn smaller.
 */

const SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "390x667 (short phone, board drawn smaller)", width: 390, height: 667 },
];
const GAMES = ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "hook_a_duck", "claw_machine", "coin_drop", "slots", "gems"] as const;
const SKINS = ["classic", "christmas", "pirates", "cash_escape", "hip_hop", "smash_cash"] as const;
/** The games each skin draws its own way (null: all of them). Any other game falls back to the classic look. */
const SKIN_GAMES: Record<(typeof SKINS)[number], readonly string[] | null> = {
  classic: null,
  christmas: ["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "gems", "claw_machine", "slots"],
  pirates: ["gems"],
  cash_escape: ["spin_wheel"],
  hip_hop: ["coin_drop"],
  smash_cash: ["balloon_pop"],
};

async function open(page: Page, game: string, skin: string, sample: "win" | "lose" | "mixed") {
  await page.goto("/dev/reveal-games");
  await page.getByTestId("skin").selectOption(skin);
  await page.getByTestId("present").selectOption("auto");
  await page.getByTestId("game").selectOption(game);
  await page.getByTestId("sample").selectOption(sample);
  await expect(page.locator(".rg-reveal.is-play")).toBeVisible();
}

/** Drags back and forth over the whole scratch area, like a finger, row by row. */
async function scratchAll(page: Page) {
  const canvas = page.locator(".rg-scratch-foil");
  await expect(canvas).toBeVisible();
  // Wait until the card has stopped moving (a new card grows into place): a finger lands where it can see the card.
  let box = (await canvas.boundingBox())!;
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(60);
    const next = (await canvas.boundingBox())!;
    if (Math.abs(next.width - box.width) < 0.5 && Math.abs(next.y - box.y) < 0.5) break;
    box = next;
  }
  const rows = Math.ceil(box.height / 26) + 1;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  for (let r = 0; r < rows; r++) {
    const y = Math.min(box.y + box.height - 3, box.y + 4 + r * 26);
    const [from, to] = r % 2 ? [box.x + box.width - 4, box.x + 4] : [box.x + 4, box.x + box.width - 4];
    await page.mouse.move(from, y, { steps: 2 });
    await page.mouse.move(to, y, { steps: 14 });
  }
  await page.mouse.up();
}

/** Plays the board on screen until the result sheet shows. */
async function play(page: Page, game: string) {
  const click = (sel: string) => page.locator(sel).first().click();
  switch (game) {
    case "scratch_card":
      await scratchAll(page);
      break;
    case "spin_wheel":
      await page.locator(".rg-wheel-controls .rg-btn, .rg-ce-controls .rg-btn, .rg-sleigh-controls .rg-btn").first().click();
      break;
    case "bingo_card":
      await page.locator(".rg-bingo-controls .rg-btn").click();
      break;
    case "balloon_pop":
      await click(".rg-balloon-all, .rg-cracker-all, .rg-smash-all");
      break;
    case "claw_machine":
      await click(".rg-grab");
      break;
    case "coin_drop":
      await click(".rg-coin-board");
      break;
    default: {
      // The other classic games: press whatever the board offers until it lands.
      for (let k = 0; k < 12 && !(await page.locator(".rg-sheet").isVisible()); k++) {
        const target = page.locator(".rg-board button:not([disabled]), .rg-board [role=button]").first();
        if (await target.count()) await target.click({ force: true }).catch(() => {});
        await page.waitForTimeout(700);
      }
    }
  }
  await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 20_000 });
}

for (const size of SIZES) {
  test.describe(`reveal games at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: "no-preference", hasTouch: false });

    for (const skin of SKINS) {
      for (const game of GAMES) {
        if (SKIN_GAMES[skin] && !SKIN_GAMES[skin]!.includes(game)) continue;
        test(`${skin} ${game}: a win shows the prize, a miss shows none`, async ({ page }) => {
          for (const sample of ["win", "lose"] as const) {
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
          }
        });
      }

      // The scratch card checks are for the looks that draw a scratch card.
      if (SKIN_GAMES[skin] && !SKIN_GAMES[skin]!.includes("scratch_card")) continue;

      test(`${skin} scratch card: one quick swipe through each row opens every square`, async ({ page }) => {
        await open(page, "scratch_card", skin, "lose");
        const box = (await page.locator(".rg-scratch-foil").boundingBox())!;
        // One finger-width line through the middle of each row of three, lifting between rows.
        for (const f of [1 / 6, 3 / 6, 5 / 6]) {
          const y = box.y + box.height * f;
          await page.mouse.move(box.x + 6, y);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width - 6, y, { steps: 16 });
          await page.mouse.up();
        }
        await expect(page.locator(".rg-prompt-title")).toHaveText(/Match 3!|No match this time/, { timeout: 5_000 });
      });

      test(`${skin} scratch card: a scratch stays scratched when the card is redrawn`, async ({ page }) => {
        await open(page, "scratch_card", skin, "lose");
        const canvas = page.locator(".rg-scratch-foil");
        const box = (await canvas.boundingBox())!;
        // A small dab in the first square: not enough to open it.
        const at = { x: box.x + box.width * 0.12, y: box.y + box.height * 0.12 };
        await page.mouse.move(at.x, at.y);
        await page.mouse.down();
        await page.mouse.move(at.x + 4, at.y, { steps: 2 });
        await page.mouse.up();
        const alphaAt = () =>
          canvas.evaluate((c: HTMLCanvasElement, p) => {
            const r = c.getBoundingClientRect();
            const x = Math.round(((p.x - r.left) / r.width) * c.width);
            const y = Math.round(((p.y - r.top) / r.height) * c.height);
            return c.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
          }, at);
        // Cover alpha is 158 (the vault's thin frost) to 255 (foil); a scratched spot is clear.
        expect(await alphaAt()).toBeLessThan(40);
        // Redraw the cover, as a resize or the display font loading does.
        await page.setViewportSize({ width: size.width - 10, height: size.height });
        await page.waitForTimeout(300);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.waitForTimeout(300);
        const after = (await canvas.boundingBox())!;
        expect(Math.abs(after.x - box.x)).toBeLessThan(1);
        expect(await alphaAt()).toBeLessThan(40);
      });

      test(`${skin} scratch card: card after card in one purchase, each one scratches to the end`, async ({ page }) => {
        await open(page, "scratch_card", skin, "mixed"); // six tickets
        for (let card = 1; card <= 4; card++) {
          await expect(page.locator(".rg-counter")).toContainText(`${card} of 6`);
          await scratchAll(page);
          await expect(page.locator(".rg-prompt-title")).toHaveText(/Match 3!|No match this time/, { timeout: 5_000 });
          await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 5_000 });
          await page.locator(".rg-sheet .rg-btn-primary").click();
          // Start straight away, while the board is still growing back: that is when it used to stick.
          await page.waitForTimeout(120);
        }
      });

      test(`${skin} scratch card: scratching alone opens every square`, async ({ page }) => {
        await open(page, "scratch_card", skin, "lose");
        await scratchAll(page);
        // The prompt says it is done, and "Open all" was never needed.
        await expect(page.locator(".rg-prompt-title")).toHaveText(/Match 3!|No match this time/, { timeout: 5_000 });
        if (skin === "christmas") await expect(page.locator(".rg-vault-box.is-open")).toHaveCount(9);
      });
    }

    test("humbug heist: six bags crack, no more, and three the same only on a win", async ({ page }) => {
      for (const sample of ["win", "lose"] as const) {
        await open(page, "gems", "christmas", sample);
        await expect(page.locator(".rg-heist-tile")).toHaveCount(16);
        // A burst of taps, faster than a bag can burst: the same bag twice, then nine more.
        await page.locator(".rg-heist-street").evaluate((street) => {
          const bags = [...street.querySelectorAll<HTMLButtonElement>(".rg-heist-tile")];
          bags[0].click();
          bags[0].click();
          for (const k of [3, 6, 9, 12, 15, 1, 2, 4, 7]) bags[k].click();
        });
        await expect(page.locator(".rg-heist-tile.is-open")).toHaveCount(6);
        await expect(page.locator(".rg-heist-picks i.is-used")).toHaveCount(0); // the tokens go with the prompt once done
        if (sample === "win") {
          await expect(page.locator(".rg-prompt-title")).toHaveText(/^Three (gold bars|bundles of notes|silver stacks)!$/);
          await expect(page.locator(".rg-heist-tile.is-hit")).toHaveCount(3);
          await expect(page.locator(".rg-heist-pay.is-hit")).toContainText("£10");
        } else {
          await expect(page.locator(".rg-prompt-title")).toHaveText("No match this time");
          await expect(page.locator(".rg-heist-tile.is-hit")).toHaveCount(0);
        }
        await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("grinchmas gold: the claw steers, and the bauble holds the ticket's result", async ({ page }) => {
      for (const sample of ["win", "lose"] as const) {
        await open(page, "claw_machine", "christmas", sample);
        const rig = page.locator(".rg-claw-rig");
        const startX = (await rig.boundingBox())!.x;
        // Hold the joystick right, then drag across the glass to the left.
        const right = page.locator(".rg-joy-btn.is-right");
        await right.hover();
        await page.mouse.down();
        await page.waitForTimeout(500);
        await page.mouse.up();
        expect((await rig.boundingBox())!.x).toBeGreaterThan(startX + 20);
        const glass = (await page.locator(".rg-claw-glass").boundingBox())!;
        await page.mouse.move(glass.x + glass.width * 0.6, glass.y + glass.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(glass.x + glass.width * 0.2, glass.y + glass.height * 0.5, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        expect((await rig.boundingBox())!.x).toBeLessThan(startX - 20);
        await page.locator(".rg-grab").click();
        await page.locator(".rg-grab").click({ force: true }).catch(() => {});
        await expect(page.locator(".rg-claw-held .rg-bauble")).toBeVisible({ timeout: 5_000 });
        if (sample === "win") {
          await expect(page.locator(".rg-claw-prize")).toHaveText("£10", { timeout: 6_000 });
          await expect(page.locator(".rg-claw-empty")).toHaveCount(0);
        } else {
          await expect(page.locator(".rg-claw-empty")).toHaveText("Empty bauble", { timeout: 6_000 });
          await expect(page.locator(".rg-claw-prize")).toHaveCount(0);
        }
        // Exactly one bauble left the pile.
        await expect(page.locator(".rg-bauble-slot")).toHaveCount(17);
        await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("pirates: six chests open, no more, and three the same only on a win", async ({ page }) => {
      for (const sample of ["win", "lose"] as const) {
        await open(page, "gems", "pirates", sample);
        await expect(page.locator(".rg-pir-tile")).toHaveCount(16);
        // A burst of taps: the same chest twice, then nine more.
        await page.locator(".rg-pir-deck").evaluate((deck) => {
          const chests = [...deck.querySelectorAll<HTMLButtonElement>(".rg-pir-tile")];
          chests[0].click();
          chests[0].click();
          for (const k of [3, 6, 9, 12, 15, 1, 2, 4, 7]) chests[k].click();
        });
        await expect(page.locator(".rg-pir-tile.is-open")).toHaveCount(6);
        if (sample === "win") {
          await expect(page.locator(".rg-prompt-title")).toHaveText(/^Three (gold doubloons|rubies|pearls)!$/);
          await expect(page.locator(".rg-pir-tile.is-hit")).toHaveCount(3);
          await expect(page.locator(".rg-pir-pay.is-hit")).toContainText("£10");
        } else {
          await expect(page.locator(".rg-prompt-title")).toHaveText("No match this time");
          await expect(page.locator(".rg-pir-tile.is-hit")).toHaveCount(0);
        }
        await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("blankets & banknotes: one spin however many taps, three in a row only on a win", async ({ page }) => {
      for (const sample of ["win", "lose"] as const) {
        await open(page, "slots", "christmas", sample);
        await expect(page.locator(".rg-bb-reel")).toHaveCount(3);
        // SPIN and the lever together, more than once.
        await page.evaluate(() => {
          const spin = document.querySelector<HTMLButtonElement>(".rg-bb-spin")!;
          const lever = document.querySelector<HTMLButtonElement>(".rg-bb-lever")!;
          spin.click();
          lever.click();
          spin.click();
        });
        await expect(page.locator(".rg-bb-spin")).toHaveCount(0);
        await expect(page.locator(".rg-bb-lever")).toBeDisabled();
        const reels = page.locator(".rg-bb-window");
        await expect(reels).toHaveAttribute("aria-label", /^Payline: /, { timeout: 8_000 });
        const line = ((await reels.getAttribute("aria-label")) ?? "").replace("Payline: ", "").split(", ");
        expect(line.length).toBe(3);
        if (sample === "win") {
          expect(new Set(line).size).toBe(1);
          await expect(page.locator(".rg-bb .rg-reel-cell.is-hit")).toHaveCount(3);
          await expect(page.locator(".rg-bb-pay.is-hit")).toContainText("£10");
        } else {
          expect(new Set(line).size).toBeGreaterThan(1);
          await expect(page.locator(".rg-bb .rg-reel-cell.is-hit")).toHaveCount(0);
        }
        await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("cash escape: the vault lands on the ticket's result, and bursts open only on a win", async ({ page }) => {
      await open(page, "spin_wheel", "cash_escape", "win");
      const btn = page.locator(".rg-ce-spin");
      await btn.click();
      await btn.click({ force: true }).catch(() => {});
      await expect(page.locator(".rg-ce-svg")).toHaveAttribute("aria-label", "Landed on £10", { timeout: 12_000 });
      await expect(page.locator(".rg-ce.is-won")).toHaveCount(1);
      await expect(page.locator(".rg-ce-cash i")).toHaveCount(22);
      await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£10 credit", { timeout: 10_000 });
      await open(page, "spin_wheel", "cash_escape", "lose");
      await page.locator(".rg-ce-spin").click();
      await expect(page.locator(".rg-ce-svg")).toHaveAttribute("aria-label", "Landed on no win", { timeout: 12_000 });
      await expect(page.locator(".rg-ce.is-won")).toHaveCount(0);
      await expect(page.locator(".rg-ce-cash")).toHaveCount(0);
      await expect(page.locator(".rg-sheet .rg-no-win")).toBeVisible({ timeout: 10_000 });
    });

    test("drop it like it's hot: aiming moves the coin, and the speaker it lands in is the ticket's result", async ({ page }) => {
      for (const sample of ["win", "lose"] as const) {
        await open(page, "coin_drop", "hip_hop", sample);
        const coin = page.locator(".rg-di-coin");
        await expect(coin).toHaveAttribute("aria-label", "Drop the coin above slot 4");
        await page.getByRole("button", { name: "Aim left" }).click();
        await page.getByRole("button", { name: "Aim left" }).click();
        await expect(coin).toHaveAttribute("aria-label", "Drop the coin above slot 2");
        await page.locator(".rg-coin-board").click();
        await page.locator(".rg-coin-board").click({ force: true });
        const board = page.locator(".rg-di-board svg");
        await expect(board).toHaveAttribute("aria-label", /^Coin landed on /, { timeout: 8_000 });
        // The studs the coin bounced off light up on the way down.
        await expect(page.locator(".rg-di-stud.is-lit").first()).toBeAttached();
        if (sample === "win") {
          await expect(board).toHaveAttribute("aria-label", "Coin landed on £10");
          await expect(page.locator(".rg-di-bin.is-win")).toHaveCount(1);
        } else {
          await expect(board).toHaveAttribute("aria-label", "Coin landed on no prize");
          await expect(page.locator(".rg-di-bin.is-win")).toHaveCount(0);
        }
        await expect(page.locator(".rg-sheet")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("smash my cash: a hammered jar smashes once, and jars show the tickets in order", async ({ page }) => {
      await open(page, "balloon_pop", "smash_cash", "mixed");
      await expect(page.locator(".rg-smash-jar")).toHaveCount(4);
      // Five taps on one jar, faster than it can smash.
      await page.locator(".rg-smash-jar").first().evaluate((el: HTMLElement) => {
        for (let k = 0; k < 5; k++) el.click();
      });
      await expect(page.locator(".rg-smash-stats")).toContainText(/^\s*1 of 6/);
      // The sample's first ticket wins £10, the second does not.
      await expect(page.locator(".rg-smash-latest")).toContainText("+£10");
      await expect(page.locator(".rg-smash-prize")).toHaveText("£10");
      await page.locator(".rg-smash-jar:not([disabled])").last().click();
      await expect(page.locator(".rg-smash-stats")).toContainText(/^\s*2 of 6/);
      await expect(page.locator(".rg-smash-latest")).toContainText("No win");
      await page.locator(".rg-smash-all").click();
      await expect(page.locator(".rg-smash-all")).toBeDisabled();
      await expect(page.locator(".rg-sheet .rg-prize-big")).toHaveText("£60", { timeout: 15_000 });
    });

    test("christmas sleigh: a calm pace, and gold coins only on a win", async ({ page }) => {
      await open(page, "spin_wheel", "christmas", "win");
      await expect(page.locator(".rg-sleigh-pos")).toBeAttached();
      const where = () =>
        page.evaluate(() => {
          const m = document.querySelector<SVGGElement>(".rg-sleigh-pos")!.transform.baseVal.consolidate()!.matrix;
          return (Math.atan2(m.e, -m.f) * 180) / Math.PI;
        });
      const a = await where();
      await page.waitForTimeout(1000);
      const b = await where();
      const perSecond = (((b - a) % 360) + 360) % 360;
      // About 105 degrees a second: a lap takes more than three seconds.
      expect(perSecond).toBeGreaterThan(70);
      expect(perSecond).toBeLessThan(140);
      await page.locator(".rg-sleigh-controls .rg-btn").click();
      await expect(page.locator(".rg-sleigh-svg")).toHaveAttribute("aria-label", "Landed on £10", { timeout: 15_000 });
      await expect(page.locator(".rg-dosh")).toHaveCount(9);
      await open(page, "spin_wheel", "christmas", "lose");
      await page.locator(".rg-sleigh-controls .rg-btn").click();
      await expect(page.locator(".rg-sleigh-svg")).toHaveAttribute("aria-label", "Landed on no win", { timeout: 15_000 });
      await expect(page.locator(".rg-dosh")).toHaveCount(0);
    });

    test("christmas sleigh: stays upright and the right way up all the way round", async ({ page }) => {
      await open(page, "spin_wheel", "christmas", "win");
      await expect(page.locator(".rg-sleigh-pos")).toBeAttached();
      const samples: { flip: number; tilt: number }[] = [];
      for (let k = 0; k < 24; k++) {
        samples.push(
          await page.evaluate(() => {
            const g = document.querySelector<SVGGElement>(".rg-sleigh-pos")!;
            const m = g.transform.baseVal.consolidate()!.matrix;
            // Upright: the sleigh's own "up" points up the screen (d > 0) and it is not tipped over.
            return { flip: m.d, tilt: (Math.atan2(m.b, m.a) * 180) / Math.PI };
          }),
        );
        await page.waitForTimeout(70);
      }
      for (const s of samples) {
        expect(s.flip).toBeGreaterThan(0);
        expect(Math.abs(s.tilt) < 35 || Math.abs(s.tilt) > 145).toBe(true);
      }
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const STILL: [string, string][] = [
    ...["scratch_card", "spin_wheel", "bingo_card", "balloon_pop", "gems", "claw_machine", "slots"].map((g): [string, string] => ["christmas", g]),
    ["pirates", "gems"],
    ["cash_escape", "spin_wheel"],
    ["hip_hop", "coin_drop"],
    ["smash_cash", "balloon_pop"],
  ];
  for (const [skin, game] of STILL) {
    test(`${skin} ${game} still reaches its result`, async ({ page }) => {
      await open(page, game, skin, "win");
      await page.getByTestId("motion").selectOption("reduced");
      await page.getByTestId("game").selectOption(game);
      await play(page, game);
      await expect(page.locator(".rg-sheet")).toContainText("£10");
      // Nothing falls: the snow is still (and the vault has none).
      await expect(page.locator(".rg-snow:not(.is-still)")).toHaveCount(0);
    });
  }
});
