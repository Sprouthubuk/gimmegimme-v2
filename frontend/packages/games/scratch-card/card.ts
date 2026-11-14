import gsap from "gsap";
import { Assets, Container, Graphics, RenderTexture, Sprite, Text, Texture, type FederatedPointerEvent } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { brushTexture, foilTexture, glowTexture, sweepTexture } from "../shared/textures";
import { hex, type Theme } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * The premium scratch card. One card per ticket on a lit stage. The prize window is covered by procedural
 * brushed foil held in a RenderTexture; the player's brush erases it. Once ~55% of the window is clear the
 * rest dissolves with a shimmer. The card only shows the result it was given.
 */

const CARD_W = 300;
const CARD_H = 410;
const WIN = { x: 24, y: 142, w: 252, h: 182, r: 18 };
const AUTO_REVEAL = 0.55;
const GRID_X = 24;
const GRID_Y = 14;

const money = (n: number) => `£${n.toFixed(2)}`;

/** The card face: deep gradient, inner bevel, faint pattern. Drawn once per theme. */
function cardFaceTexture(theme: Theme): Texture {
  const k = 2;
  const c = document.createElement("canvas");
  c.width = CARD_W * k;
  c.height = CARD_H * k;
  const g = c.getContext("2d")!;
  g.scale(k, k);
  const r = 26;
  const path = () => { g.beginPath(); g.roundRect(0, 0, CARD_W, CARD_H, r); };
  const grad = g.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  grad.addColorStop(0, theme.cardTop);
  grad.addColorStop(1, theme.cardBottom);
  path();
  g.fillStyle = grad;
  g.fill();
  g.save();
  path();
  g.clip();
  // Faint guilloché rings, like a security print.
  g.strokeStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(CARD_W / 2, 70, 30 + i * 9, 18 + i * 6, 0, 0, Math.PI * 2); g.stroke(); }
  // Top sheen.
  const sheen = g.createLinearGradient(0, 0, 0, 120);
  sheen.addColorStop(0, "rgba(255,255,255,0.10)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, CARD_W, 120);
  g.restore();
  // Inner bevel and rim.
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(255,255,255,0.10)";
  g.beginPath(); g.roundRect(6, 6, CARD_W - 12, CARD_H - 12, r - 6); g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = theme.cardRim;
  path();
  g.stroke();
  // The prize window's recess.
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath(); g.roundRect(WIN.x - 4, WIN.y - 4, WIN.w + 8, WIN.h + 8, WIN.r + 4); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 1;
  g.stroke();
  // Footer: a hairline, a serial "barcode" and a fairness mark, like a printed security ticket.
  const fy = WIN.y + WIN.h + 26;
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.beginPath(); g.moveTo(24, fy - 10); g.lineTo(CARD_W - 24, fy - 10); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.22)";
  let x = 26;
  let seed = 7;
  while (x < 118) { seed = (seed * 9301 + 49297) % 233280; const bw = 1 + (seed % 3); g.fillRect(x, fy + 4, bw, 30); x += bw + 1 + ((seed >> 3) % 3); }
  g.font = `900 10px ${theme.fonts.ui}`;
  g.textAlign = "right";
  g.textBaseline = "middle";
  g.fillStyle = theme.neonB;
  g.fillText("VERIFIED BY VERITY", CARD_W - 26, fy + 12);
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillText("FIXED AT PURCHASE", CARD_W - 26, fy + 28);
  return Texture.from(c);
}

