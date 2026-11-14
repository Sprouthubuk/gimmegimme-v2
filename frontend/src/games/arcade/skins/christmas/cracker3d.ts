import * as THREE from "three";
import type { Colour, Slot, Snap } from "./crackerState";
import type { SceneCtx, SceneHandle } from "../../three/Scene3D";
import { clamp01, coinMesh, damp, ease, glossy, gradientTexture, halo, labelSprite, logoPlate, metal, outline, roundedBox, studioLights, GOLD } from "../../three/kit";
import { GOLD_FILL, signTexture } from "../../three/signs";

/**
 * Chris Cracker's Cash Bang in 3D: shiny crackers on a market-stall table under festoon lights. Which
 * cracker is where and which ticket each pull shows come from the board's crackerState reducer; this only
 * draws the crackers, the snap and what fell out.
 */
export interface CrackerState3D {
  slots: Slot[];
  snaps: Snap[];
  colours: readonly Colour[];
  labelFor: (snap: Snap) => string | null;
  pull: (slot: number) => void;
  done: boolean;
}

const BODY: Record<Colour, number> = { red: 0xe0283a, green: 0x1fae5b, gold: 0xffc23d };
const BAND: Record<Colour, number> = { red: GOLD, green: GOLD, gold: 0xe0283a };
const YS = [0.42, 0.02, -0.38, -0.78];

/** One half of a cracker, lying along +x from the join. */
function half(colour: Colour): THREE.Group {
  const g = new THREE.Group();
  const body = glossy(BODY[colour], { roughness: 0.18, clearcoat: 1 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.48, 28), body);
  tube.rotation.z = Math.PI / 2;
  tube.position.x = 0.24;
  outline(tube, 0.012);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.12, 22), body);
  neck.rotation.z = Math.PI / 2;
  neck.position.x = 0.54;
  const end = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.07, 0.24, 22), body);
  end.rotation.z = Math.PI / 2;
  end.position.x = 0.72;
  outline(end, 0.012);
  // Frilly paper at the end.
  const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.08, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd23f, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }));
  frill.rotation.z = Math.PI / 2;
  frill.position.x = 0.87;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 10, 28), metal(BAND[colour], 0.25));
  band.rotation.y = Math.PI / 2;
  band.position.x = 0.36;
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  shine.position.set(0.26, 0.08, 0.135);
  g.add(tube, neck, end, frill, band, shine);
  return g;
}

function cracker(colour: Colour) {
  const g = new THREE.Group();
  const left = half(colour);
  left.scale.x = -1;
  const right = half(colour);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 28), metal(BAND[colour], 0.25));
  ribbon.rotation.y = Math.PI / 2;
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), metal(BAND[colour], 0.25));
  bow.position.y = 0.17;
  ribbon.add(bow);
  g.add(left, right, ribbon);
  return { g, left, right, ribbon };
}

