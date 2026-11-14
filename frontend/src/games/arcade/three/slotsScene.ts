import * as THREE from "three";
import type { SlotSymbol, SlotsLayout } from "../games/generators";
import type { SlotsPhase } from "../games/slots/useSlotsSpin";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { clamp01, coinMesh, damp, ease, glass, glossy, glow, gradientTexture, halo, logoPlate, metal, outline, roundedBox, studioLights, GOLD } from "./kit";

/**
 * A 3D slot machine: three drums printed with the board's own symbols. The board's useSlotsSpin decides
 * when each reel stops and generateSlots decides what it shows; this only turns the drums and lands each
 * on its window. Before the spin the drums show other symbols, so the result is never on show early.
 */
export interface SlotsState {
  phase: SlotsPhase;
  stopped: number;
  win: boolean;
  /** Pull the lever (tap on the machine). */
  pull: () => void;
}

export interface SlotsSkin3D {
  cabinet: number;
  cabinetDark: number;
  trim: number;
  sky: [number, string][];
  reelFace: string;
  sign: (w: number, h: number) => THREE.Texture;
  icon: (symbol: SlotSymbol) => Promise<CanvasImageSource>;
  bulbs: number[];
  /** Win shower: coins plus optional extras (notes…). */
  showerLabel?: string;
  decor?: (g: THREE.Group, ctx: SceneCtx<SlotsState>) => void;
}

const N = 12; // cells round each drum
const R = 0.5;
const REEL_W = 0.5;
const GAP = 0.06;
const CELL = (Math.PI * 2) / N;
const theta = (k: number) => (k + 0.5) * CELL;

