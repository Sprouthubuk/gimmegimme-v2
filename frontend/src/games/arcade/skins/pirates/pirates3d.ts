import * as THREE from "three";
import type { GemKind } from "../../games/generators";
import type { PickSkin3D } from "../../three/pickScene";
import { treasureChest } from "../../three/pickScene";
import { planks } from "../../three/floors";
import { glossy, halo, outline } from "../../three/kit";
import { GOLD_FILL, signTexture } from "../../three/signs";

/** Pirates of the Prizeibbean in 3D: treasure chests on a ship's deck at sunset. */
export function piratesSkin3D(loot: (k: GemKind) => Promise<CanvasImageSource>): PickSkin3D {
  return {
    sky: [
      [0, "#2a1440"],
      [0.45, "#d9573a"],
      [0.62, "#ffb04a"],
      [0.64, "#1d6e8f"],
      [1, "#0b2a3d"],
    ],
    floor: (g, ctx) => g.add(planks(ctx.rng)),
    sign: (w, h) =>
      signTexture(w, h, [
        { text: "PIRATES", size: 0.38, fill: GOLD_FILL, y: 0.3 },
        { text: "of the", size: 0.14, fill: ["#ffffff", "#ffe8c0", "#e8c890"], y: 0.56 },
        { text: "PRIZEIBBEAN", size: 0.3, fill: ["#e0f8ff", "#38cdf6", "#0a6a96"], y: 0.8 },
      ]),
    make: treasureChest(0x8a4b1f),
    loot,
    lootGlow: { gold: 0xffd23f, pink: 0xff3b6b, blue: 0xe6f6ff, dud: 0x000000 },
    decor: (g) => {
      // Rope rail along the back with gold posts, and a sun glow.
      const wood = glossy(0x5a2e12, { roughness: 0.6 });
      for (let i = -3; i <= 3; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12), wood);
        post.position.set(i * 0.55, 0, -1.4);
        outline(post, 0.01);
        g.add(post);
      }
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 12), wood);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, 0.28, -1.4);
      g.add(rail);
      const sun = halo(0xffc04a, 3.5, 0.55);
      sun.position.set(1.4, 1.6, -4);
      g.add(sun);
    },
  };
}
