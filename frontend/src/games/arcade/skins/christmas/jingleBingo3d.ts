import * as THREE from "three";
import type { BingoSkin3D } from "../../three/bingoScene";
import { GOLD_FILL } from "../../three/signs";

const LETTER: Record<string, number> = { B: 0xe0283a, I: 0x2fd39a, N: 0xffc23d, G: 0xe0283a, O: 0x2fd39a };

/** Jingle Bell Bingo Bonanza: baubles with gold caps in a snowy globe. */
export const JINGLE_BINGO_3D: BingoSkin3D = {
  sign: [
    { text: "JINGLE BELL", size: 0.3, fill: GOLD_FILL, y: 0.3 },
    { text: "BINGO!", size: 0.46, fill: ["#ffe0e0", "#ff4a5a", "#b0101e"], y: 0.72 },
  ],
  bg: [
    [0, "#0b3a26"],
    [0.6, "#0f5a3a"],
    [1, "#04170f"],
  ],
  ballColour: (n) => LETTER["BINGO"[Math.floor((n - 1) / 15)]],
  cap: true,
  base: 0xe0283a,
  trim: 0xffc23d,
  leftWord: "BAUBLES LEFT",
  decor: (world, ctx) => {
    // Gentle snow over the stall.
    const N = 70;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const speed: number[] = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (ctx.rng() - 0.5) * 3.4;
      pos[i * 3 + 1] = ctx.rng() * 2.4 - 1;
      pos[i * 3 + 2] = (ctx.rng() - 0.5) * 1.2 - 0.3;
      speed.push(0.15 + ctx.rng() * 0.25);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false }));
    world.add(snow);
    let last = 0;
    return (t: number) => {
      if (ctx.reducedMotion) return;
      const dt = Math.min(0.05, t - last);
      last = t;
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] -= speed[i] * dt;
        pos[i * 3] += Math.sin(t + i) * 0.002;
        if (pos[i * 3 + 1] < -1) pos[i * 3 + 1] = 1.4;
      }
      geo.attributes.position.needsUpdate = true;
    };
  },
};
