import gsap from "gsap";
import { Container, Graphics, Sprite, type FederatedPointerEvent, type Texture, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { capsuleTexture, fitPlayfield, glowSprite, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Claw Machine: a glass cabinet of prize capsules. The player slides the claw and drops it; it always grabs
 * a capsule and brings it to the chute, where the capsule opens on the ticket's result (decided on the
 * server). A no-win capsule is simply empty: the claw never "nearly" wins or drops a prize on purpose.
 */
const W = 330;
const H = 420;
const TOP = -H / 2 + 44;
const PILE_Y = H / 2 - 70;
const CHUTE_X = -W / 2 + 46;

export function createClawMachine(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let capTex: Texture[] = [];
  let cabinet: Container | null = null;
  let claw: Container | null = null;
  let cable: Graphics | null = null;
  let prongs: Graphics[] = [];
  let capsules: Sprite[] = [];
  let plate: Container | null = null;
  let busy = false;
  let dragging = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let t0 = 0;
  let idle = true;
  const grip = { v: 1 };

  const fit = () => fitPlayfield(stage, holder, H, W);
  stage.onResize(fit);

  const drawCable = () => { if (cable && claw) cable.clear().moveTo(claw.x, TOP - 26).lineTo(claw.x, claw.y - 18).stroke({ width: 2, color: 0xb9afc6, alpha: 0.8 }); };
  const setOpen = (open: number) => prongs.forEach((p, i) => { p.rotation = (i - 1) * (0.25 + open * 0.45); });

  const sway = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    if (claw && idle && !dragging && !busy && !reducedMotion) {
      claw.x = Math.sin(t0 * 0.8) * (W / 2 - 70);
      drawCable();
    }
  };
  stage.app.ticker.add(sway);

  const build = () => {
    cabinet = new Container();
    const frame = new Graphics()
      .roundRect(-W / 2, -H / 2, W, H, 26).fill({ color: 0x0d0a14 })
      .stroke({ width: 2.5, color: hex(theme.neonB), alpha: 0.9 });
    const glass = new Graphics().roundRect(-W / 2 + 12, -H / 2 + 12, W - 24, H - 24, 18).fill({ color: 0x1a1324, alpha: 0.55 });
    const shine = new Graphics().poly([-W / 2 + 30, -H / 2 + 16, -W / 2 + 70, -H / 2 + 16, -W / 2 + 18, H / 2 - 40, -W / 2 + 18, H / 2 - 120]).fill({ color: 0xffffff, alpha: 0.05 });
    const rail = new Graphics().rect(-W / 2 + 20, TOP - 34, W - 40, 6).fill({ color: 0x5c5568 });
    const chute = new Graphics().roundRect(CHUTE_X - 32, PILE_Y - 40, 64, 90, 10).fill({ color: 0x050407 }).stroke({ width: 1.5, color: hex(theme.neonA), alpha: 0.8 });
    const floor = new Graphics().roundRect(-W / 2 + 14, PILE_Y + 26, W - 28, 30, 10).fill({ color: 0x000000, alpha: 0.5 });
    cabinet.addChild(glowSprite(glow, theme.neonB, W * 1.6, H * 1.3, 0.18), frame, glass, shine, rail, floor, chute);
    // The pile: capsules in two loose rows to the right of the chute.
    capsules = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const s = new Sprite(capTex[(i + row * 2) % capTex.length]);
        s.anchor.set(0.5);
        s.width = s.height = 50;
        s.position.set(-W / 2 + 108 + i * 40 + (row ? 20 : 0), PILE_Y - row * 32 + ((i * 7) % 5));
        s.rotation = ((i * 37 + row * 11) % 10) / 10 - 0.5;
        cabinet.addChild(s);
        capsules.push(s);
      }
    }
    cable = new Graphics();
    claw = new Container();
    claw.position.set(40, TOP);
    const head = new Graphics().roundRect(-20, -26, 40, 20, 8).fill({ color: 0xcfc8dc }).stroke({ width: 1.5, color: hex(theme.neonA) });
    prongs = [-1, 0, 1].map(() => {
      const p = new Graphics().roundRect(-3, 0, 6, 34, 3).fill({ color: 0xcfc8dc });
      p.position.set(0, -8);
      return p;
    });
    claw.addChild(...prongs, head, glowSprite(glow, theme.neonA, 60, 40, 0.3));
    setOpen(1);
    cabinet.addChild(cable, claw);
    drawCable();
    // Slide the claw by dragging anywhere in the cabinet.
    cabinet.eventMode = "static";
    cabinet.hitArea = { contains: (x: number, y: number) => Math.abs(x) < W / 2 && Math.abs(y) < H / 2 };
    const toX = (e: FederatedPointerEvent) => Math.max(-W / 2 + 70, Math.min(W / 2 - 40, cabinet!.toLocal(e.global).x));
    cabinet.on("pointerdown", (e: FederatedPointerEvent) => { if (busy || !claw) return; dragging = true; idle = false; claw.x = toX(e); drawCable(); });
    cabinet.on("globalpointermove", (e: FederatedPointerEvent) => { if (dragging && claw && !busy) { claw.x = toX(e); drawCable(); } });
    const release = () => { if (dragging) { dragging = false; void drop(false).then(() => onRevealed?.()); } };
    cabinet.on("pointerup", release);
    cabinet.on("pointerupoutside", release);
    holder.addChild(cabinet);
  };

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const drop = (fast: boolean) => (running ??= dropOnce(fast));
  const dropOnce = async (fast: boolean) => {
    if (busy || !claw || !ticket || plate) return;
    busy = true;
    audio.play("button");
    const c = claw;
    // The capsule nearest the claw.
    const target = capsules.reduce((a, b) => (Math.abs(b.x - c.x) < Math.abs(a.x - c.x) ? b : a));
    const sp = fast || reducedMotion ? 0.35 : 1;
    const onUpdate = drawCable;
    await gsap.to(c, { x: target.x, duration: 0.3 * sp, ease: "power1.inOut", onUpdate });
    if (holder.destroyed) return;
    await gsap.to(c, { y: target.y - 28, duration: 0.7 * sp, ease: "power2.in", onUpdate });
    if (holder.destroyed) return;
    grip.v = 1;
    await gsap.to(grip, { v: 0, duration: 0.25 * sp, onUpdate: () => setOpen(grip.v) });
    if (holder.destroyed) return;
    // Lift with the capsule.
    const dy = target.y - c.y;
    await gsap.to(c, { y: TOP, duration: 0.7 * sp, ease: "power2.out", onUpdate: () => { target.y = c.y + dy; target.x = c.x; target.rotation *= 0.9; drawCable(); } });
    if (holder.destroyed) return;
    await gsap.to(c, { x: CHUTE_X, duration: 0.6 * sp, ease: "power1.inOut", onUpdate: () => { target.x = c.x; drawCable(); } });
    if (holder.destroyed) return;
    await gsap.to(grip, { v: 1, duration: 0.2 * sp, onUpdate: () => setOpen(grip.v) });
    if (holder.destroyed) return;
    await gsap.to(target, { y: PILE_Y - 10, duration: 0.35 * sp, ease: "bounce.out" });
    if (holder.destroyed) return;
    // The capsule opens on the result.
    audio.play("reveal");
    const at = stage.root.toLocal(cabinet!.toGlobal({ x: target.x, y: target.y }));
    if (!reducedMotion) particles.burst({ x: at.x, y: at.y, count: fast ? 12 : 30, texture: sparkle, tints: [target.tint as number, 0xffffff, hex(theme.neonA)], speed: [2, 7], size: [5, 11], life: [20, 45], gravity: 0.08, additive: true });
    target.visible = false;
    gsap.to(cabinet!, { alpha: 0.35, duration: fast ? 0.1 : 0.3 });
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(0, -20);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
    if (holder.destroyed) return;
    busy = false;
  };

  return {
    title: "Claw Machine",
    hint: "Drop the claw",

    async load() {
      capTex = [theme.neonA, theme.neonB, "#7B5CFF", "#2BE38A", "#FF8A1F"].map((c) => capsuleTexture(c));
      fit();
    },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      onRevealed = revealed;
      busy = false;
      idle = true;
      build();
      if (reducedMotion) await gsap.fromTo(cabinet, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(cabinet!, { alpha: 0, y: 40 }, { alpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },

    async revealNow(fast) {
      await drop(fast); // returns the reveal already under way, if any
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      const at = stage.root.toLocal(holder.toGlobal({ x: 0, y: plate.y }));
      particles.burst({ x: at.x, y: at.y, count: 30, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 7], size: [5, 12], life: [30, 60], additive: true });
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      gsap.killTweensOf(grip);
      const all = [cabinet, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      for (const o of [claw, ...capsules].filter(Boolean)) gsap.killTweensOf(o);
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      cabinet = claw = plate = null;
      cable = null;
      capsules = [];
      prongs = [];
    },

    destroy() {
      gsap.killTweensOf(grip);
      stage.app.ticker.remove(sway);
      holder.destroy({ children: true });
      glow.destroy(true);
      for (const t of capTex) t.destroy(true);
    },
  };
}
