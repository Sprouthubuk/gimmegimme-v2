import * as THREE from "three";
import type { WheelSegment } from "../../games/generators";
import type { SceneCtx, SceneHandle } from "../../three/Scene3D";
import { clamp01, coinMesh, damp, ease, glossy, gradientTexture, halo, labelSprite, logoPlate, metal, outline, roundedBox, studioLights, GOLD } from "../../three/kit";
import { GOLD_FILL, signTexture } from "../../three/signs";

/**
 * Dasher's Dosh Drop in 3D: twelve snowy houses round a ring under the northern lights, and Dasher pulling
 * the sleigh round above them. Where the sleigh is comes from the board (its angle, set by the same timing
 * as the flat version); where it lands was fixed before the board appeared.
 */
export interface SleighState3D {
  phase: "flying" | "stopping" | "landed";
  /** Degrees clockwise from the top of the ring, as the board draws it. */
  angle: { current: number };
  /** The board's radius: FLIGHT_R while flying, a little less once it settles. */
  height: { current: number };
  segments: readonly WheelSegment[];
  target: number;
  stop: () => void;
}

const ROOF: Record<WheelSegment["tone"], number> = { yellow: 0xe6b422, cyan: 0x149e8a, pink: 0xb9c3d0, white: 0x22356b };
const R_HOUSE = 1.08;

function house(roofColour: number) {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(roundedBox(0.3, 0.24, 0.26, 0.03), glossy(0xf4e2c6, { roughness: 0.5 }));
  walls.position.y = 0.12;
  outline(walls, 0.008);
  const roofGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 3, 1);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.rotateX(Math.PI / 6 + Math.PI);
  const roof = new THREE.Mesh(roofGeo, glossy(roofColour, { roughness: 0.35 }));
  roof.position.y = 0.3;
  roof.scale.set(1, 0.75, 0.95);
  outline(roof, 0.008);
  const snow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.12), glossy(0xffffff, { roughness: 0.6 }));
  snow.position.set(0, 0.41, 0);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), glossy(0x4a5a80, { roughness: 0.6 }));
  chimney.position.set(0.08, 0.42, -0.04);
  outline(chimney, 0.006);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd86a, toneMapped: false }));
  win.position.set(0, 0.12, 0.131);
  g.add(walls, roof, snow, chimney, win);
  return { g, win, chimney };
}

function reindeer(dasher: boolean): THREE.Group {
  const g = new THREE.Group();
  const fur = glossy(0xc58b4e, { roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.12, 6, 12), fur);
  body.rotation.z = Math.PI / 2;
  outline(body, 0.006);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), fur);
  head.position.set(0.1, 0.06, 0);
  outline(head, 0.006);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), glossy(dasher ? 0xffd23f : 0x3a2414));
  nose.position.set(0.14, 0.055, 0);
  const antler = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.7 });
  for (const z of [-0.02, 0.02]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), antler);
    a.position.set(0.09, 0.12, z);
    a.rotation.z = -0.3;
    g.add(a);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.06, 0.025], [0.06, -0.025], [-0.06, 0.025], [-0.06, -0.025]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), antler);
    l.geometry.translate(0, -0.04, 0);
    l.position.set(x, -0.02, z);
    g.add(l);
    legs.push(l);
  }
  g.userData.legs = legs;
  g.add(body, head, nose);
  return g;
}

function sleighModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(0.3, 0.14, 0.18, 0.05), glossy(0x1d2d5c, { roughness: 0.25, clearcoat: 1 }));
  body.position.y = 0.06;
  outline(body, 0.01);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.02, 0.19), metal(GOLD, 0.2));
  trim.position.y = 0.12;
  const back = new THREE.Mesh(roundedBox(0.08, 0.16, 0.18, 0.04), glossy(0x1d2d5c, { roughness: 0.25 }));
  back.position.set(-0.13, 0.12, 0);
  outline(back, 0.01);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), glossy(0x19c3a8, { roughness: 0.4 }));
  sack.position.set(-0.05, 0.18, 0);
  outline(sack, 0.008);
  const gift = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glossy(0xffd23f));
  gift.position.set(0.04, 0.16, 0.02);
  outline(gift, 0.006);
  const runnerCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.17, -0.03, 0), new THREE.Vector3(0.14, -0.03, 0), new THREE.Vector3(0.2, 0.02, 0), new THREE.Vector3(0.17, 0.06, 0)]);
  for (const z of [-0.08, 0.08]) {
    const r = new THREE.Mesh(new THREE.TubeGeometry(runnerCurve, 20, 0.01, 8), metal(GOLD, 0.2));
    r.position.z = z;
    g.add(r);
  }
  const team = new THREE.Group();
  const d1 = reindeer(false);
  d1.position.set(0.38, 0.08, 0);
  const d2 = reindeer(true);
  d2.position.set(0.62, 0.1, 0);
  team.add(d1, d2);
  const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), metal(GOLD));
  rein.rotation.z = Math.PI / 2 - 0.08;
  rein.position.set(0.4, 0.1, 0);
  g.add(body, trim, back, sack, gift, team, rein);
  return { g, deer: [d1, d2] };
}

