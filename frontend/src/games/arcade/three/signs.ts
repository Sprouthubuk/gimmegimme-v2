import * as THREE from "three";

/**
 * Sign lettering for the 3D cabinets: chunky display type with an ink outline, a drop shadow, a vertical
 * gradient fill and a glossy highlight across the top, like the Gimme Gimme logo.
 */
export interface SignLine {
  text: string;
  /** Height as a share of the canvas height. */
  size: number;
  /** Top, middle and bottom of the fill. */
  fill: [string, string, string];
  /** Centre of the line as a share of the canvas height. */
  y: number;
  /** A furry edge (Grinch green). */
  fuzz?: boolean;
  letterSpacing?: number;
}

export function signTexture(w: number, h: number, lines: SignLine[], plaque?: { text: string; y: number; fill: string; trim: string }): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  if (plaque) {
    g.font = `${h * 0.12}px "Lilita One"`;
    const pw = g.measureText(plaque.text).width + h * 0.2;
    const ph = h * 0.2;
    const py = h * plaque.y - ph / 2;
    g.fillStyle = plaque.fill;
    g.strokeStyle = "#141414";
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(w / 2 - pw / 2, py, pw, ph, 22);
    g.fill();
    g.stroke();
    g.strokeStyle = plaque.trim;
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(w / 2 - pw / 2 + 10, py + 9, pw - 20, ph - 18, 14);
    g.stroke();
    g.fillStyle = "#fff";
    g.fillText(plaque.text, w / 2, py + ph / 2 + 3);
  }
  for (const l of lines) {
    let size = h * l.size;
    g.font = `${size}px "Lilita One"`;
    while (g.measureText(l.text).width > w * 0.92 && size > 10) {
      size -= 2;
      g.font = `${size}px "Lilita One"`;
    }
    const y = h * l.y;
    if ("letterSpacing" in g && l.letterSpacing) (g as unknown as { letterSpacing: string }).letterSpacing = `${l.letterSpacing}px`;
    g.lineWidth = size * 0.2;
    g.strokeStyle = "#141414";
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillText(l.text, w / 2, y + size * 0.09);
    if (l.fuzz) for (let k = 0; k < 28; k++) g.strokeText(l.text, w / 2 + Math.cos((k / 28) * Math.PI * 2) * 3, y + Math.sin((k / 28) * Math.PI * 2) * 3);
    else g.strokeText(l.text, w / 2, y);
    const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, l.fill[0]);
    grad.addColorStop(0.5, l.fill[1]);
    grad.addColorStop(1, l.fill[2]);
    g.fillStyle = grad;
    g.fillText(l.text, w / 2, y);
    g.save();
    g.beginPath();
    g.rect(0, y - size / 2, w, size * 0.34);
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillText(l.text, w / 2, y);
    g.restore();
    if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const GOLD_FILL: [string, string, string] = ["#fff8cf", "#ffd23f", "#d98a00"];
export const SILVER_FILL: [string, string, string] = ["#ffffff", "#dfe6f2", "#8f9bb3"];
export const PINK_FILL: [string, string, string] = ["#ffd0ea", "#ff4fa8", "#c40066"];
export const CYAN_FILL: [string, string, string] = ["#e0f8ff", "#38cdf6", "#0087b8"];
export const YELLOW_FILL: [string, string, string] = ["#fffbd0", "#ffe11a", "#e0a800"];
export const GREEN_FILL: [string, string, string] = ["#e6ff8a", "#9bdc28", "#4c9a12"];