export function createScratchCard(ctx: ShellContext): GameScene {
  const { stage, theme, config, reducedMotion, audio, particles, sparkle } = ctx;
  const glow = glowTexture(256, 0.4);
  const brush = brushTexture(64);
  const sweep = sweepTexture(120, 512);
  let face: Texture;
  let foil: Texture;
  const owned: Texture[] = [glow, brush, sweep];

  const holder = new Container(); // positioned at the focus; scaled to fit the screen
  const reflection = new Graphics();
  stage.scene.addChild(reflection, holder);

  let card: Container | null = null;
  let rt: RenderTexture | null = null;
  let foilSprite: Sprite | null = null;
  let winGlow: Sprite | null = null;
  let covered = new Uint8Array(GRID_X * GRID_Y);
  let clearedCells = 0;
  let scratching = false;
  let last: { x: number; y: number } | null = null;
  let done = false;
  let onRevealed: (() => void) | null = null;
  let sparkleTick = 0;
  // The brush rubs out the foil: drawn into the foil texture with the "erase" blend. It sits in its own
  // container because a blend mode on the object handed straight to render() is ignored.
  const stamp = new Sprite(brush);
  stamp.anchor.set(0.5);
  stamp.blendMode = "erase";
  const stampLayer = new Container();
  stampLayer.addChild(stamp);

  const fit = () => {
    // Leave room for the top bar (~76) and the bottom panel with its hint (~190).
    const room = stage.size.h - 76 - 190;
    const scale = Math.max(0.62, Math.min(1, room / (CARD_H + 20)));
    holder.scale.set(scale);
    stage.focus.y = 76 + room / 2 + 6;
    stage.focus.hintY = stage.focus.y + (CARD_H / 2) * scale + 14;
    holder.position.set(stage.focus.x, stage.focus.y);
    reflection.clear();
    const w = CARD_W * scale;
    const yb = stage.focus.y + (CARD_H / 2) * scale;
    reflection.roundRect(stage.focus.x - w / 2 + 10, yb + 6, w - 20, 26, 12).fill({ color: hex(theme.cardRim), alpha: 0.07 });
    reflection.ellipse(stage.focus.x, yb + 18, w * 0.55, 10).fill({ color: 0x000000, alpha: 0.35 });
  };
  stage.onResize(fit);

  const buildCard = (t: GameTicket, index: number, total: number): Container => {
    const c = new Container();
    c.pivot.set(CARD_W / 2, CARD_H / 2);
    // Neon rim glow behind the card.
    const halo = new Sprite(glow);
    halo.anchor.set(0.5);
    halo.position.set(CARD_W / 2, CARD_H / 2);
    halo.width = CARD_W * 1.7;
    halo.height = CARD_H * 1.45;
    halo.tint = hex(theme.cardRim);
    halo.alpha = 0.28;
    halo.blendMode = "add";
    const body = new Sprite(face);
    body.width = CARD_W; // the face is drawn at 2x for sharpness
    body.height = CARD_H;
    c.addChild(halo, body);

    const title = new Text({ text: (config.competitionTitle ?? theme.title).toUpperCase(), style: { fontFamily: theme.fonts.display, fontSize: 24, fill: theme.text, align: "center", wordWrap: true, wordWrapWidth: CARD_W - 48, lineHeight: 26, dropShadow: { color: hex(theme.neonA), blur: 10, distance: 0, alpha: 0.8 } } });
    title.anchor.set(0.5, 0);
    title.position.set(CARD_W / 2, 26);
    if (title.height > 60) title.scale.set(60 / title.height);
    const no = new Text({ text: `${theme.labels.ticket.toUpperCase()} #${t.ticketNumber}  ·  ${index + 1} OF ${total}`, style: { fontFamily: theme.fonts.ui, fontWeight: "900", fontSize: 11, letterSpacing: 2, fill: theme.muted } });
    no.anchor.set(0.5, 0);
    no.position.set(CARD_W / 2, 112);
    c.addChild(title, no);

    // What's under the foil: exactly the result given.
    winGlow = new Sprite(glow);
    winGlow.anchor.set(0.5);
    winGlow.position.set(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2);
    winGlow.width = WIN.w * 1.6;
    winGlow.height = WIN.h * 1.9;
    winGlow.tint = hex(theme.gold);
    winGlow.alpha = 0;
    winGlow.blendMode = "add";
    const under = new Container();
    under.position.set(WIN.x, WIN.y);
    const bed = new Graphics().roundRect(0, 0, WIN.w, WIN.h, WIN.r).fill({ color: 0x050407, alpha: 0.9 });
    under.addChild(bed);
    if (t.result === "win" && t.prize) {
      const lbl = new Text({ text: t.prize.label, style: { fontFamily: theme.fonts.display, fontSize: 22, fill: theme.text, align: "center", wordWrap: true, wordWrapWidth: WIN.w - 24, lineHeight: 24 } });
      lbl.anchor.set(0.5);
      lbl.position.set(WIN.w / 2, WIN.h * 0.33);
      if (lbl.height > 52) lbl.scale.set(52 / lbl.height);
      const val = new Text({ text: money(t.prize.value), style: { fontFamily: theme.fonts.display, fontSize: 46, fill: theme.gold, stroke: { color: theme.goldDeep, width: 2 }, dropShadow: { color: hex(theme.gold), blur: 14, distance: 0, alpha: 0.7 } } });
      val.anchor.set(0.5);
      val.position.set(WIN.w / 2, WIN.h * 0.7);
      under.addChild(lbl, val);
    } else {
      const lose = new Text({ text: theme.labels.noWin, style: { fontFamily: theme.fonts.display, fontSize: 24, fill: theme.muted, align: "center" } });
      lose.anchor.set(0.5);
      lose.position.set(WIN.w / 2, WIN.h / 2);
      under.addChild(lose);
    }
    c.addChild(winGlow, under);

    // The foil, in a texture the brush erases.
    rt?.destroy(true);
    rt = RenderTexture.create({ width: WIN.w, height: WIN.h, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    const paint = new Container();
    const f = new Sprite(foil);
    f.width = WIN.w;
    f.height = WIN.h;
    const m = new Graphics().roundRect(0, 0, WIN.w, WIN.h, WIN.r).fill(0xffffff);
    f.mask = m;
    paint.addChild(f, m);
    stage.app.renderer.render({ container: paint, target: rt, clear: true });
    paint.destroy({ children: true });
    foilSprite = new Sprite(rt);
    foilSprite.position.set(WIN.x, WIN.y);
    foilSprite.eventMode = "static";
    foilSprite.cursor = "grab";
    foilSprite.on("pointerdown", down);
    c.addChild(foilSprite);
    return c;
  };

  // ---- Scratching ----
  const local = (e: FederatedPointerEvent) => foilSprite!.toLocal(e.global);
  const erase = (x: number, y: number) => {
    if (!rt) return;
    const r = 26;
    stamp.position.set(x, y);
    stamp.width = stamp.height = r * 2;
    stage.app.renderer.render({ container: stampLayer, target: rt, clear: false });
    // Coverage on a coarse grid: cheap and no reading back from the GPU.
    const cw = WIN.w / GRID_X;
    const ch = WIN.h / GRID_Y;
    for (let gy = Math.max(0, Math.floor((y - r) / ch)); gy <= Math.min(GRID_Y - 1, Math.floor((y + r) / ch)); gy++) {
      for (let gx = Math.max(0, Math.floor((x - r) / cw)); gx <= Math.min(GRID_X - 1, Math.floor((x + r) / cw)); gx++) {
        const cx = (gx + 0.5) * cw - x;
        const cy = (gy + 0.5) * ch - y;
        if (cx * cx + cy * cy <= r * r * 0.8 && !covered[gy * GRID_X + gx]) { covered[gy * GRID_X + gx] = 1; clearedCells++; }
      }
    }
    if (!reducedMotion && ++sparkleTick % 3 === 0) {
      const g = foilSprite!.toGlobal({ x, y });
      const p = stage.root.toLocal(g);
      particles.burst({ x: p.x, y: p.y, count: 2, texture: sparkle, tints: [0xffffff, hex(theme.foilHighlight)], speed: [0.5, 2.5], size: [4, 9], life: [14, 28], gravity: 0.05, additive: true });
    }
    if (!done && clearedCells / covered.length >= AUTO_REVEAL) { done = true; up(); onRevealed?.(); }
  };
  const move = (e: FederatedPointerEvent) => {
    if (!scratching || done) return;
    const p = local(e);
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
      for (let i = 1; i <= steps && !done; i++) erase(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
    } else erase(p.x, p.y);
    last = p;
  };
  function down(e: FederatedPointerEvent) {
    if (done) return;
    scratching = true;
    last = null;
    audio.startScratch();
    stage.app.stage.on("globalpointermove", move);
    move(e);
  }
  function up() {
    scratching = false;
    last = null;
    audio.stopScratch();
    stage.app.stage.off("globalpointermove", move);
  }
  stage.app.stage.eventMode = "static";
  stage.app.stage.on("pointerup", up);
  stage.app.stage.on("pointerupoutside", up);

  const dissolve = (fast: boolean) => new Promise<void>((resolve) => {
    if (!foilSprite || !card) return resolve();
    up();
    audio.play("reveal");
    const s = new Sprite(sweep);
    s.anchor.set(0.5);
    s.rotation = 0.35;
    s.height = WIN.h * 2.4;
    s.width = 90;
    s.blendMode = "add";
    s.position.set(WIN.x - 60, WIN.y + WIN.h / 2);
    const m = new Graphics().roundRect(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r).fill(0xffffff);
    s.mask = m;
    card.addChild(s, m);
    const d = fast ? 0.28 : reducedMotion ? 0.35 : 0.7;
    gsap.to(s, { x: WIN.x + WIN.w + 60, duration: d, ease: "power2.inOut" });
    gsap.to(foilSprite, { alpha: 0, duration: d, ease: "power1.in", onComplete: () => { s.destroy(); m.destroy(); resolve(); } });
    if (!reducedMotion && !fast) {
      const g = stage.root.toLocal(card.toGlobal({ x: WIN.x + WIN.w / 2, y: WIN.y + WIN.h / 2 }));
      particles.burst({ x: g.x, y: g.y, count: 26, texture: sparkle, tints: [0xffffff, hex(theme.foilHighlight)], speed: [1, 4], size: [4, 10], life: [20, 40], gravity: 0.02, spread: Math.PI, additive: true });
    }
  });

  return {
    async load() {
      try { await document.fonts?.load(`40px ${theme.fonts.display}`); await document.fonts?.load(`900 12px ${theme.fonts.ui}`); } catch { /* fonts optional */ }
      const art = config.assets ?? {};
      face = art["card-art"] ? await Assets.load<Texture>(art["card-art"]) : cardFaceTexture(theme);
      foil = art["foil-texture"] ? await Assets.load<Texture>(art["foil-texture"]) : foilTexture(WIN.w * 2, WIN.h * 2, theme, theme.labels.scratchHint);
      if (!art["card-art"]) owned.push(face);
      if (!art["foil-texture"]) owned.push(foil);
      fit();
    },

    async present(t, index, total, revealed) {
      card = buildCard(t, index, total);
      covered = new Uint8Array(GRID_X * GRID_Y);
      clearedCells = 0;
      done = false;
      onRevealed = revealed;
      holder.addChild(card);
      if (reducedMotion) { card.alpha = 0; await gsap.to(card, { alpha: 1, duration: 0.2 }); }
      else await gsap.fromTo(card, { x: 340, rotation: 0.12, alpha: 0 }, { x: 0, rotation: 0, alpha: 1, duration: 0.5, ease: "power3.out" });
    },

    async revealNow(fast) {
      done = true;
      await dissolve(fast);
    },

    async celebrate(_t, fast) {
      if (!card) return;
      if (foilSprite && foilSprite.alpha > 0) await dissolve(fast);
      if (winGlow) gsap.to(winGlow, { alpha: 0.85, duration: fast ? 0.15 : 0.4 });
      if (reducedMotion || fast) return;
      const tl = gsap.timeline();
      tl.to(card.scale, { x: 1.07, y: 1.07, duration: 0.35, ease: "back.out(2)" }, 0)
        .to(card, { y: -18, duration: 0.35, ease: "power2.out" }, 0)
        .to(card.skew, { x: -0.04, y: 0.02, duration: 0.3, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      const s = new Sprite(sweep);
      s.anchor.set(0.5);
      s.rotation = 0.4;
      s.height = CARD_H * 1.6;
      s.width = 110;
      s.blendMode = "add";
      s.alpha = 0.8;
      const m = new Graphics().roundRect(0, 0, CARD_W, CARD_H, 26).fill(0xffffff);
      s.mask = m;
      s.position.set(-80, CARD_H / 2);
      card.addChild(s, m);
      tl.to(s, { x: CARD_W + 80, duration: 0.6, ease: "power2.inOut", onComplete: () => { s.destroy(); m.destroy(); } }, 0.15);
      await tl;
    },

    async dismiss(won, fast) {
      const c = card;
      if (!c) return;
      card = null;
      foilSprite = null;
      winGlow = null;
      const d = fast ? 0.2 : 0.4;
      if (reducedMotion) await gsap.to(c, { alpha: 0, duration: 0.15 });
      else if (won) await gsap.to(c, { y: -60, alpha: 0, duration: d, ease: "power2.in" });
      else await gsap.to(c, { x: -340, rotation: -0.1, alpha: 0, duration: d, ease: "power2.in" });
      gsap.killTweensOf([c, c.scale, c.skew]);
      c.destroy({ children: true });
    },

    destroy() {
      up();
      stage.app.stage.off("pointerup", up);
      stage.app.stage.off("pointerupoutside", up);
      if (card) { gsap.killTweensOf([card, card.scale, card.skew]); }
      rt?.destroy(true);
      stampLayer.destroy({ children: true });
      holder.destroy({ children: true });
      reflection.destroy();
      for (const t of owned) t.destroy(true);
    },
  };
}
