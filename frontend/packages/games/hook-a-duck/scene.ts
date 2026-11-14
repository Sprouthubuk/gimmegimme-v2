import gsap from "gsap";
import { Container, Graphics, Sprite, type Texture, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { duckTexture, fitPlayfield, glowSprite, lookPick, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Hook a Duck: ducks drift round a neon water channel. Tap one to hook it; it lifts out and the ticket's
 * result (decided on the server) is shown. Which duck is hooked changes nothing.
 */
const W = 340;
const H = 380;
const LANES = [-90, 10, 110] as const;
const PER_LANE = 4;
const SPAN = W + 60;

export function createHookADuck(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let textures: Texture[] = [];
  let pond: Container | null = null;
  let waves: Graphics[] = [];
  let ducks: { s: Sprite; lane: number; off: number; dir: number }[] = [];
  let plate: Container | null = null;
  let hooked = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let t0 = 0;
  let flow = 0;
  const p = { y: 0 };

  const fit = () => fitPlayfield(stage, holder, H, W);
  stage.onResize(fit);

  const drawWaves = () => {
    waves.forEach((g, i) => {
      const y = LANES[i] + 26;
      g.clear().moveTo(-W / 2 + 14, y);
      for (let x = -W / 2 + 14; x <= W / 2 - 14; x += 8) g.lineTo(x, y + Math.sin(x / 18 + t0 * 2 + i) * 3);
      g.stroke({ width: 2, color: hex(i % 2 ? theme.neonA : theme.neonB), alpha: 0.65 });
    });
  };

  const swim = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    if (!pond) return;
    if (!reducedMotion) {
      if (!hooked) flow += tk.deltaTime * 0.6;
      drawWaves();
    }
    for (const d of ducks) {
      if (d.s.destroyed || (hooked && d.s.zIndex === 9)) continue;
      const raw = (d.off + flow * d.dir) % SPAN;
      const x = ((raw + SPAN) % SPAN) - SPAN / 2;
      d.s.x = x;
      d.s.y = LANES[d.lane] + (reducedMotion ? 0 : Math.sin(t0 * 2.2 + d.off) * 2.5);
      d.s.rotation = reducedMotion ? 0 : Math.sin(t0 * 1.7 + d.off) * 0.06;
    }
  };
  stage.app.ticker.add(swim);

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const hook = (d: (typeof ducks)[number], fast: boolean) => (running ??= hookOnce(d, fast));
  const hookOnce = async (d: (typeof ducks)[number], fast: boolean) => {
    if (hooked || !ticket || !pond) return;
    hooked = true;
    d.s.zIndex = 9;
    audio.play("button");
    // The hook drops on its line, catches the duck and lifts it.
    const line = new Graphics();
    const hk = new Graphics().arc(0, 0, 8, 0, Math.PI).stroke({ width: 3, color: 0xe9e4f2 });
    (d.s.parent ?? pond).addChild(line, hk);
    line.zIndex = hk.zIndex = 10;
    const top = -H / 2 + 10;
    p.y = top;
    const draw = () => { line.clear().moveTo(d.s.x, top).lineTo(d.s.x, p.y).stroke({ width: 2, color: 0xe9e4f2, alpha: 0.8 }); hk.position.set(d.s.x, p.y + 4); };
    const sp = fast || reducedMotion ? 0.35 : 1;
    await gsap.to(p, { y: d.s.y - 40, duration: 0.35 * sp, ease: "power2.in", onUpdate: draw });
    if (holder.destroyed) return;
    await gsap.to(p, { y: -H / 2 + 60, duration: 0.5 * sp, ease: "power2.out", onUpdate: () => { draw(); d.s.y = p.y + 40; } });
    if (holder.destroyed) return;
    audio.play("reveal");
    const at = stage.root.toLocal(pond.toGlobal({ x: d.s.x, y: d.s.y }));
    if (!reducedMotion) particles.burst({ x: at.x, y: at.y + 20, count: fast ? 10 : 26, texture: sparkle, tints: [hex(theme.neonB), 0xffffff], speed: [2, 6], size: [4, 10], life: [20, 40], gravity: 0.18 });
    gsap.to(pond, { alpha: 0.3, duration: fast ? 0.1 : 0.3 });
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(0, -10);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
    if (holder.destroyed) return;
  };

  return {
    title: "Hook a Duck",
    hint: "Hook a duck",

    async load() {
      textures = ["#FFD23F", theme.neonA, theme.neonB, "#7B5CFF", "#2BE38A"].map((c) => duckTexture(c));
      fit();
    },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      onRevealed = revealed;
      hooked = false;
      const pd = new Container();
      pond = pd;
      pd.sortableChildren = true;
      const frame = new Graphics().roundRect(-W / 2, -H / 2, W, H, 26).fill({ color: 0x0b0f1c }).stroke({ width: 2.5, color: hex(theme.neonB), alpha: 0.9 });
      pd.addChild(glowSprite(glow, theme.neonB, W * 1.6, H * 1.3, 0.15), frame);
      const water = new Container();
      water.sortableChildren = true;
      const mask = new Graphics().roundRect(-W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 23).fill({ color: 0xffffff });
      water.mask = mask;
      pd.addChild(mask, water);
      waves = LANES.map(() => new Graphics());
      for (const w of waves) { w.zIndex = 5; water.addChild(w); }
      drawWaves();
      ducks = [];
      LANES.forEach((_, lane) => {
        for (let k = 0; k < PER_LANE; k++) {
          const s = new Sprite(textures[(lane * 2 + k) % textures.length]);
          s.anchor.set(0.5, 0.62);
          s.width = s.height = 82;
          const dir = lane % 2 ? -1 : 1;
          if (dir < 0) s.scale.x *= -1;
          s.eventMode = "static";
          s.cursor = "pointer";
          s.zIndex = 1 + lane;
          const d = { s, lane, off: k * (SPAN / PER_LANE) + lane * 37, dir };
          s.on("pointertap", () => { void hook(d, false).then(() => onRevealed?.()); });
          water.addChild(s);
          ducks.push(d);
        }
      });
      holder.addChild(pd);
      if (reducedMotion) await gsap.fromTo(pd, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(pd, { alpha: 0, y: 40 }, { alpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },

    async revealNow(fast) {
      if (running) return running;
      const visible = ducks.filter((d) => Math.abs(d.s.x) < W / 2 - 40);
      await hook(visible[lookPick(visible.length)] ?? ducks[0], fast);
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      gsap.killTweensOf(p);
      const all = [pond, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      pond = plate = null;
      ducks = [];
      waves = [];
    },

    destroy() {
      gsap.killTweensOf(p);
      stage.app.ticker.remove(swim);
      holder.destroy({ children: true });
      glow.destroy(true);
      for (const t of textures) t.destroy(true);
    },
  };
}
