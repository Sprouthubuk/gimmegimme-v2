import * as THREE from "three";
import { baubleLook, buildClawScene, type ClawSkin3D, type ClawState } from "../../three/clawScene";
import type { SceneCtx } from "../../three/Scene3D";
import { glossy, glow, outline } from "../../three/kit";

/** Demi's Grinchmas Gold in 3D: a red velvet cabinet, gold trim, glass baubles on a snowy night. */
function grinchSign(w: number, h: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  // "DEMI'S" plaque
  const pw = w * 0.3;
  const ph = h * 0.2;
  g.fillStyle = "#b3122a";
  g.strokeStyle = "#141414";
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(w / 2 - pw / 2, h * 0.04, pw, ph, 22);
  g.fill();
  g.stroke();
  g.strokeStyle = "#ffd23f";
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(w / 2 - pw / 2 + 12, h * 0.04 + 10, pw - 24, ph - 20, 14);
  g.stroke();
  g.font = `${h * 0.13}px "Lilita One"`;
  g.fillStyle = "#fff";
  g.fillText("DEMI'S", w / 2, h * 0.04 + ph / 2 + 3);
  // GRINCHMAS: green, furry edge
  const big = (text: string, y: number, size: number, top: string, mid: string, bot: string, fuzz: boolean) => {
    g.font = `${size}px "Lilita One"`;
    g.lineWidth = size * 0.2;
    g.strokeStyle = "#141414";
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillText(text, w / 2, y + size * 0.08);
    if (fuzz) {
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        g.strokeText(text, w / 2 + Math.cos(a) * 3, y + Math.sin(a) * 3);
      }
    } else g.strokeText(text, w / 2, y);
    const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, top);
    grad.addColorStop(0.5, mid);
    grad.addColorStop(1, bot);
    g.fillStyle = grad;
    g.fillText(text, w / 2, y);
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.save();
    g.beginPath();
    g.rect(0, y - size / 2, w, size * 0.32);
    g.clip();
    g.fillText(text, w / 2, y);
    g.restore();
  };
  big("GRINCHMAS", h * 0.52, h * 0.34, "#e6ff8a", "#9bdc28", "#4c9a12", true);
  big("GOLD", h * 0.84, h * 0.27, "#fff8cf", "#ffd23f", "#d98a00", false);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function scenery(g: THREE.Group, ctx: SceneCtx<ClawState>) {
  const { rng } = ctx;
  // Moon
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), glow(0xf2f6ff, 1.4));
  moon.position.set(0.62, 0.68, -0.68);
  g.add(moon);
  // Stars on the back wall
  const n = 40;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rng() - 0.5) * 2;
    pos[i * 3 + 1] = -0.2 + rng() * 1.3;
    pos[i * 3 + 2] = -0.69;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.02 })));
  // Snowy pines at the back corners
  const pine = (x: number, s: number) => {
    const p = new THREE.Group();
    const green = glossy(0x1b6b3a, { roughness: 0.5 });
    const snowMat = glossy(0xffffff, { roughness: 0.6 });
    [0, 1, 2].forEach((k) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2 - k * 0.05, 0.26, 18), green);
      cone.position.y = k * 0.15;
      outline(cone, 0.01);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1 - k * 0.025, 0.08, 18), snowMat);
      cap.position.y = k * 0.15 + 0.1;
      p.add(cone, cap);
    });
    p.position.set(x, -0.95, -0.55);
    p.scale.setScalar(s);
    g.add(p);
  };
  pine(-0.82, 1.15);
  pine(0.86, 0.95);
  // Snow drift on the floor
  const drift = new THREE.Mesh(new THREE.SphereGeometry(1.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glossy(0xf4f8ff, { roughness: 0.7, clearcoat: 0.3 }));
  drift.scale.set(0.95, 0.16, 0.55);
  drift.position.set(0, -1.12, -0.05);
  g.add(drift);
}

export const GRINCH_SKIN_3D: ClawSkin3D = {
  cabinet: 0xc8102e,
  cabinetDark: 0x7d0c18,
  trim: 0xffc23d,
  sky: [
    [0, "#0a1f2e"],
    [0.6, "#0f3a33"],
    [1, "#14503a"],
  ],
  wall: [
    [0, "#081b36"],
    [0.6, "#123c66"],
    [1, "#1e5a86"],
  ],
  floor: 0xeaf1fb,
  sign: grinchSign,
  item: baubleLook([0xe0283a, 0x3fae2a, 0xffd23f, 0xc9d6ea]),
  scenery,
  bulbs: [0xff3355, 0x33dd66, 0xffd23f, 0x33ccff],
  emptyText: "Empty bauble",
  snow: true,
};

export const buildGrinchClaw = (ctx: SceneCtx<ClawState>, pile: readonly { x: number; y: number }[]) => buildClawScene(ctx, GRINCH_SKIN_3D, pile);
