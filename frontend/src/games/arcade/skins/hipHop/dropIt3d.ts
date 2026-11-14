import * as THREE from "three";
import type { CoinDropSkin3D } from "../../three/coinDropScene";
import { speakerBin } from "../../three/coinDropScene";
import { GOLD_FILL, PINK_FILL, signTexture } from "../../three/signs";

/** Drop It Like It's Hot in 3D: a gold coin down a graffiti brick wall of gold studs into speakers. */
function graffitiWall(w: number, h: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b1026";
  g.fillRect(0, 0, w, h);
  // Bricks.
  const bw = 64;
  const bh = 28;
  for (let y = 0; y < h / bh + 1; y++)
    for (let x = -1; x < w / bw + 1; x++) {
      const ox = (y % 2) * (bw / 2);
      g.fillStyle = (x + y) % 3 === 0 ? "#2a1838" : (x * 7 + y) % 4 === 0 ? "#24142f" : "#2f1b3f";
      g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  // Neon tags.
  const tag = (text: string, x: number, y: number, size: number, rot: number, col: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.font = `${size}px "Lilita One"`;
    g.textAlign = "center";
    g.shadowColor = col;
    g.shadowBlur = 18;
    g.lineWidth = size * 0.14;
    g.strokeStyle = "#141414";
    g.strokeText(text, 0, 0);
    g.fillStyle = col;
    g.fillText(text, 0, 0);
    g.restore();
  };
  tag("GG", w * 0.2, h * 0.32, 110, -0.2, "#ff2d95");
  tag("£££", w * 0.78, h * 0.55, 80, 0.16, "#1fc4f4");
  tag("HOT", w * 0.3, h * 0.72, 70, 0.1, "#ffe11a");
  tag("★", w * 0.82, h * 0.2, 90, 0, "#ffe11a");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const DROP_IT_SKIN_3D: CoinDropSkin3D = {
  sky: [
    [0, "#12061f"],
    [0.6, "#2a0b3a"],
    [1, "#0a0412"],
  ],
  wall: graffitiWall,
  frame: 0xffc23d,
  stud: 0xffc23d,
  studLit: 0xff3fa6,
  sign: (w, h) =>
    signTexture(w, h, [
      { text: "DROP IT", size: 0.38, fill: GOLD_FILL, y: 0.25 },
      { text: "LIKE IT'S", size: 0.2, fill: ["#ffffff", "#e8e8ff", "#b8b8d8"], y: 0.53 },
      { text: "HOT", size: 0.36, fill: PINK_FILL, y: 0.8 },
    ]),
  bin: speakerBin,
  plate: { yellow: "#ffcf1a", cyan: "#1fc4f4", pink: "#ff2d95", white: "#f2f2f8", none: "#2a2a34" },
};
