import gsap from "gsap";
import { Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Ticker } from "pixi.js";
import type { GameScene, ShellContext } from "../shell/Shell";
import { fitPlayfield, glowSprite, prizePlate, showPlate } from "../shared/kit";
import { glowTexture } from "../shared/textures";
import { hex } from "../shared/theme";
import type { GameTicket } from "../shared/types";

/**
 * Spin the Wheel. The wheel's prize segments are the competition's real prizes (config.prizeLabels), with
 * "No win" segments between them; the ticket's own prize is always on the wheel. The wheel stops on a segment
 * that matches the result the server gave (a random one of those, at a random point inside it), so the spin
 * only shows the result: it never decides it.
 */
const R = 158;
const FIELD = 380;
const SEGMENTS = 8;
const NO_WIN = "No win";

export interface WheelSegment { label: string; win: boolean }

/** Build the wheel for one ticket. Exported for tests. */
export function wheelSegments(t: GameTicket, prizeLabels: readonly string[] = []): WheelSegment[] {
  const prizes = [...new Set(prizeLabels)].slice(0, SEGMENTS / 2);
  if (t.result === "win" && t.prize && !prizes.includes(t.prize.label)) {
    if (prizes.length >= SEGMENTS / 2) prizes[prizes.length - 1] = t.prize.label;
    else prizes.push(t.prize.label);
  }
  while (prizes.length < SEGMENTS / 2) prizes.push(prizes[prizes.length % Math.max(1, prizes.length)] ?? "Instant Win");
  const out: WheelSegment[] = [];
  for (let i = 0; i < SEGMENTS / 2; i++) out.push({ label: prizes[i], win: true }, { label: NO_WIN, win: false });
  return out;
}

/** Which segments the wheel may stop on for this result. Exported for tests. */
export function landingSegments(t: GameTicket, segs: readonly WheelSegment[]): number[] {
  return segs.map((s, i) => [s, i] as const)
    .filter(([s]) => (t.result === "win" ? s.win && s.label === t.prize?.label : !s.win))
    .map(([, i]) => i);
}

