import gsap from "gsap";
import { Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { fitPlayfield, gemTexture, glowSprite, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex, type Theme } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Slots: three reels in a neon cabinet. A win lines up three crowns on the payline; a no-win shows a random
 * line that is never three of a kind (and nothing is arranged to look close). The line is chosen from the
 * result the server gave; the reels only show it.
 */
const SYM = 84;
const REEL_W = 92;
const STRIP = 22;
const FIELD_W = 336;
const FIELD_H = 400;
export const SYMBOLS = ["crown", "seven", "gem", "star", "bar"] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];
const WIN_SYMBOL: SlotSymbol = "crown";

/** The payline for this ticket. Exported for tests. */
export function paylineFor(t: GameTicket, rand: () => number = Math.random): SlotSymbol[] {
  if (t.result === "win") return [WIN_SYMBOL, WIN_SYMBOL, WIN_SYMBOL];
  const pick = () => SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
  for (;;) {
    const line = [pick(), pick(), pick()];
    if (!(line[0] === line[1] && line[1] === line[2])) return line;
  }
}

function symbolTexture(kind: SlotSymbol, theme: Theme): Texture {
  if (kind === "gem") return gemTexture(theme.neonB, 140);
  const s = 140;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.translate(s / 2, s / 2);
  g.shadowBlur = 16;
  if (kind === "seven") {
    g.shadowColor = theme.neonA;
    g.font = `400 100px ${theme.fonts.display}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const grad = g.createLinearGradient(0, -40, 0, 40);
    grad.addColorStop(0, "#FF8AD0"); grad.addColorStop(1, theme.neonA);
    g.fillStyle = grad;
    g.fillText("7", 0, 6);
    g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.7)"; g.strokeText("7", 0, 6);
  } else if (kind === "star") {
    g.shadowColor = theme.neonB;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 50; const a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
    const grad = g.createLinearGradient(0, -50, 0, 50);
    grad.addColorStop(0, "#C8FBFF"); grad.addColorStop(1, theme.neonB);
    g.fillStyle = grad; g.fill();
  } else if (kind === "bar") {
    g.shadowColor = "#7B5CFF";
    g.fillStyle = "#7B5CFF";
    g.beginPath(); g.roundRect(-52, -24, 104, 48, 12); g.fill();
    g.shadowBlur = 0;
    g.font = `400 34px ${theme.fonts.display}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText("BAR", 0, 2);
  } else {
    // Crown: the winning symbol, in gold (wins and money only).
    g.shadowColor = theme.gold;
    g.beginPath();
    g.moveTo(-50, 28); g.lineTo(-50, -18); g.lineTo(-25, 6); g.lineTo(0, -34); g.lineTo(25, 6); g.lineTo(50, -18); g.lineTo(50, 28); g.closePath();
    const grad = g.createLinearGradient(0, -34, 0, 28);
    grad.addColorStop(0, "#FFF1B8"); grad.addColorStop(1, theme.goldDeep);
    g.fillStyle = grad; g.fill();
    g.shadowBlur = 0;
    g.fillStyle = theme.neonA; [-25, 0, 25].forEach((x) => { g.beginPath(); g.arc(x, 14, 5, 0, Math.PI * 2); g.fill(); });
  }
  return Texture.from(c);
}

