import gsap from "gsap";
import { Container, Sprite, type Texture, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { balloonTexture, fitPlayfield, glowSprite, lookPick, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Balloon Pop: glossy balloons bob on the stage; the player taps one, it bursts, and the ticket's result
 * (decided on the server) rises out of it. Which balloon is tapped changes nothing.
 */
const FIELD_W = 360;
const FIELD_H = 420;
const SPOTS = [[-110, -100], [0, -125], [110, -100], [-110, 60], [0, 35], [110, 60]] as const;

export function createBalloonPop(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let textures: Texture[] = [];
  let balloons: { s: Sprite; base: number; phase: number; halo: Sprite }[] = [];
  let plate: Container | null = null;
  let picked = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let t0 = 0;

  const fit = () => fitPlayfield(stage, holder, FIELD_H, FIELD_W);
  stage.onResize(fit);

  const bob = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    if (reducedMotion) return;
    for (const b of balloons) {
      b.s.y = b.base + Math.sin(t0 * 1.4 + b.phase) * 6;
      b.s.rotation = Math.sin(t0 * 1.1 + b.phase) * 0.05;
      b.halo.position.set(b.s.x, b.s.y - 14);
    }
  };
  stage.app.ticker.add(bob);

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const pop = (i: number, fast: boolean) => (running ??= popOnce(i, fast));
  const popOnce = async (i: number, fast: boolean) => {
    if (picked || !ticket) return;
    picked = true;
    const b = balloons[i];
    audio.play("reveal");
    const at = stage.root.toLocal(holder.toGlobal({ x: b.s.x, y: b.s.y - 14 }));
    if (!reducedMotion) particles.burst({ x: at.x, y: at.y, count: fast ? 14 : 34, texture: sparkle, tints: [b.s.tint as number, 0xffffff], speed: [3, 9], size: [5, 12], life: [20, 45], gravity: 0.15, flutter: true });
    await gsap.to(b.s.scale, { x: b.s.scale.x * 1.25, y: b.s.scale.y * 1.25, duration: fast ? 0.05 : 0.09, ease: "power2.out" });
    if (holder.destroyed) return;
    b.s.visible = false;
    b.halo.visible = false;
    for (const o of balloons) if (o !== b) gsap.to([o.s, o.halo], { alpha: 0.18, duration: fast ? 0.15 : 0.35 });
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(b.s.x, b.s.y - 14);
    holder.addChild(plate);
    const show = showPlate(plate, reducedMotion, fast);
    const move = gsap.to(plate, { x: 0, y: -10, duration: fast ? 0.2 : 0.5, ease: "power3.out" });
    await Promise.all([show, move]);
    if (holder.destroyed) return;
  };

  return {
    title: "Balloon Pop",
    hint: "Pop a balloon",

    async load() {
      const colours = [theme.neonA, theme.neonB, theme.gold === "#F5C542" ? "#7B5CFF" : theme.gold, ...theme.bokeh];
      textures = colours.slice(0, 6).map((c) => balloonTexture(c));
      fit();
    },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      picked = false;
      onRevealed = revealed;
      balloons = SPOTS.map(([x, y], i) => {
        const halo = glowSprite(glow, [theme.neonA, theme.neonB][i % 2], 150, 170, 0.22);
        const s = new Sprite(textures[i % textures.length]);
        s.anchor.set(0.5, 0.42);
        s.width = 104;
        s.height = 148;
        s.position.set(x, y + 240);
        s.eventMode = "static";
        s.cursor = "pointer";
        s.on("pointertap", () => { void pop(i, false).then(() => onRevealed?.()); });
        holder.addChild(halo, s);
        return { s, base: y, phase: i * 1.3, halo };
      });
      await Promise.all(balloons.map((b, i) => reducedMotion
        ? (b.s.y = b.base, gsap.fromTo(b.s, { alpha: 0 }, { alpha: 1, duration: 0.2 }))
        : gsap.to(b.s, { y: b.base, duration: 0.7, delay: i * 0.05, ease: "back.out(1.4)" })));
    },

    async revealNow(fast) {
      await (running ?? pop(lookPick(balloons.length), fast));
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      const at = stage.root.toLocal(holder.toGlobal({ x: plate.x, y: plate.y }));
      particles.burst({ x: at.x, y: at.y, count: 30, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 7], size: [5, 12], life: [30, 60], additive: true });
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" });
    },

    async dismiss(_won, fast) {
      const all = [...balloons.flatMap((b) => [b.s, b.halo]), ...(plate ? [plate] : [])];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      gsap.killTweensOf(all);
      for (const o of all) o.destroy({ children: true });
      balloons = [];
      plate = null;
    },

    destroy() {
      stage.app.ticker.remove(bob);
      gsap.killTweensOf(holder.children);
      holder.destroy({ children: true });
      glow.destroy(true);
      for (const t of textures) t.destroy(true);
    },
  };
}
