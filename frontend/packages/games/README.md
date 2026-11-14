# Gimme Gimme premium games

Nine instant-win reveal games built on one shell: PixiJS 8 for the scene, GSAP for motion, Howler for sound,
TypeScript throughout. They live inside the front end and are installed with it (`frontend/package.json`).

**The golden rule: the server decides, the game only presents.** Every ticket arrives already decided by
Verity (`POST /api/orders/{number}/play`). A game never chooses a result, never talks to the network, and can
only show the result it was given. Each game checks its own board against the ticket before it plays and logs
an error if they ever disagree. `tests/premium-games` holds this.

## Games

| id | Folder | What the player does |
| --- | --- | --- |
| `scratch_card` | `scratch-card/` | Scratches the foil (55% clears the rest) |
| `spin_wheel` | `spin-wheel/` | Spins; the wheel lands on a segment matching the ticket |
| `slots` | `slots/` | Pulls the lever; three crowns is a win, a no-win is a random line that is never three of a kind |
| `balloon_pop` | `balloon-pop/` | Pops any balloon |
| `gems` | `gems/` | Picks a gem from the tray |
| `claw_machine` | `claw-machine/` | Drags to aim and drops the claw; it always grabs a capsule, which opens on the result |
| `coin_drop` | `coin-drop/` | Drops the coin; its path is chosen to land in a bin of the ticket's kind |
| `hook_a_duck` | `hook-a-duck/` | Hooks any duck |
| `bingo_card` | `bingo-card/` | Calls the balls; a win completes a line, a no-win card is marked at random from sets with no line |

Losing boards are random, never arranged to look close, and miss lines are neutral.

## Using a game

```ts
import { mountPremiumGame, fromRevealOutcome } from "../../packages/games"; // from src/islands
const game = await mountPremiumGame("coin_drop", el, {
  tickets: fromRevealOutcome(play, competitionId), // already decided on the server
  theme: "christmas",                              // or "default"
  competitionTitle, prizeLabels,                   // real prize names only
  links: { back: "/account", playAgain: "/competitions", wallet: "/account/wallet" },
});
// later
game.destroy();
```

On the site it is mounted by `src/islands/GameIsland.tsx` (an Astro `client:visible` island), which calls the
play endpoint itself when given an `orderNumber`.

## The shell

`shell/Shell.ts` gives every game the same top bar (back, ticket count, total won, sound), a tap-to-reveal
button, Reveal All and Skip, the win overlay with the "Verified fair" link (`proofUrl`), the results summary and
screen-reader announcements. Buttons and text are real HTML; only the scene is canvas. Sounds are off until the
player turns them on (remembered in `gg-games-sound`); reduced motion shortens or removes every animation.

A game is a `GameScene` (`load`, `present`, `revealNow`, `celebrate`, `dismiss`, `destroy`). To add one: make a
folder `<id-with-dashes>/` with `scene.ts` and an `index.ts` exporting `mount`, add it to `PREMIUM_GAMES` in
`index.ts` and to the list in `src/dev/GamesPreview.tsx`. Keep any result maths in a separate file
(`coin-drop/path.ts`, `bingo-card/board.ts`) and test it across thousands of seeds.

## Themes and art

`shared/theme.ts` holds the tokens (`default` dark luxe neon, `christmas`). All art is drawn in code;
`assets/manifest.json` lists what can be swapped for real artwork or sound through `GameConfig.assets`.

## Trying them

`npm run dev`, then `/games-preview` (development only; not in the production build). It plays every game
against ten sample tickets, with a theme picker and a reduced-motion switch.

Tests: `npx vitest run tests/premium-games`.

## Content Security Policy

Pixi is imported with `pixi.js/unsafe-eval` (no `eval`) and asset workers are off (no blob workers), so the
games run under the site's CSP unchanged.