export function buildSlotsScene(ctx: SceneCtx<SlotsState>, skin: SlotsSkin3D, layout: SlotsLayout): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng } = ctx;
  scene.background = gradientTexture(skin.sky);
  studioLights(scene);
  const front = new THREE.PointLight(0xfff4e0, 2.2, 6, 1.6);
  front.position.set(0, 0.3, 1.8);
  scene.add(front);
  camera.position.set(0, 0.3, 6.6);
  const look = new THREE.Vector3(0, 0.2, 0);
  camera.lookAt(look);

  const machine = new THREE.Group();
  scene.add(machine);
  const body = glossy(skin.cabinet, { roughness: 0.4, clearcoat: 0.8 });
  const dark = glossy(skin.cabinetDark, { roughness: 0.55 });
  const trim = metal(skin.trim, 0.2);

  // Cabinet: a big rounded body with a dark window for the reels, a curved top with the sign.
  const cab = new THREE.Mesh(roundedBox(2.55, 3.55, 1.2, 0.22), body);
  cab.position.set(0, 0.05, -0.2);
  outline(cab, 0.03);
  machine.add(cab);
  // A deep bezel round the drums, gold-edged, standing out from the cabinet.
  const bez = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(roundedBox(w, h, 0.62, 0.05), dark);
    m.position.set(x, y, 0.66);
    outline(m, 0.02);
    machine.add(m);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h - 0.06, 0.02), trim);
    edge.position.set(x, y, 0.975);
    machine.add(edge);
  };
  bez(2.2, 0.16, 0, 0.83);
  bez(2.2, 0.16, 0, -0.53);
  bez(0.16, 1.52, -1.02, 0.15);
  bez(0.16, 1.52, 1.02, 0.15);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.25), new THREE.MeshBasicMaterial({ color: 0x0b0710 }));
  back.position.set(0, 0.15, 0.41);
  machine.add(back);
  const signTex = skin.sign(1024, 360);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * (360 / 1024)), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(0, 1.4, 0.42);
  machine.add(sign);
  const logo = logoPlate(0.7);
  logo.position.set(0, -1.32, 0.42);
  machine.add(logo);
  skin.decor?.(machine, ctx);

  // Bulbs round the reel window.
  const bulbs: { m: THREE.Mesh; h: THREE.Sprite }[] = [];
  const bulbGeo = new THREE.SphereGeometry(0.04, 14, 10);
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) ring.push(new THREE.Vector3(-1.08 + i * 0.216, 0.92, 0.99));
  for (let i = 1; i <= 5; i++) ring.push(new THREE.Vector3(1.08, 0.92 - i * 0.26, 0.99));
  for (let i = 9; i >= 0; i--) ring.push(new THREE.Vector3(-1.08 + i * 0.216, -0.62, 0.99));
  for (let i = 4; i >= 1; i--) ring.push(new THREE.Vector3(-1.08, 0.92 - i * 0.26, 0.99));
  ring.forEach((p, i) => {
    const c = skin.bulbs[i % skin.bulbs.length];
    const m = new THREE.Mesh(bulbGeo, glow(c, 1.5));
    m.position.copy(p);
    const h = halo(c, 0.22, 0.6);
    h.position.copy(p).add(new THREE.Vector3(0, 0, 0.03));
    machine.add(m, h);
    bulbs.push({ m, h });
  });

  // The drums.
  const reels = layout.windows.map((win, r) => {
    const cells: SlotSymbol[] = Array.from({ length: N }, (_, k) => (k === 0 ? win[2] : k === 1 ? win[1] : k === 2 ? win[0] : layout.strips[r][k] ?? layout.strips[r][(k * 7) % layout.strips[r].length]));
    const canvas = document.createElement("canvas");
    const S = 192;
    canvas.width = S * N;
    canvas.height = S;
    const g = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = () => {
      const grad = g.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, "#e9e4ee");
      grad.addColorStop(0.5, skin.reelFace);
      grad.addColorStop(1, "#e9e4ee");
      g.fillStyle = grad;
      g.fillRect(0, 0, S * N, S);
      g.strokeStyle = "rgba(20,20,20,0.12)";
      for (let k = 0; k <= N; k++) {
        g.beginPath();
        g.moveTo(k * S, 0);
        g.lineTo(k * S, S);
        g.stroke();
      }
    };
    paint();
    Promise.all(cells.map((c) => skin.icon(c))).then((imgs) => {
      imgs.forEach((img, k) => {
        g.save();
        g.translate(k * S + S / 2, S / 2);
        g.rotate(Math.PI / 2);
        g.drawImage(img, -S * 0.39, -S * 0.39, S * 0.78, S * 0.78);
        g.restore();
      });
      tex.needsUpdate = true;
    }).catch(() => undefined);
    const geo = new THREE.CylinderGeometry(R, R, REEL_W, 64, 1, true);
    geo.rotateZ(Math.PI / 2);
    const drum = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    const pivot = new THREE.Group();
    pivot.position.set((r - 1) * (REEL_W + GAP), 0.15, 0.36);
    pivot.add(drum);
    // Drum edges.
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 8, 48), trim);
      rim.rotation.y = Math.PI / 2;
      rim.position.x = (sx * REEL_W) / 2;
      pivot.add(rim);
    }
    machine.add(pivot);
    const start = theta(6 + r) + Math.PI * 2 * 3;
    pivot.rotation.x = start;
    return { pivot, angle: start, speed: 0, stopFrom: 0, stopTo: 0, stopAt: -1, landed: false };
  });
  // Shade top and bottom of the window so the drums read as round.
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.2), new THREE.MeshBasicMaterial({ map: gradientTexture([[0, "rgba(0,0,0,0.85)"], [0.3, "rgba(0,0,0,0)"], [0.7, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.85)"]], 0), transparent: true, depthWrite: false }));
  shade.position.set(0, 0.15, 0.87);
  machine.add(shade);
  // Payline: a gold bar either side, and a glowing frame on a win.
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), trim);
    tip.rotation.z = (sx * Math.PI) / 2;
    tip.position.set(sx * 0.93, 0.15, 0.95);
    machine.add(tip);
  }
  const winFrame = new THREE.Mesh(roundedBox(1.72, 0.44, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  winFrame.position.set(0, 0.15, 0.875);
  machine.add(winFrame);
  const winHalo = halo(0xffd84a, 2.4, 0);
  winHalo.scale.set(2.6, 0.9, 1);
  winHalo.position.set(0, 0.15, 0.9);
  machine.add(winHalo);
  const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.2), glass(0xffffff, 0.06));
  glassPane.position.set(0, 0.15, 0.95);
  machine.add(glassPane);

  // The lever on the right.
  const leverPivot = new THREE.Group();
  leverPivot.position.set(1.42, 0.1, 0.05);
  machine.add(leverPivot);
  const leverBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 24), trim);
  leverBase.rotation.z = Math.PI / 2;
  machine.add(leverBase);
  leverBase.position.set(1.34, 0.1, 0.05);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 12), metal(0xdfe6ef));
  stick.position.y = 0.48;
  leverPivot.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16), glossy(BRAND.pink, { roughness: 0.15 }));
  knob.position.y = 0.98;
  outline(knob, 0.015);
  leverPivot.add(knob);

  // A tray at the bottom for the payout.
  const tray = new THREE.Mesh(roundedBox(1.4, 0.18, 0.5, 0.06), trim);
  tray.position.set(0, -0.98, 0.5);
  machine.add(tray);

  const coins: { g: THREE.Group; v: THREE.Vector3; w: number }[] = [];
  let phase: SlotsPhase = "ready";
  let pulledAt = -10;
  let landedAt = -1;
  let celebrated = false;

  return {
    update(dt, t) {
      const s = ctx.get();
      if (s.phase !== phase) {
        if (s.phase === "spinning") pulledAt = t;
        if (s.phase === "landed") landedAt = t;
        phase = s.phase;
      }
      // Lever: pulled down and springs back.
      const lp = t - pulledAt;
      leverPivot.rotation.x = lp < 0.6 ? (lp < 0.18 ? (lp / 0.18) * 1.1 : 1.1 * (1 - ease.outElastic(clamp01((lp - 0.18) / 0.42)))) : reducedMotion ? 0 : Math.sin(t * 2) * 0.02;
      // Drums.
      reels.forEach((rl, r) => {
        if (phase === "ready") return;
        if (s.stopped > r || phase === "landed") {
          if (rl.stopAt < 0) {
            rl.stopAt = t;
            rl.stopFrom = rl.angle;
            const target = theta(1);
            const d = (((target - rl.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            rl.stopTo = rl.angle + d + Math.PI * 2;
            if (!reducedMotion) ctx.shake(0.015, 120);
          }
          const k = reducedMotion ? 1 : clamp01((t - rl.stopAt) / 0.55);
          rl.angle = rl.stopFrom + (rl.stopTo - rl.stopFrom) * ease.outBack(k, 1.2);
        } else {
          rl.speed = damp(rl.speed, 16, 4, dt);
          rl.angle += rl.speed * dt;
        }
        rl.pivot.rotation.x = rl.angle;
      });
      // Bulbs chase; faster while spinning, flashing on a win.
      const won = phase === "landed" && s.win;
      bulbs.forEach((b, i) => {
        const v = won ? (Math.floor(t * 8) + i) % 2 : phase === "spinning" ? 0.5 + 0.5 * Math.sin(t * 14 - i * 0.8) : 0.5 + 0.5 * Math.sin(t * 3 - i * 0.5);
        const on = reducedMotion ? 0.8 : v;
        (b.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + on * 1.6;
        b.h.material.opacity = 0.1 + on * 0.7;
      });
      // Win: the payline lights up, coins pour into the tray, confetti.
      const wf = winFrame.material as THREE.MeshBasicMaterial;
      wf.opacity = damp(wf.opacity, won ? 0.25 + (reducedMotion ? 0 : 0.15 * Math.sin(t * 10)) : 0, 8, dt);
      winHalo.material.opacity = damp(winHalo.material.opacity, won ? 0.55 : 0, 6, dt);
      if (won && !celebrated && t - landedAt > 0.15) {
        celebrated = true;
        fx.confettiBurst(new THREE.Vector3(0, 0.6, 0.8), 140, 2.6, 2);
        fx.sparkBurst(new THREE.Vector3(0, 0.15, 0.7), 50, 2.4);
        ctx.shake(0.06, 420);
        if (!reducedMotion) {
          for (let i = 0; i < 14; i++) {
            const c = coinMesh(skin.showerLabel ?? "£", 0.11, "gold");
            c.position.set((rng() - 0.5) * 0.6, -0.55, 0.7);
            machine.add(c);
            coins.push({ g: c, v: new THREE.Vector3((rng() - 0.5) * 2.2, 1.2 + rng() * 1.8, 0.6 + rng() * 0.8), w: (rng() - 0.5) * 18 });
          }
        }
      }
      for (const c of coins) {
        c.v.y -= 6 * dt;
        c.g.position.addScaledVector(c.v, dt);
        if (c.g.position.y < -0.95) {
          c.g.position.y = -0.95;
          c.v.y *= -0.35;
          c.v.x *= 0.7;
          c.v.z *= 0.5;
        }
        c.g.rotation.x += c.w * dt;
        c.g.rotation.y += c.w * 0.6 * dt;
      }
      camera.position.z = damp(camera.position.z, won ? 6.2 : 6.6, 2, dt);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.phase !== "ready") return;
      if (ctx.pick([machine], e)) s.pull();
    },
  };
}