export function buildCrackerScene(ctx: SceneCtx<CrackerState3D>): SceneHandle {
  const { scene, camera, reducedMotion, fx } = ctx;
  scene.background = gradientTexture([
    [0, "#3a0710"],
    [0.55, "#5c0d18"],
    [1, "#1a0207"],
  ]);
  studioLights(scene, { key: 0xfff1e0, rim: 0xffc23d, fill: 0xff8a8a });
  camera.position.set(0, 0.2, 4.4);
  const look = new THREE.Vector3(0, -0.05, 0);
  camera.lookAt(look);
  const world = new THREE.Group();
  scene.add(world);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6 * (360 / 1024)),
    new THREE.MeshBasicMaterial({
      map: signTexture(1024, 360, [
        { text: "CHRIS CRACKER'S", size: 0.28, fill: ["#ffe0e0", "#ff4a5a", "#b0101e"], y: 0.3 },
        { text: "CASH BANG!", size: 0.44, fill: GOLD_FILL, y: 0.72 },
      ]),
      transparent: true,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 1.08, -0.4);
  world.add(sign);
  // Festoon lights.
  const bulbs: THREE.Sprite[] = [];
  for (let i = 0; i < 13; i++) {
    const x = -1.7 + (i / 12) * 3.4;
    const y = 1.55 - Math.cos(((i / 12) - 0.5) * Math.PI) * 0.18;
    const c = [0xffd23f, 0xff4a5a, 0x5cf0a0][i % 3];
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    b.position.set(x, y, -0.3);
    const h = halo(c, 0.3, 0.7);
    h.position.copy(b.position);
    world.add(b, h);
    bulbs.push(h);
  }
  // The table.
  const table = new THREE.Mesh(roundedBox(3.4, 0.14, 1.2, 0.05), glossy(0x7a4a26, { roughness: 0.55, clearcoat: 0.3 }));
  table.position.set(0, -1.02, -0.1);
  outline(table, 0.015);
  world.add(table);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x0f4a2c, roughness: 0.85 }));
  cloth.position.set(0, -0.2, -0.45);
  world.add(cloth);
  const logo = logoPlate(0.5);
  logo.position.set(1.25, -1.0, 0.52);
  world.add(logo);

  interface Place {
    serial: number | null;
    c: ReturnType<typeof cracker> | null;
    spawnAt: number;
    pullAt: number;
    snapped: boolean;
    bang: THREE.Sprite | null;
    result: THREE.Object3D | null;
    resultAt: number;
    tilt: number;
  }
  const places: Place[] = YS.map(() => ({ serial: null, c: null, spawnAt: 0, pullAt: -1, snapped: false, bang: null, result: null, resultAt: -1, tilt: 0 }));
  let celebrated = false;

  return {
    update(dt, t) {
      const s = ctx.get();
      s.slots.forEach((slot, i) => {
        const pl = places[i];
        const y = YS[i];
        if (slot.serial !== pl.serial) {
          if (pl.c) world.remove(pl.c.g);
          if (pl.bang) world.remove(pl.bang);
          pl.c = null;
          pl.bang = null;
          pl.serial = slot.serial;
          pl.pullAt = -1;
          pl.snapped = false;
          if (slot.serial !== null) {
            pl.c = cracker(s.colours[slot.serial] ?? "red");
            pl.c.g.traverse((o) => (o.userData.slot = i));
            pl.tilt = ((((slot.serial * 37) % 7) - 3) * 0.02);
            world.add(pl.c.g);
            pl.spawnAt = t;
          }
        }
        if (pl.c && pl.pullAt < 0) {
          const k = reducedMotion ? 1 : ease.outBack(clamp01((t - pl.spawnAt) / 0.5), 1.4);
          pl.c.g.position.set((1 - k) * 3.5 * (i % 2 ? 1 : -1), y, 0.1);
          pl.c.g.rotation.set(reducedMotion ? 0 : Math.sin(t * 1.2 + i) * 0.15, 0, pl.tilt + (reducedMotion ? 0 : Math.sin(t * 1.6 + i * 2) * 0.02));
        }
        if (slot.pulled && pl.pullAt < 0) pl.pullAt = t;
        if (pl.c && pl.pullAt >= 0) {
          const e = t - pl.pullAt;
          // Tug, then snap apart.
          if (e < 0.38 && !reducedMotion) {
            const w = Math.sin(e * 60) * 0.03 * (e / 0.38);
            pl.c.left.position.x = -e * 0.15 + w;
            pl.c.right.position.x = e * 0.15 - w;
          } else {
            if (!pl.snapped) {
              pl.snapped = true;
              pl.c.ribbon.visible = false;
              const at = new THREE.Vector3(0, y, 0.4);
              if (!reducedMotion) {
                fx.sparkBurst(at, 40, 2.2);
                ctx.shake(0.035, 220);
                pl.bang = labelSprite("BANG!", 0.36, { fill: "#ffe11a", stroke: "#141414" });
                pl.bang.position.copy(at).add(new THREE.Vector3(0, 0, 0.2));
                world.add(pl.bang);
              }
              const snap = s.snaps.find((sn) => sn.slot === i);
              const label = snap ? s.labelFor(snap) : null;
              if (pl.result) world.remove(pl.result);
              if (label) {
                const c = coinMesh(label, 0.22, "gold");
                const h = halo(0xffd84a, 1.0, 0.6);
                h.position.z = -0.1;
                c.add(h);
                pl.result = c;
                fx.confettiBurst(at, 50, 1.8, 1.4);
              } else pl.result = labelSprite("No win", 0.17, { fill: "#f2e6e6", stroke: "#141414" });
              pl.result.userData.base = pl.result.scale.clone();
              world.add(pl.result);
              pl.resultAt = t;
            }
            const k = reducedMotion ? 1 : ease.outCubic(clamp01((e - 0.38) / 0.5));
            pl.c.left.position.x = -0.06 - k * 0.42;
            pl.c.right.position.x = 0.06 + k * 0.42;
            pl.c.left.rotation.z = k * 0.12;
            pl.c.left.position.y = pl.c.right.position.y = -k * 0.04;
            pl.c.right.rotation.z = -k * 0.12;
            if (pl.bang) {
              const b = clamp01((e - 0.38) / 0.6);
              pl.bang.material.opacity = 1 - b;
              pl.bang.scale.set(1.15 * (0.6 + b * 0.8), 0.36 * (0.6 + b * 0.8), 1);
              pl.bang.position.y = y + 0.1 + b * 0.25;
            }
          }
        }
        if (pl.result) {
          const k = reducedMotion ? 1 : ease.outBack(clamp01((t - pl.resultAt) / 0.4), 2);
          pl.result.scale.copy(pl.result.userData.base as THREE.Vector3).multiplyScalar(Math.max(0.01, k));
          pl.result.position.set(0, y + (reducedMotion ? 0 : Math.sin(t * 3 + i) * 0.015), 0.45);
          if (pl.result instanceof THREE.Group) pl.result.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - (t - pl.resultAt)) * 8 + Math.sin(t * 2) * 0.2;
          if (!s.snaps.some((sn) => sn.slot === i) && t - pl.resultAt > 0.3) {
            world.remove(pl.result);
            pl.result = null;
          }
        }
      });
      bulbs.forEach((b, k) => (b.material.opacity = reducedMotion ? 0.7 : 0.45 + 0.35 * Math.sin(t * 3 + k * 1.7)));
      if (s.done && !celebrated) {
        celebrated = true;
        if (s.snaps.some((sn) => s.labelFor(sn))) fx.confettiBurst(new THREE.Vector3(0, 0.6, 0.6), 100, 2.4, 2);
      }
      camera.position.z = damp(camera.position.z, 4.4, 2, dt);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      const hit = ctx.pick(places.map((p) => p.c?.g).filter(Boolean) as THREE.Object3D[], e);
      const slot = hit?.object.userData.slot;
      if (typeof slot === "number") s.pull(slot);
    },
  };
}
