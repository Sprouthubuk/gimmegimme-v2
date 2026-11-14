import * as THREE from "three";
import type { BalloonColour, BalloonLook } from "../games/generators";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { clamp01, coinMesh, ease, glossy, gradientTexture, halo, labelSprite, metal, outline, studioLights } from "./kit";
import { PINK_FILL, YELLOW_FILL, signTexture } from "./signs";

/**
 * Balloon Pop in 3D: glossy balloons drifting up a fairground sky. The board's reducer decides which
 * ticket each pop shows (the Nth pop shows the Nth ticket); this draws the balloons, the dart and the burst.
 */
export interface BalloonState {
  lanes: { serial: number | null; hit: boolean }[];
  looks: readonly BalloonLook[];
  /** Results being shown, by lane: the prize label or null for no prize. */
  results: { lane: number; order: number; label: string | null }[];
  pop: (lane: number) => void;
  laneCount: number;
}

const COLOURS: Record<BalloonColour, number> = { pink: BRAND.pink, cyan: BRAND.cyan, yellow: 0xffd60a };
const COLUMNS = [10, 30, 50, 70, 90, 20, 40, 60, 80];
const SKY_W = 2.6;
const BOTTOM = -1.6;
const TOP = 1.6;

function balloonGeo(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 24; k++) {
    const v = k / 24;
    const a = v * Math.PI;
    // Teardrop: fuller at the top.
    const r = Math.sin(a) * (0.2 + 0.05 * Math.cos(a)) * (v < 0.15 ? 0.4 + v * 4 : 1);
    pts.push(new THREE.Vector2(Math.max(0.005, r), -Math.cos(a) * 0.26));
  }
  return new THREE.LatheGeometry(pts, 32);
}

