import gsap from "gsap";
import { Container, Graphics, Text } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { fitPlayfield, glowSprite, lookPick, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";
import { SIZE, bingoBoard, hasLine, type BingoBoard } from "./board";

/**
 * Bingo Card: a 3×3 neon card. Tap to call the balls; matching numbers are dabbed. A full line is a win.
 * The card and the calls are built from the ticket's result (decided on the server) and checked before play.
 */
const W = 330;
const H = 420;
const CELL = 88;
const BALL_Y = -H / 2 + 76;
const GRID_Y = BALL_Y + 50;

export function createBingoCard(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let card: Container | null = null;
  let cells: { box: Graphics; label: Text; x: number; y: number; dab?: Graphics }[] = [];
  let tray: Container | null = null;
  let plate: Container | null = null;
  let board: BingoBoard | null = null;
  let busy = false;
  let done = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;

  const fit = () => fitPlayfield(stage, holder, H, W);
  stage.onResize(fit);
  const cellPos = (c: number) => ({ x: ((c % SIZE) - 1) * (CELL + 8), y: GRID_Y + Math.floor(c / SIZE) * (CELL + 8) + CELL / 2 });

  const ball = (n: number, color: string) => {
    const b = new Container();
    b.addChild(
      new Graphics().circle(0, 0, 22).fill({ color: hex(color) }).circle(0, 0, 14).fill({ color: 0xffffff }),
      new Graphics().ellipse(-8, -10, 6, 3).fill({ color: 0xffffff, alpha: 0.6 }),
    );
    const t = new Text({ text: String(n), style: { fontFamily: theme.fonts.display, fontSize: 16, fill: "#14101c" } });
    t.anchor.set(0.5);
    b.addChild(t);
    return b;
  };

  const build = (t: GameTicket) => {
    board = bingoBoard(t.result === "win", lookPick);
    if (hasLine(new Set(board.marked)) !== (t.result === "win")) console.error("Bingo Card: card does not match the ticket's result");
    card = new Container();
    const frame = new Graphics().roundRect(-W / 2, -H / 2, W, H, 26).fill({ color: 0x0d0a14 }).stroke({ width: 2.5, color: hex(theme.neonA), alpha: 0.9 });
    const chute = new Graphics().roundRect(-W / 2 + 18, BALL_Y - 30, W - 36, 60, 30).fill({ color: 0x15111d }).stroke({ width: 1.5, color: hex(theme.neonB), alpha: 0.7 });
    const head = new Text({ text: "BINGO", style: { fontFamily: theme.fonts.display, fontSize: 22, fill: theme.gold, letterSpacing: 6 } });
    head.anchor.set(0.5);
    head.position.set(0, -H / 2 + 22);
    card.addChild(glowSprite(glow, theme.neonA, W * 1.6, H * 1.3, 0.16), frame, head, chute);
    tray = new Container();
    card.addChild(tray);
    cells = board.numbers.map((n, c) => {
      const { x, y } = cellPos(c);
      const box = new Graphics().roundRect(x - CELL / 2, y - CELL / 2, CELL, CELL, 16).fill({ color: 0x1a1324 }).stroke({ width: 2, color: hex(theme.neonB), alpha: 0.55 });
      const label = new Text({ text: String(n), style: { fontFamily: theme.fonts.display, fontSize: 34, fill: "#F3EEFF" } });
      label.anchor.set(0.5);
      label.position.set(x, y);
      card!.addChild(box, label);
      return { box, label, x, y };
    });
    card.eventMode = "static";
    card.cursor = "pointer";
    card.hitArea = { contains: (x: number, y: number) => Math.abs(x) < W / 2 && Math.abs(y) < H / 2 };
    card.on("pointertap", () => { if (!busy && !done) void call(false).then(() => onRevealed?.()); });
    holder.addChild(card);
  };

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const call = (fast: boolean) => (running ??= callOnce(fast));
  const callOnce = async (fast: boolean) => {
    if (busy || done || !board || !card || !tray || !ticket) return;
    busy = true;
    const quick = fast || reducedMotion;
    const colours = [theme.neonA, theme.neonB, "#7B5CFF", "#2BE38A", "#FF8A1F", theme.gold];
    for (let i = 0; i < board.calls.length; i++) {
      const n = board.calls[i];
      const b = ball(n, colours[i % colours.length]);
      const slot = -W / 2 + 46 + i * 47;
      tray.addChild(b);
      audio.play("button");
      if (quick) b.position.set(slot, BALL_Y);
      else {
        b.position.set(W / 2 + 30, BALL_Y);
        await gsap.to(b, { x: slot, rotation: -4, duration: 0.45, ease: "power2.out" });
        if (holder.destroyed) return;
        b.rotation = 0;
      }
      const c = board.numbers.indexOf(n);
      if (c >= 0) {
        const cell = cells[c];
        const dab = new Graphics().circle(cell.x, cell.y, CELL * 0.38).fill({ color: hex(theme.neonA), alpha: 0.85 });
        card.addChildAt(dab, card.getChildIndex(cell.label));
        cell.dab = dab;
        cell.label.style.fill = "#ffffff";
        if (!quick) {
          dab.scale.set(0.2);
          dab.pivot.set(cell.x, cell.y);
          dab.position.set(cell.x, cell.y);
          await gsap.to(dab.scale, { x: 1, y: 1, duration: 0.22, ease: "back.out(2)" });
          if (holder.destroyed) return;
        }
      }
      if (!quick) await gsap.to({}, { duration: 0.15 });
      if (holder.destroyed) return;
    }
    done = true;
    audio.play("reveal");
    if (board.line) {
      const a = cells[board.line[0]];
      const z = cells[board.line[2]];
      for (const c of board.line) {
        const cell = cells[c];
        cell.box.clear().roundRect(cell.x - CELL / 2, cell.y - CELL / 2, CELL, CELL, 16).fill({ color: 0x2a2108 }).stroke({ width: 3, color: hex(theme.gold) });
        cell.dab?.clear().circle(cell.x, cell.y, CELL * 0.38).fill({ color: hex(theme.gold) });
        cell.label.style.fill = "#2a1a00";
      }
      if (!quick) {
        await gsap.fromTo(board.line.map((c) => cells[c].box), { alpha: 0.3 }, { alpha: 1, duration: 0.15, repeat: 3, yoyo: true });
        if (holder.destroyed) return;
        const at = stage.root.toLocal(card.toGlobal({ x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }));
        particles.burst({ x: at.x, y: at.y, count: 26, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 7], size: [5, 11], life: [25, 50], additive: true });
      }
    }
    await gsap.to(card, { alpha: 0.32, duration: fast ? 0.1 : 0.35, delay: quick ? 0 : 0.35 });
    if (holder.destroyed) return;
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(0, 20);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
    if (holder.destroyed) return;
    busy = false;
  };

  return {
    title: "Bingo Card",
    hint: "Call the balls",

    async load() { fit(); },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      onRevealed = revealed;
      busy = done = false;
      build(t);
      if (reducedMotion) await gsap.fromTo(card, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(card!, { alpha: 0, y: 40 }, { alpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },

    async revealNow(fast) {
      await call(fast); // returns the reveal already under way, if any
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      const all = [card, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      card = tray = plate = null;
      cells = [];
      board = null;
    },

    destroy() {
      holder.destroy({ children: true });
      glow.destroy(true);
    },
  };
}
