# Premium Games: Plan

A reusable library of premium instant-win reveal games (PixiJS v8, GSAP, Howler, TypeScript), first used on
Gimme Gimme Prizes and later on RaffleLabs client sites. First game: the premium Scratch Card.

## Where it lives

`frontend/packages/games/`, inside the Astro project so it shares one `node_modules` (no workspace setup
on Forge) but with no imports from the site: it can be lifted into its own package later unchanged.

```
packages/games/
  package.json        name, peer dependencies (pixi.js, gsap, howler); no build step, plain TS
  shell/              everything shared by every game
    state.ts          pure state machine: tickets, current index, totals, reveal-all, finish (unit tested)
    Shell.ts          the DOM layer: top bar, ticket strip, buttons, win overlay, summary, loader
    stage.ts          the Pixi application: background (bokeh + perspective grid), stage, resize
    shell.css         dark glass panels, neon rims, phone frame on desktop
  scratch-card/
    index.ts          mount(el, config) / destroy()
    card.ts           one card: art, prize window, foil, brush mask, auto-reveal, win/lose motion
  shared/
    theme.ts          theme tokens (default "dark luxe neon", premium Christmas); every colour, label, background
    textures.ts       procedural textures: brushed foil, glows, sparkles, bokeh, light rays
    particles.ts      pooled, capped particle bursts (sparkles, confetti)
    audio.ts          Howler wrapper; placeholder sounds generated as WAV data at runtime; off until turned on
    haptics.ts        navigator.vibrate where supported
    types.ts          the public contract (GameTicket, GameConfig, Theme)
  assets/manifest.json every replaceable asset, with sizes and formats
```

UI text and buttons are DOM (crisp, accessible, 44px taps, screen-reader friendly); the scene, cards, foil,
light and particles are Pixi (WebGL). Text that is part of the art (prize in the window) is Pixi.

## How it mounts in Astro

A small React island (`src/islands/GameIsland.tsx`, `client:visible`) calls `mount(el, config)` when it
appears and `destroy()` when it goes. The game module has no React dependency; any site can call
`mount()` directly.

## The contract (server decides, game only presents)

Results come from the existing endpoint, which already exists and is idempotent:

`POST /api/orders/{number}/play` (signed-in owner, paid orders only) returns every ticket of the order with
its outcome, decided by Verity at payment time, and marks the order as watched. Asking again returns the same
results. This task only adds `proofUrl` to each ticket (the competition's Verity verify page). Nothing about
how results are made changes.

The game takes a frozen list of:

```ts
type GameTicket = {
  ticketNumber: number;
  result: "win" | "lose";
  prize?: { label: string; value: number /* pounds */; tier: "small" | "medium" | "big" };
  proofUrl?: string;
};
```

`fromRevealOutcome()` turns the API response into this list (tier is presentation only: a share of the
order's largest prize). The game never generates, reorders or changes a result; randomness is used only for
sparkles and confetti. The "mark revealed" call is the endpoint above, sent at most once per session.

## Preview

`/games-preview`, development only (added by `astro.config.mjs` under `astro dev`, never built): 10 mock
tickets (no-wins, small wins, one big win), theme switch (default / Christmas), reduced-motion switch.

## Tests

`tests/premium-games/`: state machine (progression, totals, reveal-all, finish, idempotent reveal call),
the adapter (results can't be changed), theme completeness, and a static check that nothing decides a
result. Laravel: `proofUrl` on the play response.