export function createSlots(ctx: ShellContext): GameScene {
  const { stage, theme, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  const tex = new Map<SlotSymbol, Texture>();
  let cabinet: Container | null = null;
  let reels: Container[] = [];
  let lever: Container | null = null;
  let plate: Container | null = null;
  let spun = false;
  let ticket: GameTicket | null = null;
  let line: SlotSymbol[] = [];
  let onRevealed: (() => void) | null = null;
  let lights: Graphics[] = [];
  let t0 = 0;

  const fit = () => fitPlayfield(stage, holder, FIELD_H, FIELD_W);
  stage.onResize(fit);
  const blink = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    lights.forEach((l, i) => { l.alpha = reducedMotion ? 0.8 : 0.3 + 0.7 * (Math.floor(t0 * (spun ? 12 : 3) + i) % 2); });
  };
  stage.app.ticker.add(blink);

  const strip = (target: SlotSymbol) => {
    // Random symbols for the blur, the target in the middle row at the end.
    const list: SlotSymbol[] = Array.from({ length: STRIP }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    list[STRIP - 2] = target;
    return list;
  };

  const build = () => {
    cabinet = new Container();
    const body = new Graphics()
      .roundRect(-FIELD_W / 2, -FIELD_H / 2, FIELD_W, FIELD_H, 30).fill({ color: 0x0d0a14 })
      .stroke({ width: 2.5, color: hex(theme.neonA), alpha: 0.9 });
    const glass = new Graphics().roundRect(-148, -SYM * 1.5 - 8, 296, SYM * 3 + 16, 18).fill({ color: 0x050407 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.15 });
    cabinet.addChild(glowSprite(glow, theme.neonA, FIELD_W * 1.6, FIELD_H * 1.3, 0.2), body, glass);
    const title = new Graphics().roundRect(-90, -FIELD_H / 2 + 14, 180, 34, 17).fill({ color: hex(theme.neonA), alpha: 0.18 }).stroke({ width: 1.5, color: hex(theme.neonA) });
    const name = new Text({ text: (ctx.config.competitionTitle ?? "Slots").toUpperCase(), style: { fontFamily: theme.fonts.display, fontSize: 16, fill: "#FFFFFF", align: "center" } });
    name.anchor.set(0.5);
    name.position.set(0, -FIELD_H / 2 + 31);
    if (name.width > 168) name.scale.set(168 / name.width);
    cabinet.addChild(title, name);
    lights = Array.from({ length: 12 }, (_, i) => {
      const l = new Graphics().circle(0, 0, 3.5).fill(i % 2 ? hex(theme.neonB) : 0xffffff);
      l.position.set(-FIELD_W / 2 + 30 + i * ((FIELD_W - 60) / 11), FIELD_H / 2 - 22);
      cabinet!.addChild(l);
      return l;
    });
    reels = [0, 1, 2].map((r) => {
      const col = new Container();
      col.position.set((r - 1) * (REEL_W + 6), 0);
      const mask = new Graphics().rect(-REEL_W / 2, -SYM * 1.5, REEL_W, SYM * 3).fill(0xffffff);
      const inner = new Container();
      inner.label = "strip";
      col.addChild(inner, mask);
      inner.mask = mask;
      cabinet!.addChild(col);
      return col;
    });
    // Payline and shading top/bottom.
    cabinet.addChild(new Graphics().rect(-150, -2, 300, 4).fill({ color: hex(theme.neonB), alpha: 0.65 }));
    cabinet.addChild(new Graphics().rect(-150, -SYM * 1.5, 300, SYM * 0.6).fill({ color: 0x000000, alpha: 0.45 }));
    cabinet.addChild(new Graphics().rect(-150, SYM * 0.9, 300, SYM * 0.6).fill({ color: 0x000000, alpha: 0.45 }));
    // Lever (tap or pull).
    lever = new Container();
    lever.position.set(FIELD_W / 2 + 8, -30);
    const arm = new Graphics().roundRect(-4, -70, 8, 70, 4).fill({ color: 0x8c879a });
    const knob = new Graphics().circle(0, -76, 15).fill(hex(theme.neonA)).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    lever.addChild(arm, knob);
    lever.eventMode = "static";
    lever.cursor = "pointer";
    lever.hitArea = { contains: (x: number, y: number) => x > -26 && x < 26 && y > -100 && y < 10 };
    lever.on("pointertap", () => { void spin(false).then(() => onRevealed?.()); });
    cabinet.addChild(lever);
    holder.addChild(cabinet);
  };

  const fill = (r: number, list: SlotSymbol[]) => {
    const inner = reels[r].getChildByLabel("strip") as Container;
    inner.removeChildren().forEach((c) => c.destroy());
    list.forEach((k, i) => {
      const s = new Sprite(tex.get(k)!);
      s.anchor.set(0.5);
      s.width = s.height = SYM * 0.86;
      s.position.set(0, i * SYM);
      inner.addChild(s);
    });
    inner.y = -SYM; // rows 0..2 showing, row 1 on the payline
    return inner;
  };

  const spin = async (fast: boolean) => {
    if (spun || !ticket || plate) return;
    spun = true;
    audio.play("button");
    if (lever && !reducedMotion) gsap.to(lever.scale, { y: -1, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.in" });
    const stops = reels.map((_, r) => {
      const inner = fill(r, strip(line[r]));
      const end = -(STRIP - 2) * SYM; // the target row onto the payline
      const d = fast || reducedMotion ? 0.35 + r * 0.1 : 1.1 + r * 0.35;
      return gsap.to(inner, { y: end, duration: d, ease: fast || reducedMotion ? "power2.out" : "back.out(0.9)", onComplete: () => audio.play("button") });
    });
    await Promise.all(stops);
    // Self-check: the payline shows exactly the line chosen for this result.
    const shown = reels.map((c) => {
      const inner = c.getChildByLabel("strip") as Container;
      return (inner.children[STRIP - 2] as Sprite).texture;
    });
    if (shown.some((t, r) => t !== tex.get(line[r]))) console.error(`Slots payline doesn't match ticket ${ticket.ticketNumber}`);
    spun = false;
    audio.play("reveal");
    if (ticket.result === "win" && !reducedMotion) {
      for (const c of reels) {
        const at = stage.root.toLocal(c.toGlobal({ x: 0, y: 0 }));
        particles.burst({ x: at.x, y: at.y, count: fast ? 6 : 14, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [1, 5], life: [20, 40], additive: true });
      }
    }
    if (cabinet) gsap.to(cabinet, { alpha: 0.35, duration: fast ? 0.1 : 0.4, delay: fast ? 0 : 0.3 });
    plate = prizePlate(theme, ticket, 260, 118);
    plate.position.set(0, 0);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
  };

  return {
    title: "Slots",
    hint: "Pull to spin",

    async load() {
      for (const k of SYMBOLS) tex.set(k, symbolTexture(k, theme));
      fit();
    },

    async present(t, _i, _n, revealed) {
      ticket = t;
      onRevealed = revealed;
      spun = false;
      line = paylineFor(t);
      build();
      // Start on a fixed, neutral resting view: no crowns, nothing that hints at the result.
      const rest: SlotSymbol[][] = [["star", "seven", "gem"], ["gem", "bar", "star"], ["seven", "star", "bar"]];
      reels.forEach((_, r) => fill(r, rest[r]));
      if (reducedMotion) await gsap.fromTo(cabinet, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(cabinet!, { alpha: 0, y: 40 }, { alpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },

    async revealNow(fast) {
      if (!plate) await spin(fast);
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      const all = [cabinet, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      for (const r of reels) gsap.killTweensOf(r.getChildByLabel("strip"));
      if (lever) gsap.killTweensOf(lever.scale);
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      cabinet = plate = lever = null;
      reels = [];
      lights = [];
    },

    destroy() {
      stage.app.ticker.remove(blink);
      holder.destroy({ children: true });
      glow.destroy(true);
      for (const t of tex.values()) t.destroy(true);
    },
  };
}
