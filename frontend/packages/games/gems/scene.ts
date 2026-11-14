import gsap from "gsap";
import { Container, Graphics, Sprite, type Texture, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { fitPlayfield, gemTexture, glassPanel, glowSprite, lookPick, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Gems: nine cut gems on a velvet tray. The player picks one; it lifts, turns, and bursts into light to show
 * the ticket's result (decided on the server). Which gem is picked changes nothing.
 */
const FIELD_W = 340;
const FIELD_H = 380;
const CELL = 100;

export function createGems(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let gemTex: Texture[] = [];
  let tray: Graphics | null = null;
  let gems: { s: Sprite; halo: Sprite; x: number; y: number }[] = [];
  let plate: Container | null = null;
  let picked = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let t0 = 0;

  const fit = () => fitPlayfield(stage, holder, FIELD_H, FIELD_W);
  stage.onResize(fit);

  // Each gem breathes and catches the light in turn.
  const shimmer = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    if (reducedMotion || picked) return;
    gems.forEach((g, i) => {
      const k = 0.5 + 0.5 * Math.sin(t0 * 2 + i * 0.7);
      g.halo.alpha = 0.12 + 0.18 * k;
      g.s.scale.set(g.s.scale.x > 0 ? 0.58 + 0.015 * k : g.s.scale.x);
    });
  };
  stage.app.ticker.add(shimmer);

  const pick = async (i: number, fast: boolean) => {
    if (picked || !ticket) return;
    picked = true;
    const g = gems[i];
    audio.play("button");
    for (const o of gems) if (o !== g) gsap.to([o.s, o.halo], { alpha: 0.15, duration: fast ? 0.12 : 0.3 });
    if (!reducedMotion) {
      // Lift to the centre and turn (a flip on its vertical axis).
      await gsap.to(g.s, { x: 0, y: -20, duration: fast ? 0.18 : 0.42, ease: "power3.out" });
      g.halo.position.set(0, -20);
      await gsap.to(g.s.scale, { x: -0.7, y: 0.7, duration: fast ? 0.12 : 0.32, ease: "sine.inOut", yoyo: true, repeat: 1 });
    }
    audio.play("reveal");
    const at = stage.root.toLocal(holder.toGlobal({ x: g.s.x, y: g.s.y }));
    if (!reducedMotion) particles.burst({ x: at.x, y: at.y, count: fast ? 16 : 40, texture: sparkle, tints: [g.s.tint as number, 0xffffff, hex(theme.neonB)], speed: [3, 10], size: [5, 13], life: [20, 50], gravity: 0.05, additive: true });
    g.s.visible = false;
    g.halo.visible = false;
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(g.s.x, g.s.y);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
  };

  return {
    title: "Gems",
    hint: "Pick a gem",

    async load() {
      const colours = ["#E0115F", "#1FD6FF", "#7B5CFF", "#2BE38A", "#FF2DAA", "#4D7CFF"];
      gemTex = colours.map((c) => gemTexture(c));
      fit();
    },

    async present(t, _i, _n, revealed) {
      ticket = t;
      picked = false;
      onRevealed = revealed;
      tray = glassPanel(FIELD_W, FIELD_H, theme, 28);
      // Velvet: a deep inner panel with a soft vignette.
      tray.roundRect(-FIELD_W / 2 + 12, -FIELD_H / 2 + 12, FIELD_W - 24, FIELD_H - 24, 20).fill({ color: hex(theme.cardTop), alpha: 0.85 });
      holder.addChild(tray);
      gems = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const i = r * 3 + c;
        const x = (c - 1) * CELL;
        const y = (r - 1) * CELL + 6;
        const halo = glowSprite(glow, theme.neonB, 120, 120, 0.15);
        halo.position.set(x, y);
        const s = new Sprite(gemTex[(i * 5) % gemTex.length]);
        s.anchor.set(0.5);
        s.scale.set(0.58);
        s.position.set(x, y);
        s.eventMode = "static";
        s.cursor = "pointer";
        s.on("pointertap", () => { void pick(i, false).then(() => onRevealed?.()); });
        holder.addChild(halo, s);
        gems.push({ s, halo, x, y });
      }
      const all = [tray, ...gems.flatMap((g) => [g.s, g.halo])];
      if (reducedMotion) await gsap.fromTo(all, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else {
        await Promise.all([
          gsap.fromTo(tray, { alpha: 0, y: 30 }, { alpha: 1, y: 0, duration: 0.4, ease: "power3.out" }),
          ...gems.map((g, i) => gsap.fromTo(g.s, { alpha: 0, y: g.y - 30 }, { alpha: 1, y: g.y, duration: 0.45, delay: 0.1 + i * 0.03, ease: "back.out(2)" })),
        ]);
      }
    },

    async revealNow(fast) {
      if (!picked) await pick(lookPick(gems.length), fast);
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      const at = stage.root.toLocal(holder.toGlobal({ x: plate.x, y: plate.y }));
      particles.burst({ x: at.x, y: at.y, count: 30, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 7], size: [5, 12], life: [30, 60], additive: true });
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" });
    },

    async dismiss(_won, fast) {
      const all = [...(tray ? [tray] : []), ...gems.flatMap((g) => [g.s, g.halo]), ...(plate ? [plate] : [])];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      gsap.killTweensOf(all);
      for (const g of gems) gsap.killTweensOf(g.s.scale);
      for (const o of all) o.destroy({ children: true });
      gems = [];
      tray = null;
      plate = null;
    },

    destroy() {
      stage.app.ticker.remove(shimmer);
      holder.destroy({ children: true });
      glow.destroy(true);
      for (const t of gemTex) t.destroy(true);
    },
  };
}
