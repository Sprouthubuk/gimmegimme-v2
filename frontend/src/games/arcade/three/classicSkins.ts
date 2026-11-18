import * as THREE from "three";
import type { GemKind, SlotSymbol } from "../games/generators";
import { capsuleLook, type ClawSkin3D } from "./clawScene";
import { cupBin, type CoinDropSkin3D } from "./coinDropScene";
import { candy } from "./floors";
import { BRAND } from "./fx";
import { glossy, halo, outline } from "./kit";
import { flipTile, type PickSkin3D } from "./pickScene";
import { CYAN_FILL, PINK_FILL, YELLOW_FILL, signTexture } from "./signs";
import type { SlotsSkin3D } from "./slotsScene";
import type { WheelSkin3D } from "./wheelScene";

/** The classic Gimme Gimme look for the 3D boards: candy pink, cyan and yellow on a night-time neon backdrop. */
const SKY: [number, string][] = [
  [0, "#1a0828"],
  [0.55, "#3a0d4a"],
  [1, "#0d0414"],
];

const sign2 = (top: string, bottom: string | null) => (w: number, h: number) =>
  signTexture(w, h, bottom ? [
    { text: top, size: 0.34, fill: PINK_FILL, y: 0.32 },
    { text: bottom, size: 0.36, fill: YELLOW_FILL, y: 0.72 },
  ] : [{ text: top, size: 0.5, fill: PINK_FILL, y: 0.52 }]);

/** Floating brand bubbles in the background. */
function bubbles(g: THREE.Group) {
  const cols = [BRAND.pink, BRAND.cyan, BRAND.yellow];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.05, 24, 16), glossy(cols[i % 3], { roughness: 0.15 }));
    b.position.set(((i * 37) % 7) / 7 * 4 - 2, ((i * 53) % 9) / 9 * 3 - 0.6, -1.6 - (i % 2) * 0.4);
    outline(b, 0.01);
    g.add(b);
    const h = halo(cols[i % 3], 0.7, 0.25);
    h.position.copy(b.position);
    g.add(h);
  }
}

export const CLASSIC_CLAW_3D: ClawSkin3D = {
  cabinet: BRAND.pink,
  cabinetDark: 0x8a004a,
  trim: 0xffe11a,
  sky: SKY,
  wall: [
    [0, "#e8f8ff"],
    [1, "#a8e6ff"],
  ],
  floor: 0xfff4fa,
  sign: sign2("CLAW", "MACHINE"),
  item: capsuleLook([BRAND.pink, BRAND.cyan, BRAND.yellow]),
  bulbs: [0xffe11a, 0xffffff, 0x1fc4f4],
  emptyText: "No prize",
};

export function classicSlots3D(icon: (s: SlotSymbol) => Promise<CanvasImageSource>): SlotsSkin3D {
  return {
    cabinet: BRAND.pink,
    cabinetDark: 0x2a0a1e,
    trim: 0xffe11a,
    sky: SKY,
    reelFace: "#ffffff",
    sign: sign2("SLOTS", null),
    icon,
    bulbs: [0xffe11a, 0xffffff, 0x1fc4f4],
    decor: (g) => bubbles(g),
  };
}

export function classicGems3D(loot: (k: GemKind) => Promise<CanvasImageSource>): PickSkin3D {
  return {
    sky: SKY,
    floor: (g) => g.add(candy()),
    sign: sign2("GEMS", null),
    make: flipTile(),
    loot,
    lootGlow: { pink: BRAND.pink, blue: BRAND.cyan, gold: BRAND.yellow, dud: 0x000000 },
    decor: (g) => bubbles(g),
  };
}

function candyWall(w: number, h: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#ffd6ec");
  grad.addColorStop(1, "#ffb3da");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,0.45)";
  for (let y = 0; y < h; y += 48) for (let x = (y / 48) % 2 ? 24 : 0; x < w; x += 48) {
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const CLASSIC_COIN_3D: CoinDropSkin3D = {
  sky: SKY,
  wall: candyWall,
  frame: BRAND.pink,
  stud: 0xdfe6ef,
  studLit: BRAND.cyan,
  sign: sign2("COIN", "DROP"),
  bin: cupBin,
  plate: { yellow: "#ffe11a", cyan: "#1fc4f4", pink: "#ff2d95", white: "#ffffff", none: "#2a2a34" },
};

export const CLASSIC_WHEEL_3D: WheelSkin3D = {
  sky: SKY,
  fills: { yellow: ["#fffbd0", "#ffe11a"], cyan: ["#d8f6ff", "#1fc4f4"], pink: ["#ffd0ea", "#ff2d95"], white: ["#ffffff", "#f0e8f6"] },
  ink: { yellow: "#141414", cyan: "#141414", pink: "#ffffff", white: "#ff2d95" },
  noneFill: ["#ffffff", "#e8dff0"],
  rim: "candy",
  sign: (w, h) =>
    signTexture(w, h, [
      { text: "SPIN THE", size: 0.26, fill: CYAN_FILL, y: 0.28 },
      { text: "WHEEL", size: 0.42, fill: YELLOW_FILL, y: 0.7 },
    ]),
  decor: (g) => bubbles(g),
};

/** The classic scratch card's stage. */
export const CLASSIC_SCRATCH_3D: import("./stageScene").StageSkin3D = {
  bg: [
    [0, "#2a0a3e"],
    [0.55, "#4a0f5c"],
    [1, "#12041c"],
  ],
  sign: [
    { text: "SCRATCH", size: 0.34, fill: ["#fffbd0", "#ffe11a", "#e0a800"], y: 0.3 },
    { text: "& WIN!", size: 0.42, fill: ["#ffd0ea", "#ff4fa8", "#c40066"], y: 0.72 },
  ],
  rays: 0xff4fa8,
  floaters: "coins",
};
