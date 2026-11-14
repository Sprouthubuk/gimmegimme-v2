import * as THREE from "three";
import type { SlotSymbol } from "../../games/generators";
import type { SceneCtx } from "../../three/Scene3D";
import type { SlotsSkin3D, SlotsState } from "../../three/slotsScene";
import { glossy, outline } from "../../three/kit";
import { GOLD_FILL, SILVER_FILL, signTexture } from "../../three/signs";

/** Blankets & Banknotes in 3D: a glittering magenta fruit machine with gold trim and holly. */
function holly(g: THREE.Group, ctx: SceneCtx<SlotsState>) {
  void ctx;
  const leaf = glossy(0x2f9a44, { roughness: 0.35 });
  const berry = glossy(0xe0283a, { roughness: 0.15 });
  for (const sx of [-1, 1]) {
    const sprig = new THREE.Group();
    for (const a of [-0.5, 0.5]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), leaf);
      l.scale.set(1, 0.42, 0.18);
      l.rotation.z = a;
      l.position.set(a * 0.22, 0, 0);
      outline(l, 0.01);
      sprig.add(l);
    }
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), berry);
      b.position.set((k - 1) * 0.07, k === 1 ? -0.07 : 0, 0.06);
      outline(b, 0.008);
      sprig.add(b);
    }
    sprig.position.set(sx * 1.02, 1.7, 0.45);
    sprig.rotation.z = sx * 0.25;
    g.add(sprig);
  }
}

export function blanketsSkin3D(icon: (s: SlotSymbol) => Promise<CanvasImageSource>): SlotsSkin3D {
  return {
    cabinet: 0xc4127a,
    cabinetDark: 0x2a0a1e,
    trim: 0xffc23d,
    sky: [
      [0, "#2a0a24"],
      [0.6, "#4a0f3a"],
      [1, "#1a0614"],
    ],
    reelFace: "#fffaf2",
    sign: (w, h) =>
      signTexture(w, h, [
        { text: "BLANKETS", size: 0.36, fill: GOLD_FILL, y: 0.27 },
        { text: "&", size: 0.22, fill: ["#ffffff", "#ff8ac4", "#c4127a"], y: 0.55 },
        { text: "BANKNOTES", size: 0.34, fill: SILVER_FILL, y: 0.8 },
      ]),
    icon,
    bulbs: [0xffd23f, 0xffffff, 0xff5aa8],
    decor: holly,
  };
}