export function buildSleighScene(ctx: SceneCtx<SleighState3D>): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng } = ctx;
  scene.background = gradientTexture([
    [0, "#1f3672"],
    [0.6, "#0f1d48"],
    [1, "#050b1f"],
  ]);
  studioLights(scene, { key: 0xe8f0ff, rim: 0x7cf0c4, fill: 0x8fa6ff });
  camera.position.set(0, 2.5, 3.9);
  const look = new THREE.Vector3(0, 0.25, 0);
  camera.lookAt(look);
  const world = new THREE.Group();
  scene.add(world);

  // Northern lights and stars.
  const aurora = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.6),
    new THREE.MeshBasicMaterial({
      map: gradientTexture(
        [
          [0, "rgba(25,195,168,0)"],
          [0.5, "rgba(124,240,196,0.55)"],
          [1, "rgba(25,195,168,0)"],
        ],
        0,
      ),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aurora.position.set(0, 0.9, -2.2);
  aurora.lookAt(camera.position);
  world.add(aurora);
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(160 * 3);
  for (let i = 0; i < 160; i++) {
    sp[i * 3] = (rng() - 0.5) * 7;
    sp[i * 3 + 1] = rng() * 2.5 - 0.6;
    sp[i * 3 + 2] = -2.4 - rng();
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.9 }));
  world.add(stars);

  // Sign hung over the back of the ring.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 2.3 * (360 / 1024)),
    new THREE.MeshBasicMaterial({
      map: signTexture(1024, 360, [
        { text: "DASHER'S", size: 0.3, fill: ["#e0fff6", "#3fe0c0", "#0f8a74"], y: 0.3 },
        { text: "DOSH DROP", size: 0.44, fill: GOLD_FILL, y: 0.72 },
      ]),
      transparent: true,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 1.0, -1.75);
  sign.lookAt(camera.position);
  world.add(sign);

  // The snowy ring, silver rim with lights, and the moon in the middle.
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.55, 0.12, 64), glossy(0xd6e2f2, { roughness: 0.7 }));
  ground.position.y = -0.06;
  outline(ground, 0.015);
  world.add(ground);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.53, 0.035, 10, 96), metal(0xdfe6ef, 0.2));
  rim.rotation.x = Math.PI / 2;
  world.add(rim);
  const bulbs: THREE.Sprite[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const c = [0xffd23f, 0xffffff, 0x3fe0c0, 0xffffff][i % 4];
    const h = halo(c, 0.18, 0.8);
    h.position.set(Math.sin(a) * 1.53, 0.04, -Math.cos(a) * 1.53);
    world.add(h);
    bulbs.push(h);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 22), new THREE.MeshStandardMaterial({ color: 0xf2f5fb, emissive: 0x8fa6c8, emissiveIntensity: 0.35, roughness: 0.8 }));
  moon.position.y = 0.32;
  outline(moon, 0.012);
  world.add(moon);
  const moonGlow = halo(0xcfe0ff, 1.5, 0.35);
  moonGlow.position.copy(moon.position);
  world.add(moonGlow);
  const logo = logoPlate(0.46);
  logo.position.set(0, 0.36, 0.36);
  logo.lookAt(camera.position);
  world.add(logo);

  // Twelve houses, one per segment, with the prize on a tag above each.
  const s0 = ctx.get();
  const houses = s0.segments.map((seg, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const h = house(ROOF[seg.tone]);
    h.g.position.set(Math.sin(a) * R_HOUSE, 0, -Math.cos(a) * R_HOUSE);
    h.g.rotation.y = -a + Math.PI;
    h.g.scale.setScalar(0.8);
    world.add(h.g);
    const tag = labelSprite(seg.kind === "none" ? "NO WIN" : seg.label, 0.17, seg.kind === "none" ? { fill: "#a9b6cf", stroke: "#141414" } : { fill: "#ffe11a", stroke: "#141414" });
    tag.position.set(Math.sin(a) * (R_HOUSE - 0.42), 0.12, -Math.cos(a) * (R_HOUSE - 0.42));
    world.add(tag);
    return { ...h, tag, a };
  });

  const { g: sleigh, deer } = sleighModel();
  sleigh.scale.setScalar(1.3);
  world.add(sleigh);
  const trail: THREE.Sprite[] = Array.from({ length: 8 }, (_, k) => {
    const sp = halo(k % 2 ? 0xdff6ff : 0xffe27a, 0.12 - k * 0.01, 0.8);
    world.add(sp);
    return sp;
  });
  const history: THREE.Vector3[] = [];

  let landedAt = -1;
  let result: THREE.Object3D | null = null;
  const smoke: THREE.Sprite[] = [];

  return {
    update(dt, t) {
      const s = ctx.get();
      const deg = s.angle.current;
      const a = (deg * Math.PI) / 180;
      const h = s.height.current; // 80 flying, 74 landed
      const radius = R_HOUSE + 0.02;
      const y = 0.52 + (h - 74) * 0.065 + (s.phase === "flying" && !reducedMotion ? Math.sin(t * 3.8) * 0.03 : 0);
      sleigh.position.set(Math.sin(a) * radius, y, -Math.cos(a) * radius);
      // Face the way it is going (clockwise seen from above).
      sleigh.rotation.y = -a;
      sleigh.rotation.x = s.phase === "landed" ? 0 : -0.12;
      deer.forEach((d, k) => {
        (d.userData.legs as THREE.Mesh[]).forEach((l, j) => {
          l.rotation.z = s.phase === "landed" || reducedMotion ? 0 : Math.sin(t * 14 + j * 1.6 + k) * 0.6;
        });
      });
      history.unshift(sleigh.position.clone());
      if (history.length > 40) history.pop();
      trail.forEach((sp, k) => {
        const p = history[Math.min(history.length - 1, 3 + k * 4)];
        if (p) sp.position.copy(p).add(new THREE.Vector3(0, 0.05, 0));
        sp.visible = s.phase !== "landed" && !reducedMotion;
      });
      if (s.phase === "landed" && landedAt < 0) {
        landedAt = t;
        const hs = houses[s.target];
        const at = hs.g.localToWorld(hs.chimney.position.clone()).add(new THREE.Vector3(0, 0.12, 0));
        const seg = s.segments[s.target];
        for (let k = 0; k < 3; k++) {
          const p = halo(0xffffff, 0.12, 0.8);
          p.position.copy(at);
          world.add(p);
          smoke.push(p);
        }
        if (seg.kind === "prize") {
          result = coinMesh(seg.label, 0.26, "gold");
          const glowS = halo(0xffd84a, 1.3, 0.6);
          glowS.position.z = -0.1;
          result.add(glowS);
          fx.confettiBurst(at, 140, 2.4, 2.2);
          fx.sparkBurst(at, 40, 2);
          ctx.shake(0.04, 350);
        } else result = labelSprite("No win", 0.2, { fill: "#dfe6ef", stroke: "#141414" });
        result.userData.base = result.scale.clone();
        result.userData.from = at.clone();
        world.add(result);
      }
      houses.forEach((hs, i) => {
        const lit = s.phase === "landed" && i === s.target;
        (hs.win.material as THREE.MeshBasicMaterial).color.setHex(lit ? 0xfff2a8 : 0xffd86a);
        hs.g.scale.setScalar(damp(hs.g.scale.x, lit ? 0.95 : 0.8, 6, dt));
        hs.tag.material.opacity = damp(hs.tag.material.opacity, s.phase === "landed" && !lit ? 0.35 : 1, 5, dt);
      });
      smoke.forEach((p, k) => {
        const e = t - landedAt - k * 0.25;
        p.visible = e > 0;
        p.position.y += dt * 0.25;
        p.scale.setScalar(0.12 + Math.max(0, e) * 0.2);
        p.material.opacity = Math.max(0, 0.8 - e * 0.5);
      });
      if (result) {
        const e = clamp01((t - landedAt - 0.15) / 0.5);
        const k = reducedMotion ? 1 : ease.outBack(e, 2);
        const from = result.userData.from as THREE.Vector3;
        result.position.set(from.x * 0.6, from.y + 0.25 + k * 0.25, from.z * 0.6 + 0.5);
        result.scale.copy(result.userData.base as THREE.Vector3).multiplyScalar(Math.max(0.01, k));
        if (result instanceof THREE.Group) {
          result.lookAt(camera.position);
          result.rotateY(reducedMotion ? 0 : Math.max(0, 1 - (t - landedAt)) * 10);
        }
      }
      bulbs.forEach((b, k) => (b.material.opacity = reducedMotion ? 0.8 : 0.5 + 0.35 * Math.sin(t * 3 + k * 1.3)));
      aurora.material.opacity = reducedMotion ? 0.8 : 0.6 + 0.3 * Math.sin(t * 0.7);
      camera.lookAt(look);
    },
    pointer(kind) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.phase === "flying") s.stop();
    },
  };
}
