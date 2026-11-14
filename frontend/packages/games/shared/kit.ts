import gsap from "gsap";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Stage } from "../shell/stage";
import { hex, type Theme } from "./theme";
import type { GameTicket } from "./types";

/**
 * Pieces shared by the games: the plate that shows a ticket's result, screen fitting, and procedural art.
 * Random numbers here only vary the look (sparkle, shading); they never pick a result.
 */

export const money = (n: number) => `£${n.toFixed(2)}`;

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext("2d")!];
};

const shade = (hexColor: string, f: number) => {
  const n = parseInt(hexColor.replace("#", "").slice(0, 6), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

/** The result, exactly as given: label and value in gold for a win, a quiet line for a no-win. */
export function prizePlate(theme: Theme, t: GameTicket, w = 250, h = 120): Container {
  const c = new Container();
  const win = t.result === "win" && !!t.prize;
  const g = new Graphics()
    .roundRect(-w / 2, -h / 2, w, h, 20)
    .fill({ color: 0x07060a, alpha: 0.92 })
    .stroke({ width: 2, color: win ? hex(theme.gold) : 0xffffff, alpha: win ? 0.9 : 0.15 });
  c.addChild(g);
  if (win) {
    const lbl = new Text({ text: t.prize!.label, style: { fontFamily: theme.fonts.display, fontSize: 21, fill: theme.text, align: "center", wordWrap: true, wordWrapWidth: w - 24, lineHeight: 23 } });
    lbl.anchor.set(0.5);
    lbl.position.set(0, -h * 0.2);
    if (lbl.height > h * 0.42) lbl.scale.set((h * 0.42) / lbl.height);
    const val = new Text({ text: money(t.prize!.value), style: { fontFamily: theme.fonts.display, fontSize: 40, fill: theme.gold, stroke: { color: theme.goldDeep, width: 2 }, dropShadow: { color: hex(theme.gold), blur: 12, distance: 0, alpha: 0.7 } } });
    val.anchor.set(0.5);
    val.position.set(0, h * 0.2);
    if (val.width > w - 20) val.scale.set((w - 20) / val.width);
    c.addChild(lbl, val);
  } else {
    const lose = new Text({ text: theme.labels.noWin, style: { fontFamily: theme.fonts.display, fontSize: 22, fill: theme.muted, align: "center" } });
    lose.anchor.set(0.5);
    c.addChild(lose);
  }
  return c;
}

/** Pop a plate into view. */
export async function showPlate(plate: Container, reduced: boolean, fast: boolean): Promise<void> {
  if (reduced) { plate.alpha = 0; await gsap.to(plate, { alpha: 1, duration: 0.2 }); return; }
  plate.scale.set(0.4);
  plate.alpha = 0;
  await Promise.all([gsap.to(plate, { alpha: 1, duration: fast ? 0.12 : 0.25 }), gsap.to(plate.scale, { x: 1, y: 1, duration: fast ? 0.2 : 0.45, ease: "back.out(2)" })]);
}

/**
 * Fit a game's playfield (designed at `w`×`h`) between the top bar and the bottom panel, centred.
 * Sets the stage's focus and where the hint button goes.
 */
export function fitPlayfield(stage: Stage, holder: Container, h: number, w = 360): number {
  const room = stage.size.h - 76 - 190;
  const scale = Math.max(0.6, Math.min(1, room / (h + 16), (stage.size.w - 16) / w));
  holder.scale.set(scale);
  stage.focus.y = 76 + room / 2 + 6;
  stage.focus.hintY = stage.focus.y + (h / 2) * scale + 12;
  holder.position.set(stage.focus.x, stage.focus.y);
  return scale;
}

/** A faceted, glowing gem (cut from a hexagon), drawn from one colour. */
export function gemTexture(color: string, size = 160): Texture {
  const [c, g] = canvas(size, size);
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos(Math.PI / 6 + (i * Math.PI) / 3), cy + r * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)]);
  const inner = pts.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5]);
  const halo = g.createRadialGradient(cx, cy, r * 0.4, cx, cy, size / 2);
  halo.addColorStop(0, shade(color, 0.2).replace("rgb", "rgba").replace(")", ",0.45)"));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  const facets: [number, number][] = [[0.35, 0], [0.1, 0], [-0.25, 0], [-0.45, 0], [-0.2, 0], [0.2, 0]];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.lineTo(inner[j][0], inner[j][1]); g.lineTo(inner[i][0], inner[i][1]);
    g.closePath();
    g.fillStyle = shade(color, facets[i][0]);
    g.fill();
  }
  g.beginPath();
  inner.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const top = g.createLinearGradient(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5);
  top.addColorStop(0, shade(color, 0.55));
  top.addColorStop(1, shade(color, -0.1));
  g.fillStyle = top;
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 1.2;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.stroke();
  // A highlight glint.
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath(); g.ellipse(cx - r * 0.22, cy - r * 0.28, r * 0.12, r * 0.05, -0.6, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

/** A glossy balloon with a knot and a light on its shoulder. */
export function balloonTexture(color: string, w = 120, h = 170): Texture {
  const [c, g] = canvas(w, h);
  const cx = w / 2;
  const by = h * 0.43;
  const grad = g.createRadialGradient(cx - w * 0.15, by - h * 0.14, 4, cx, by, w * 0.55);
  grad.addColorStop(0, shade(color, 0.6));
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, shade(color, -0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, by, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath(); g.moveTo(cx - 6, by + h * 0.37); g.lineTo(cx + 6, by + h * 0.37); g.lineTo(cx, by + h * 0.44); g.closePath(); g.fillStyle = shade(color, -0.4); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(cx, by + h * 0.44); g.bezierCurveTo(cx - 8, h * 0.9, cx + 8, h * 0.95, cx, h); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.beginPath(); g.ellipse(cx - w * 0.16, by - h * 0.17, w * 0.07, h * 0.1, -0.5, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

/** A rubber duck in profile (sits on water), tinted from one colour. */
export function duckTexture(color: string, size = 150): Texture {
  const [c, g] = canvas(size, size);
  const body = g.createRadialGradient(size * 0.4, size * 0.55, 6, size * 0.48, size * 0.62, size * 0.45);
  body.addColorStop(0, shade(color, 0.55));
  body.addColorStop(1, shade(color, -0.35));
  g.fillStyle = body;
  g.beginPath(); g.ellipse(size * 0.48, size * 0.66, size * 0.4, size * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(size * 0.62, size * 0.36, size * 0.18, size * 0.17, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#FF8A1F";
  g.beginPath(); g.ellipse(size * 0.82, size * 0.4, size * 0.1, size * 0.045, 0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#111"; g.beginPath(); g.arc(size * 0.67, size * 0.32, size * 0.028, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(size * 0.675, size * 0.312, size * 0.01, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(color, -0.25);
  g.beginPath(); g.ellipse(size * 0.4, size * 0.62, size * 0.16, size * 0.08, -0.3, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

/** A two-tone prize capsule (top colour, clear-ish bottom) with a seam and a shine. */
export function capsuleTexture(color: string, size = 110): Texture {
  const [c, g] = canvas(size, size);
  const r = size * 0.44;
  const cx = size / 2;
  const cy = size / 2;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.closePath(); g.clip();
  const top = g.createRadialGradient(cx - r * 0.3, cy - r * 0.5, 2, cx, cy, r);
  top.addColorStop(0, shade(color, 0.55)); top.addColorStop(1, shade(color, -0.4));
  g.fillStyle = top; g.fillRect(0, 0, size, size);
  g.restore();
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.closePath(); g.clip();
  const bot = g.createLinearGradient(0, cy, 0, cy + r);
  bot.addColorStop(0, "rgba(255,255,255,0.32)"); bot.addColorStop(1, "rgba(255,255,255,0.08)");
  g.fillStyle = bot; g.fillRect(0, 0, size, size);
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.5, r * 0.2, r * 0.09, -0.6, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

/** A minted coin with a rim, a £ and a sheen. */
export function coinTexture(theme: Theme, size = 96): Texture {
  const [c, g] = canvas(size, size);
  const r = size * 0.46;
  const cx = size / 2;
  const face = g.createRadialGradient(cx - r * 0.3, cx - r * 0.3, 2, cx, cx, r);
  face.addColorStop(0, "#FFF1B8"); face.addColorStop(0.5, theme.gold); face.addColorStop(1, theme.goldDeep);
  g.fillStyle = face; g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(90,60,0,0.6)"; g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, r * 0.8, 0, Math.PI * 2); g.stroke();
  g.font = `400 ${Math.round(size * 0.5)}px ${theme.fonts.display}`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(90,60,0,0.55)"; g.fillText("£", cx + 1, cx + 3);
  g.fillStyle = "#FFF6D0"; g.fillText("£", cx, cx + 1);
  return Texture.from(c);
}

/** A glass panel: a translucent rounded rectangle with a neon rim (drawn as Graphics). */
export function glassPanel(w: number, h: number, theme: Theme, r = 24, rim = theme.neonA): Graphics {
  return new Graphics()
    .roundRect(-w / 2, -h / 2, w, h, r)
    .fill({ color: 0x120e1a, alpha: 0.62 })
    .stroke({ width: 1.5, color: hex(rim), alpha: 0.75 });
}

/** A tinted soft glow sprite. */
export function glowSprite(tex: Texture, color: string, w: number, h = w, alpha = 0.4): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.tint = hex(color);
  s.width = w;
  s.height = h;
  s.alpha = alpha;
  s.blendMode = "add";
  return s;
}

/** Pick an index in [0, n) for the look only (which balloon to auto-pop, a wheel's landing offset). */
export const lookPick = (n: number) => Math.floor(Math.random() * n);

/**
 * Stop every tween on a display tree (objects, their scale and pivot) so nothing animates an object after it
 * is destroyed, e.g. when the game is closed mid-animation.
 */
export function killTweensIn(o: Container): void {
  if (o.destroyed) return;
  gsap.killTweensOf(o);
  gsap.killTweensOf(o.scale);
  gsap.killTweensOf(o.pivot);
  for (const c of o.children) killTweensIn(c);
}
