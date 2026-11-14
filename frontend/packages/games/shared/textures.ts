import { Texture } from "pixi.js";
import type { Theme } from "./theme";

/**
 * Textures drawn in code, so a game looks finished with no artwork. Each can be replaced by a file listed in
 * assets/manifest.json. Random numbers here only scatter sparkles and grain: they never touch a result.
 */

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext("2d")!];
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Brushed metal foil with grain, streaks, a faint diamond emboss and a printed hint. */
export function foilTexture(w: number, h: number, theme: Theme, hint: string): Texture {
  const [c, g] = canvas(w, h);
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, rgba(theme.foil, 1));
  base.addColorStop(0.45, rgba(theme.foilHighlight, 1));
  base.addColorStop(0.55, rgba(theme.foil, 1));
  base.addColorStop(1, rgba(theme.foil, 0.92));
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // Brushed streaks.
  for (let i = 0; i < h * 1.4; i++) {
    const y = Math.random() * h;
    g.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
    g.lineWidth = Math.random() * 1.2 + 0.2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y + (Math.random() - 0.5) * 3);
    g.stroke();
  }
  // Fine grain.
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Diamond emboss.
  g.strokeStyle = "rgba(255,255,255,0.09)";
  g.lineWidth = 1;
  const step = 18;
  for (let x = -h; x < w + h; x += step) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
    g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke();
  }
  // Hint text, pressed into the metal.
  // The biggest size that fits 82% of the width.
  let size = Math.round(h / 4);
  g.font = `400 ${size}px ${theme.fonts.display}`;
  const tw = g.measureText(hint.toUpperCase()).width;
  if (tw > w * 0.82) size = Math.floor((size * w * 0.82) / tw);
  g.font = `400 ${size}px ${theme.fonts.display}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillText(hint.toUpperCase(), w / 2 + 1, h / 2 + 2);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fillText(hint.toUpperCase(), w / 2, h / 2);
  return Texture.from(c);
}

/** A soft round glow, white at the centre: tinted for lights, spotlights and bokeh. */
export function glowTexture(size = 256, falloff = 0.5): Texture {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(falloff, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** A four-point sparkle. */
export function sparkleTexture(size = 64): Texture {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const glow = g.createRadialGradient(r, r, 0, r, r, r * 0.6);
  glow.addColorStop(0, "rgba(255,255,255,0.9)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(r, 0); g.quadraticCurveTo(r, r, size, r); g.quadraticCurveTo(r, r, r, size); g.quadraticCurveTo(r, r, 0, r); g.quadraticCurveTo(r, r, r, 0);
  g.fill();
  return Texture.from(c);
}

/** Radiating light rays for a win (rotated slowly behind the prize). */
export function raysTexture(size = 512, rays = 18): Texture {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  g.translate(r, r);
  for (let i = 0; i < rays; i++) {
    g.rotate((Math.PI * 2) / rays);
    const grad = g.createLinearGradient(0, 0, r, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(r, -r * 0.09);
    g.lineTo(r, r * 0.09);
    g.closePath();
    g.fill();
  }
  return Texture.from(c);
}

/** A soft round brush stamp used to erase the foil. */
export function brushTexture(size = 64): Texture {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, r * 0.55, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** A thin diagonal light sweep, for the shine across a winning card. */
export function sweepTexture(w = 160, h = 512): Texture {
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return Texture.from(c);
}
