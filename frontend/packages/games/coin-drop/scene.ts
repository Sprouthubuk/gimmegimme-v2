import gsap from "gsap";
import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { coinTexture, fitPlayfield, glowSprite, lookPick, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";
import { BINS, ROWS, binOf, coinPath, isWinBin } from "./path";

/**
 * Coin Drop: a neon peg board. Tap to drop the coin; it bounces down to a bin. The ticket's result is fixed
 * on the server and the path is picked to land in a bin of the same kind, then checked before it plays.
 */
const GAP = 42;
const ROW_H = 44;
const W = 330;
const H = 420;
const TOP = -H / 2 + 92;
const BIN_Y = TOP + (ROWS - 1) * ROW_H + 30;

export function createCoinDrop(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let coinTex: Texture | null = null;
  let board: Container | null = null;
  let coin: Sprite | null = null;
  let pegs: Graphics[][] = [];
  let binGlow: Sprite[] = [];
  let plate: Container | null = null;
  let busy = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let bob: gsap.core.Tween | null = null;

  const fit = () => fitPlayfield(stage, holder, H, W);
  stage.onResize(fit);
  const pegX = (r: number, j: number) => (j - r / 2) * GAP;

  const build = () => {
    board = new Container();
    const frame = new Graphics()
      .roundRect(-W / 2, -H / 2, W, H, 26).fill({ color: 0x0d0a14 })
      .stroke({ width: 2.5, color: hex(theme.neonA), alpha: 0.9 });
    board.addChild(glowSprite(glow, theme.neonA, W * 1.6, H * 1.3, 0.16), frame);
    const title = new Text({ text: (ctx.config.competitionTitle ?? "Coin Drop").toUpperCase(), style: { fontFamily: theme.fonts.display, fontSize: 15, fontWeight: "800", fill: theme.gold, letterSpacing: 2, align: "center", wordWrap: true, wordWrapWidth: W - 60 } });
    title.anchor.set(0.5);
    title.position.set(0, -H / 2 + 30);
    board.addChild(title);
    // Pegs: the triangle the coin uses, plus decorative pegs to fill the board on the same stagger.
    pegs = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Graphics[] = [];
      for (let j = -3; j <= r + 3; j++) {
        const x = pegX(r, j);
        if (Math.abs(x) > W / 2 - 22) continue;
        const live = j >= 0 && j <= r;
        const g = new Graphics().circle(0, 0, 5).fill({ color: 0xe9e4f2 }).circle(0, 0, 9).fill({ color: hex(theme.neonB), alpha: 0.14 });
        g.position.set(x, TOP + r * ROW_H);
        board.addChild(g);
        if (live) row[j] = g;
      }
      pegs.push(row);
    }
    // Bins.
    binGlow = [];
    for (let b = 0; b < BINS; b++) {
      const x = (b - (BINS - 1) / 2) * GAP;
      const win = isWinBin(b);
      const gl = glowSprite(glow, win ? theme.gold : theme.neonB, GAP * 1.6, 60, 0);
      gl.position.set(x, BIN_Y + 20);
      const cup = new Graphics().roundRect(x - GAP / 2 + 3, BIN_Y, GAP - 6, 48, 8)
        .fill({ color: win ? 0x2a2108 : 0x15111d }).stroke({ width: 1.5, color: hex(win ? theme.gold : "#5c5568") });
      const label = new Text({ text: win ? "★" : "–", style: { fontFamily: theme.fonts.display, fontSize: win ? 20 : 18, fontWeight: "800", fill: win ? theme.gold : "#8d84a0" } });
      label.anchor.set(0.5);
      label.position.set(x, BIN_Y + 25);
      board.addChild(gl, cup, label);
      binGlow.push(gl);
    }
    const key = new Text({ text: "★ PRIZE   –  NO WIN", style: { fontFamily: theme.fonts.ui, fontSize: 11, fontWeight: "700", fill: "#a99fbb", letterSpacing: 1.5 } });
    key.anchor.set(0.5);
    key.position.set(0, BIN_Y + 64);
    board.addChild(key);
    coin = new Sprite(coinTex!);
    coin.anchor.set(0.5);
    coin.width = coin.height = 30;
    coin.position.set(0, TOP - 40);
    board.addChild(coin);
    board.eventMode = "static";
    board.cursor = "pointer";
    board.hitArea = { contains: (x: number, y: number) => Math.abs(x) < W / 2 && Math.abs(y) < H / 2 };
    board.on("pointertap", () => { if (!busy && !plate) void drop(false).then(() => onRevealed?.()); });
    holder.addChild(board);
    if (!reducedMotion) bob = gsap.to(coin, { x: 6, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  };

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const drop = (fast: boolean) => (running ??= dropOnce(fast));
  const dropOnce = async (fast: boolean) => {
    if (busy || !coin || !ticket || plate) return;
    busy = true;
    bob?.kill();
    audio.play("button");
    const moves = coinPath(ticket.result === "win", lookPick);
    const bin = binOf(moves);
    if (isWinBin(bin) !== (ticket.result === "win")) console.error("Coin Drop: path does not match the ticket's result");
    const c = coin;
    const sp = fast || reducedMotion ? 0.3 : 1;
    await gsap.to(c, { x: 0, y: TOP - 12, duration: 0.25 * sp, ease: "power2.in" });
    if (holder.destroyed) return;
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      const peg = pegs[r][k];
      if (peg && !fast && !reducedMotion) gsap.fromTo(peg.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.3 });
      if (!fast && r % 2 === 0) audio.play("button");
      k += moves[r] ? 1 : 0;
      const nx = r + 1 < ROWS ? pegX(r + 1, k) : (k - (BINS - 1) / 2) * GAP;
      const ny = r + 1 < ROWS ? TOP + (r + 1) * ROW_H - 12 : BIN_Y + 24;
      const tl = gsap.timeline();
      tl.to(c, { x: nx, duration: 0.22 * sp, ease: "sine.out" }, 0)
        .to(c, { y: ny - ROW_H * 0.55, duration: 0.08 * sp, ease: "power1.out" }, 0)
        .to(c, { y: ny, duration: 0.14 * sp, ease: "power2.in" }, 0.08 * sp)
        .to(c, { rotation: c.rotation + (moves[r] ? 1 : -1), duration: 0.22 * sp }, 0);
      await tl;
      if (holder.destroyed) return;
    }
    // Landed.
    audio.play("reveal");
    const gl = binGlow[bin];
    gsap.to(gl, { alpha: 0.9, duration: 0.2 });
    const at = stage.root.toLocal(board!.toGlobal({ x: c.x, y: c.y }));
    if (!reducedMotion) particles.burst({ x: at.x, y: at.y, count: fast ? 10 : 26, texture: sparkle, tints: [isWinBin(bin) ? hex(theme.gold) : hex(theme.neonB), 0xffffff], speed: [2, 6], size: [4, 10], life: [20, 40], gravity: 0.1, additive: true });
    await gsap.to(board!, { alpha: 0.35, duration: fast ? 0.1 : 0.35, delay: fast ? 0 : 0.25 });
    if (holder.destroyed) return;
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(0, -30);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
    if (holder.destroyed) return;
    busy = false;
  };

  return {
    title: "Coin Drop",
    hint: "Drop the coin",

    async load() {
      coinTex = coinTexture(theme);
      fit();
    },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      onRevealed = revealed;
      busy = false;
      build();
      if (reducedMotion) await gsap.fromTo(board, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(board!, { alpha: 0, y: 40 }, { alpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },

    async revealNow(fast) {
      await drop(fast); // returns the reveal already under way, if any
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      bob?.kill();
      const all = [board, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      if (coin) gsap.killTweensOf(coin);
      for (const row of pegs) for (const p of row) if (p) gsap.killTweensOf(p.scale);
      for (const g of binGlow) gsap.killTweensOf(g);
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      board = plate = coin = null;
      pegs = [];
      binGlow = [];
    },

    destroy() {
      bob?.kill();
      holder.destroy({ children: true });
      glow.destroy(true);
      coinTex?.destroy(true);
    },
  };
}
