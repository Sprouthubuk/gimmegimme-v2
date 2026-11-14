import * as THREE from "three";
import type { WheelSkin3D } from "../../three/wheelScene";
import { halo } from "../../three/kit";
import { CYAN_FILL, GOLD_FILL, signTexture } from "../../three/signs";

/** The Great Cash Escape in 3D: a steel vault door that spins, with gold bolts, under police lights. */
export const CASH_ESCAPE_SKIN_3D: WheelSkin3D = {
  sky: [
    [0, "#0a0f24"],
    [0.55, "#151d40"],
    [1, "#05070f"],
  ],
  fills: { yellow: ["#fff6c2", "#ffb800"], cyan: ["#c8f4ff", "#0a9ad8"], pink: ["#ffb8dc", "#d4006f"], white: ["#ffffff", "#c9d2e0"] },
  ink: { yellow: "#141414", cyan: "#ffffff", pink: "#ffffff", white: "#141414" },
  noneFill: ["#4a5468", "#1d2333"],
  rim: "steel",
  vault: true,
  sign: (w, h) =>
    signTexture(w, h, [
      { text: "THE GREAT", size: 0.2, fill: ["#ffffff", "#dfe6f2", "#9aa6bc"], y: 0.17 },
      { text: "CASH", size: 0.36, fill: GOLD_FILL, y: 0.47 },
      { text: "ESCAPE", size: 0.3, fill: CYAN_FILL, y: 0.8 },
    ]),
  decor: (g, ctx) => {
    // Police lights either side, sweeping.
    const lights: THREE.Sprite[] = [];
    for (const [x, c] of [[-1.55, 0xff2a3a], [1.55, 0x2ad4ff]] as const) {
      const h = halo(c, 1.6, 0.6);
      h.position.set(x, 1.55, -0.5);
      g.add(h);
      lights.push(h);
    }
    return (t: number) => {
      if (ctx.reducedMotion) return;
      lights[0].material.opacity = 0.3 + 0.5 * Math.max(0, Math.sin(t * 6));
      lights[1].material.opacity = 0.3 + 0.5 * Math.max(0, Math.sin(t * 6 + Math.PI));
    };
  },
};
