import type { GemKind } from "../../games/generators";
import type { PickSkin3D } from "../../three/pickScene";
import { moneyBag } from "../../three/pickScene";
import { cobbles, streetLamp } from "../../three/floors";
import { halo } from "../../three/kit";
import { GOLD_FILL, signTexture } from "../../three/signs";

/** Liam's Humbug Heist in 3D: money bags on a wet cobbled street under gas lamps, snow in the air. */
export function heistSkin3D(loot: (k: GemKind) => Promise<CanvasImageSource>): PickSkin3D {
  return {
    sky: [
      [0, "#0d1530"],
      [0.6, "#1b2a55"],
      [1, "#0a0f22"],
    ],
    floor: (g, ctx) => g.add(cobbles(ctx.rng)),
    sign: (w, h) =>
      signTexture(w, h, [
        { text: "HUMBUG", size: 0.34, fill: GOLD_FILL, y: 0.5 },
        { text: "HEIST", size: 0.3, fill: ["#ffffff", "#ff5a7a", "#b3122a"], y: 0.8 },
      ], { text: "LIAM'S", y: 0.15, fill: "#b3122a", trim: "#ffd23f" }),
    make: moneyBag(0xa8743a, "£"),
    loot,
    lootGlow: { gold: 0xffd23f, pink: 0x7cff9a, blue: 0xcfe3ff, dud: 0x000000 },
    decor: (g) => {
      for (const sx of [-1, 1]) {
        const lamp = streetLamp();
        lamp.position.set(sx * 1.55, -0.3, -1.3);
        g.add(lamp);
        const h = halo(0xffd36a, 1.2, 0.5);
        h.position.set(sx * 1.55, 1.08, -1.25);
        g.add(h);
      }
    },
  };
}