export function buildBalloonScene(ctx: SceneCtx<BalloonState>): SceneHandle {
  const { scene, camera, reducedMotion, fx } = ctx;
  scene.background = gradientTexture([
    [0, "#3a1660"],
    [0.5, "#7b2cbf"],
    [1, "#ff6bb8"],
  ], 0.3);
  studioLights(scene, { strength: 1.1 });
  camera.position.set(0, 0, 5.4);
  camera.lookAt(0, 0, 0);
  const world = new THREE.Group();
  scene.add(world);
  // Sign and bunting.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4 * (360 / 1024)),
    new THREE.MeshBasicMaterial({ map: signTexture(1024, 360, [{ text: "BALLOON", size: 0.36, fill: PINK_FILL, y: 0.32 }, { text: "POP", size: 0.4, fill: YELLOW_FILL, y: 0.74 }]), transparent: true, toneMapped: false }),
  );
  sign.position.set(0, 1.6, -0.6);
  world.add(sign);
  const flagCols = [BRAND.pink, BRAND.yellow, BRAND.cyan];
  for (let i = 0; i < 11; i++) {
    const x = -1.5 + i * 0.3;
    const y = 1.05 - 0.12 * (1 - Math.pow(x / 1.5, 2));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 3), glossy(flagCols[i % 3], { roughness: 0.4 }));
    f.rotation.z = Math.PI;
    f.position.set(x, y, -0.4);
    outline(f, 0.008);
    world.add(f);
  }
  // Soft clouds.
  for (let i = 0; i < 5; i++) {
    const c = halo(0xffffff, 1.2 + (i % 2) * 0.5, 0.18);
    c.position.set(-1.4 + i * 0.75, -0.6 + ((i * 37) % 5) * 0.35, -1.5);
    world.add(c);
  }

  const geo = balloonGeo();
  const knotGeo = new THREE.ConeGeometry(0.035, 0.05, 10);
  const mats = Object.fromEntries((Object.keys(COLOURS) as BalloonColour[]).map((c) => [c, glossy(COLOURS[c], { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.55 })])) as unknown as Record<BalloonColour, THREE.Material>;
  const stringMat = new THREE.LineBasicMaterial({ color: 0x141414 });
  const makeBalloon = (colour: BalloonColour, size: "s" | "m" | "l") => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(geo, mats[colour]);
    outline(b, 0.012);
    g.add(b);
    const k = new THREE.Mesh(knotGeo, mats[colour]);
    k.position.y = -0.285;
    g.add(k);
    const pts = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.9) * 0.025, -0.3 - i * 0.03, 0));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), stringMat));
    g.scale.setScalar(size === "s" ? 0.8 : size === "l" ? 1.15 : 1);
    return g;
  };
  const dartGeo = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 10), metal(0xdfe6ef));
  tip.position.y = 0.12;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), glossy(BRAND.yellow));
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), glossy(BRAND.pink));
  fin.position.y = -0.1;
  fin.rotation.x = Math.PI;
  dartGeo.add(tip, shaft, fin);

  interface LaneView {
    serial: number | null;
    obj: THREE.Group | null;
    born: number;
    hitAt: number;
    pos: THREE.Vector3;
    dart: THREE.Group | null;
    burst: boolean;
  }
  const lanes: LaneView[] = COLUMNS.map(() => ({ serial: null, obj: null, born: 0, hitAt: -1, pos: new THREE.Vector3(), dart: null, burst: false }));
  const results = new Map<number, { obj: THREE.Object3D; at: number; x: number; y: number }>();

  return {
    update(dt, t) {
      const s = ctx.get();
      s.lanes.forEach((lane, i) => {
        const v = lanes[i];
        if (lane.serial !== v.serial) {
          if (v.obj) world.remove(v.obj);
          v.obj = null;
          v.serial = lane.serial;
          v.hitAt = -1;
          v.burst = false;
          if (lane.serial !== null) {
            const look = s.looks[lane.serial];
            v.obj = makeBalloon(look.colour, look.size);
            v.obj.userData.lane = i;
            v.obj.traverse((o) => (o.userData.lane = i));
            world.add(v.obj);
            // The first balloons start spread up the sky; later ones rise from the bottom.
            v.born = lane.serial < s.laneCount ? t - look.duration * ((i * 0.618 + 0.08) % 1) : t;
          }
        }
        if (v.obj && v.serial !== null) {
          const look = s.looks[v.serial];
          if (!lane.hit) {
            const p = ((t - v.born) / look.duration) % 1;
            const y = reducedMotion ? (i < 5 ? 0.6 : -0.6) : BOTTOM + (TOP - BOTTOM) * p;
            const x = (COLUMNS[i] / 100 - 0.5) * SKY_W + (reducedMotion ? 0 : Math.sin(t * 1.3 + i) * look.sway * 0.004);
            v.obj.position.set(x, y, (i % 3) * 0.12 - 0.12);
            v.obj.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.1 + i * 2) * 0.12;
            v.pos.copy(v.obj.position);
          } else {
            if (v.hitAt < 0) {
              v.hitAt = t;
              if (!reducedMotion) {
                v.dart = dartGeo.clone();
                v.dart.position.set(0, -2.2, 0.8);
                world.add(v.dart);
              }
            }
            const e = t - v.hitAt;
            if (v.dart) {
              const k = clamp01(e / 0.13);
              v.dart.position.lerpVectors(new THREE.Vector3(0, -2.2, 0.8), v.pos.clone().add(new THREE.Vector3(0, 0.05, 0.1)), k);
              v.dart.lookAt(v.pos);
              v.dart.rotateX(Math.PI / 2);
            }
            if (!v.burst && (e >= 0.13 || reducedMotion)) {
              v.burst = true;
              v.obj.visible = false;
              if (v.dart) {
                world.remove(v.dart);
                v.dart = null;
              }
              fx.sparkBurst(v.pos.clone(), 18, 1.8);
              ctx.shake(0.02, 100);
            }
            if (!v.burst) v.obj.scale.multiplyScalar(1 + dt * 2);
          }
        }
      });
      // Results float up from where each balloon burst.
      for (const r of s.results) {
        if (!results.has(r.order)) {
          const v = lanes[r.lane];
          const obj = r.label ? coinMesh(r.label, 0.2, "gold") : labelSprite("No prize", 0.15, { fill: "#ffffff", stroke: "#141414" });
          if (r.label) {
            const h = halo(0xffd84a, 0.9, 0.55);
            h.position.z = -0.08;
            obj.add(h);
            fx.confettiBurst(v.pos.clone(), 30, 1.6, 1.2);
          }
          obj.userData.base = obj.scale.clone();
          world.add(obj);
          results.set(r.order, { obj, at: t, x: v.pos.x, y: v.pos.y });
        }
      }
      for (const [order, r] of results) {
        if (!s.results.some((x) => x.order === order)) {
          world.remove(r.obj);
          results.delete(order);
          continue;
        }
        const e = t - r.at;
        const k = reducedMotion ? 1 : ease.outBack(clamp01(e / 0.35), 2);
        r.obj.scale.copy(r.obj.userData.base as THREE.Vector3).multiplyScalar(Math.max(0.01, k));
        r.obj.position.set(r.x, r.y + e * 0.25, 0.5);
        if (r.obj instanceof THREE.Group) r.obj.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - e) * 10;
      }
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      const hit = ctx.pick(lanes.map((l) => l.obj).filter((o): o is THREE.Group => !!o && o.visible), e);
      const lane = hit?.object.userData.lane;
      if (typeof lane === "number" && !s.lanes[lane].hit) s.pop(lane);
    },
  };
}