export function createSpinWheel(ctx: ShellContext): GameScene {
  const { stage, theme, config, reducedMotion, audio, particles, sparkle } = ctx;
  const holder = new Container();
  stage.scene.addChild(holder);
  const glow = glowTexture(256, 0.45);
  let wheel: Container | null = null;
  let frame: Container | null = null;
  let bulbs: Graphics[] = [];
  let segs: WheelSegment[] = [];
  let plate: Container | null = null;
  let spun = false;
  let ticket: GameTicket | null = null;
  let onRevealed: (() => void) | null = null;
  let t0 = 0;
  let lastTick = 0;
  let drag: { y: number; t: number } | null = null;

  const fit = () => fitPlayfield(stage, holder, FIELD + 20, FIELD);
  stage.onResize(fit);

  const chase = (tk: Ticker) => {
    t0 += tk.deltaTime / 60;
    const speed = spun ? 14 : 3;
    bulbs.forEach((b, i) => { b.alpha = reducedMotion ? 0.8 : 0.35 + 0.65 * ((Math.floor(t0 * speed) + i) % 3 === 0 ? 1 : 0); });
    if (wheel && spun) {
      const seg = Math.floor(((wheel.rotation % (Math.PI * 2)) + Math.PI * 2) / ((Math.PI * 2) / SEGMENTS));
      if (seg !== lastTick) { lastTick = seg; audio.play("button"); }
    }
  };
  stage.app.ticker.add(chase);

  const build = (t: GameTicket) => {
    segs = wheelSegments(t, config.prizeLabels);
    frame = new Container();
    const outer = new Graphics().circle(0, 0, R + 18).fill({ color: 0x0b0910 }).stroke({ width: 3, color: hex(theme.neonA), alpha: 0.9 });
    frame.addChild(glowSprite(glow, theme.neonA, (R + 40) * 2.6, (R + 40) * 2.6, 0.25), outer);
    bulbs = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const b = new Graphics().circle(0, 0, 4).fill(i % 2 ? hex(theme.neonB) : 0xffffff);
      b.position.set(Math.cos(a) * (R + 9), Math.sin(a) * (R + 9));
      frame!.addChild(b);
      return b;
    });
    wheel = new Container();
    const step = (Math.PI * 2) / SEGMENTS;
    segs.forEach((s, i) => {
      const a0 = -Math.PI / 2 + i * step - step / 2;
      const g = new Graphics()
        .moveTo(0, 0).arc(0, 0, R, a0, a0 + step).closePath()
        .fill({ color: s.win ? (i % 4 === 0 ? hex(theme.neonA) : 0x7b5cff) : hex(theme.cardTop) })
        .stroke({ width: 2, color: 0x000000, alpha: 0.5 });
      wheel!.addChild(g);
      const label = new Text({ text: s.label.toUpperCase(), style: { fontFamily: theme.fonts.display, fontSize: 15, fill: s.win ? "#FFFFFF" : theme.muted, align: "center", wordWrap: true, wordWrapWidth: 74, lineHeight: 15 } });
      label.anchor.set(0.5);
      const mid = a0 + step / 2;
      label.position.set(Math.cos(mid) * R * 0.64, Math.sin(mid) * R * 0.64);
      label.rotation = mid + Math.PI / 2;
      if (label.height > 48) label.scale.set(48 / label.height);
      wheel!.addChild(label);
    });
    // Inner sheen and hub.
    wheel.addChild(new Graphics().circle(0, 0, R).fill({ color: 0xffffff, alpha: 0.04 }));
    const hub = new Graphics().circle(0, 0, 30).fill({ color: 0x120e1a }).stroke({ width: 3, color: hex(theme.neonB) });
    const pointer = new Graphics().poly([-16, -R - 30, 16, -R - 30, 0, -R + 6]).fill(hex(theme.neonB)).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    frame.addChild(wheel, hub, pointer, glowSprite(glow, theme.neonB, 70, 70, 0.4));
    hub.eventMode = "static";
    hub.cursor = "pointer";
    hub.on("pointertap", () => { void spin(false).then(() => onRevealed?.()); });
    wheel.eventMode = "static";
    wheel.cursor = "grab";
    wheel.on("pointerdown", (e: FederatedPointerEvent) => { drag = { y: e.global.y, t: performance.now() }; });
    wheel.on("pointerup", (e: FederatedPointerEvent) => {
      // A flick (or any release) spins it: the strength only changes how long it turns.
      if (!drag) return;
      const v = Math.abs(e.global.y - drag.y) / Math.max(1, performance.now() - drag.t);
      drag = null;
      void spin(false, Math.min(2, 0.6 + v)).then(() => onRevealed?.());
    });
    return frame;
  };

  // The reveal in progress, shared by the player's tap and the shell's revealNow so it never runs twice
  // or gets dismissed half way through.
  let running: Promise<void> | null = null;
  const spin = (fast: boolean, strength = 1) => (running ??= spinOnce(fast, strength));
  const spinOnce = async (fast: boolean, strength = 1) => {
    if (spun || !wheel || !ticket) return;
    spun = true;
    const options = landingSegments(ticket, segs);
    const target = options[Math.floor(Math.random() * options.length)];
    const step = (Math.PI * 2) / SEGMENTS;
    // Segment i sits at the top when the wheel is turned by -i·step; land somewhere inside its middle 70%.
    const inside = (Math.random() - 0.5) * step * 0.7;
    const turns = fast || reducedMotion ? 1 : 3 + Math.round(strength * 1.5);
    const end = -(target * step) - inside - turns * Math.PI * 2;
    await gsap.to(wheel, { rotation: end, duration: fast ? 0.7 : reducedMotion ? 1.2 : 2.3 + strength * 0.4, ease: "power4.out" });
    if (holder.destroyed) return;
    // Self-check: the segment under the pointer must match the server's result.
    const k = SEGMENTS;
    const under = ((Math.round(-wheel.rotation / step) % k) + k) % k;
    if (!landingSegments(ticket, segs).includes(under)) console.error(`Wheel landed on segment ${under}, not a match for ticket ${ticket.ticketNumber}`);
    spun = false;
    lastTick = -1;
    audio.play("reveal");
    // Light the winning wedge, then show the result.
    const at = stage.root.toLocal(holder.toGlobal({ x: 0, y: -R * 0.7 }));
    if (!reducedMotion && !fast) particles.burst({ x: at.x, y: at.y, count: 24, texture: sparkle, tints: [0xffffff, hex(theme.neonB)], speed: [2, 6], life: [20, 40], additive: true });
    if (frame) gsap.to(frame, { alpha: 0.3, duration: fast ? 0.1 : 0.3 });
    plate = prizePlate(theme, ticket, 250, 118);
    plate.position.set(0, -34);
    holder.addChild(plate);
    await showPlate(plate, reducedMotion, fast);
    if (holder.destroyed) return;
  };

  return {
    title: "Spin the Wheel",
    hint: "Spin the wheel",

    async load() {
      fit();
    },

    async present(t, _i, _n, revealed) {
      running = null;
      ticket = t;
      onRevealed = revealed;
      spun = false;
      holder.addChild(build(t));
      frame!.y = -34;
      if (reducedMotion) await gsap.fromTo(frame, { alpha: 0 }, { alpha: 1, duration: 0.2 });
      else await gsap.fromTo(frame!.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.5, ease: "back.out(1.6)" });
    },

    async revealNow(fast) {
      await spin(fast); // returns the reveal already under way, if any
    },

    async celebrate(_t, fast) {
      if (!plate || reducedMotion || fast) return;
      const at = stage.root.toLocal(holder.toGlobal({ x: 0, y: plate.y }));
      particles.burst({ x: at.x, y: at.y, count: 30, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 7], size: [5, 12], life: [30, 60], additive: true });
      await gsap.fromTo(plate.scale, { x: 1, y: 1 }, { x: 1.08, y: 1.08, duration: 0.25, yoyo: true, repeat: 1 });
    },

    async dismiss(_won, fast) {
      const all = [frame, plate].filter(Boolean) as Container[];
      await gsap.to(all, { alpha: 0, duration: fast ? 0.15 : 0.3 });
      if (wheel) gsap.killTweensOf(wheel);
      for (const o of all) { gsap.killTweensOf(o); o.destroy({ children: true }); }
      frame = wheel = plate = null;
      bulbs = [];
    },

    destroy() {
      stage.app.ticker.remove(chase);
      if (wheel) gsap.killTweensOf(wheel);
      holder.destroy({ children: true });
      glow.destroy(true);
    },
  };
}
