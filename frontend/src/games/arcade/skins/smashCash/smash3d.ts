import * as THREE from "three";
import type { Colour, Slot, Snap } from "../christmas/crackerState";
import type { SceneCtx, SceneHandle } from "../../three/Scene3D";
import { clamp01, coinMesh, damp, ease, glossy, gradientTexture, halo, labelSprite, logoPlate, metal, outline, roundedBox, studioLights, GOLD } from "../../three/kit";
import { GOLD_FILL, signTexture } from "../../three/signs";

/**
 * Smash My Cash in 3D: glass jars stuffed with cash on a neon shelf, and a golden sledgehammer. The table
 * state (which jar is where, which ticket each smash shows) is the board's crackerState reducer; this only
 * draws the jars, the swing, the shattering glass and what was inside.
 */
export interface SmashState {
  slots: Slot[];
  snaps: Snap[];
  colours: readonly Colour[];
  /** Label for a snap's prize, or null for no win. */
  labelFor: (snap: Snap) => string | null;
  smash: (slot: number) => void;
  done: boolean;
}

const TINT: Record<Colour, number> = { red: 0xff4fb0, green: 0x2ad4ff, gold: 0xffcc33 };
const XS = [-1.05, -0.35, 0.35, 1.05];
const SHELF_Y = -0.55;

function noteTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 128, 64);
  grad.addColorStop(0, "#ff9a8e");
  grad.addColorStop(1, "#a8283a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = "#7d1724";
  g.lineWidth = 4;
  g.strokeRect(6, 6, 116, 52);
  g.fillStyle = "#f6c4b2";
  g.beginPath();
  g.arc(32, 32, 14, 0, Math.PI * 2);
  g.fill();
  g.font = '28px "Lilita One"';
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("50", 86, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSmashScene(ctx: SceneCtx<SmashState>): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng } = ctx;
  scene.background = gradientTexture([
    [0, "#14061f"],
    [0.55, "#2a0a3e"],
    [1, "#0a0412"],
  ]);
  studioLights(scene, { key: 0xffffff, rim: 0xff4fb0, fill: 0x7b5cff });
  const spot = new THREE.SpotLight(0xffffff, 18, 8, 0.6, 0.6, 1.4);
  spot.position.set(0, 3, 2.5);
  spot.target.position.set(0, -0.4, 0);
  scene.add(spot, spot.target);
  camera.position.set(0, 0.45, 4.2);
  const look = new THREE.Vector3(0, -0.12, 0);
  camera.lookAt(look);

  const world = new THREE.Group();
  scene.add(world);
  // Sign with cracked gold letters.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.8 * (360 / 1024)),
    new THREE.MeshBasicMaterial({
      map: signTexture(1024, 360, [
        { text: "SMASH", size: 0.44, fill: GOLD_FILL, y: 0.32 },
        { text: "MY CASH", size: 0.34, fill: ["#ffd0ea", "#ff4fa8", "#c40066"], y: 0.76 },
      ]),
      transparent: true,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 0.66, -0.5);
  sign.scale.setScalar(0.86);
  world.add(sign);
  // Lasers sweeping behind.
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff3fa6, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const lasers = [0, 1].map((k) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 6), laserMat.clone());
    l.position.set(k ? 1.6 : -1.6, 1.5, -1.2);
    world.add(l);
    return l;
  });
  // The shelf.
  const shelf = new THREE.Mesh(roundedBox(3.2, 0.16, 0.9, 0.05), glossy(0x1b1028, { roughness: 0.3 }));
  shelf.position.set(0, SHELF_Y - 0.08, 0);
  outline(shelf, 0.015);
  world.add(shelf);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xff3fa6, toneMapped: false }));
  edge.position.set(0, SHELF_Y, 0.45);
  world.add(edge);
  const edgeGlow = halo(0xff3fa6, 1, 0.5);
  edgeGlow.scale.set(3.6, 0.3, 1);
  edgeGlow.position.set(0, SHELF_Y, 0.48);
  world.add(edgeGlow);
  const logo = logoPlate(0.55);
  logo.position.set(0, SHELF_Y - 0.4, 0.47);
  world.add(logo);

  const notes = noteTexture();
  const noteGeo = new THREE.BoxGeometry(0.26, 0.13, 0.01);
  const coinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.015, 20);
  const glassGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.56, 36, 1, true);
  const bottomGeo = new THREE.CircleGeometry(0.2, 36);
  const makeJar = (colour: Colour, serial: number) => {
    const g = new THREE.Group();
    const r = (k: number) => ((serial * 9301 + k * 49297) % 233280) / 233280;
    for (let k = 0; k < 9; k++) {
      const n = new THREE.Mesh(noteGeo, new THREE.MeshStandardMaterial({ map: notes, roughness: 0.6 }));
      n.position.set((r(k) - 0.5) * 0.22, -0.2 + k * 0.05, (r(k + 20) - 0.5) * 0.2);
      n.rotation.set(r(k + 40) * 0.6, r(k + 60) * 3, (r(k + 80) - 0.5) * 0.9);
      g.add(n);
    }
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(coinGeo, metal(GOLD, 0.25));
      c.position.set((r(k + 100) - 0.5) * 0.25, -0.25 + r(k + 110) * 0.05, (r(k + 120) - 0.5) * 0.25);
      c.rotation.set(r(k + 130) * 0.8, 0, r(k + 140) * 0.8);
      g.add(c);
    }
    const glassMat = new THREE.MeshPhysicalMaterial({ color: TINT[colour], roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 1, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 2;
    g.add(glass);
    const bottom = new THREE.Mesh(bottomGeo, glassMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.28;
    g.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 10, 36), new THREE.MeshPhysicalMaterial({ color: TINT[colour], roughness: 0.1, transparent: true, opacity: 0.6 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.28;
    g.add(rim);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 36), metal(GOLD, 0.2));
    lid.position.y = 0.33;
    outline(lid, 0.012);
    g.add(lid);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    sheen.position.set(-0.13, 0, 0.19);
    g.add(sheen);
    g.position.y = SHELF_Y + 0.29;
    return g;
  };
  const hammerOf = () => {
    const h = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.8, 12), metal(GOLD, 0.2));
    handle.position.y = 0.4;
    outline(handle, 0.008);
    const head = new THREE.Mesh(roundedBox(0.38, 0.18, 0.18, 0.03), metal(0xdfe6ef, 0.15));
    head.position.y = 0.82;
    outline(head, 0.012);
    h.add(handle, head);
    h.visible = false;
    return h;
  };

  interface Place {
    serial: number | null;
    jar: THREE.Group | null;
    spawnAt: number;
    smashAt: number;
    hammer: THREE.Group;
    shards: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[];
    result: THREE.Object3D | null;
    resultAt: number;
    shattered: boolean;
  }
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0.07, 0, -0.05, -0.05, 0, 0.06, -0.04, 0]), 3));
  shardGeo.computeVertexNormals();
  const places: Place[] = XS.map((x) => {
    const hammer = hammerOf();
    hammer.position.set(x + 0.55, SHELF_Y + 0.3, 0.25);
    world.add(hammer);
    return { serial: null, jar: null, spawnAt: 0, smashAt: -1, hammer, shards: [], result: null, resultAt: -1, shattered: false };
  });

  let celebratedDone = false;
  return {
    update(dt, t) {
      const s = ctx.get();
      s.slots.forEach((slot, i) => {
        const pl = places[i];
        if (slot.serial !== pl.serial) {
          // A new jar arrives (or the place empties).
          if (pl.jar) world.remove(pl.jar);
          for (const sh of pl.shards) world.remove(sh.m);
          pl.shards = [];
          pl.jar = null;
          pl.serial = slot.serial;
          pl.smashAt = -1;
          pl.shattered = false;
          if (slot.serial !== null) {
            pl.jar = makeJar(s.colours[slot.serial] ?? "gold", slot.serial);
            pl.jar.position.x = XS[i];
            pl.jar.userData.slot = i;
            pl.jar.traverse((o) => (o.userData.slot = i));
            world.add(pl.jar);
            pl.spawnAt = t;
          }
        }
        if (pl.jar && pl.smashAt < 0) {
          const k = reducedMotion ? 1 : ease.outBounce(clamp01((t - pl.spawnAt) / 0.6));
          pl.jar.position.y = SHELF_Y + 0.29 + (1 - k) * 1.6;
          pl.jar.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.4 + i) * 0.03 + (((slot.serial ?? 0) * 37) % 7 - 3) * 0.01;
        }
        if (slot.pulled && pl.smashAt < 0) pl.smashAt = t;
        // The swing, then the glass goes.
        if (pl.smashAt >= 0) {
          const e = t - pl.smashAt;
          pl.hammer.visible = !reducedMotion && e < 0.7;
          pl.hammer.rotation.z = e < 0.3 ? 1.6 - ease.inOutCubic(e / 0.3) * 1.75 : -0.15 + Math.min(1, (e - 0.3) * 3) * 0.6;
          if (!pl.shattered && (e >= 0.3 || reducedMotion)) {
            pl.shattered = true;
            if (pl.jar) {
              pl.jar.getWorldPosition(new THREE.Vector3());
              const tint = TINT[s.colours[pl.serial ?? 0] ?? "gold"];
              if (!reducedMotion) {
                for (let k = 0; k < 16; k++) {
                  const m = new THREE.Mesh(shardGeo, new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.05, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
                  m.position.set(XS[i], SHELF_Y + 0.29 + (rng() - 0.3) * 0.4, (rng() - 0.5) * 0.2);
                  world.add(m);
                  pl.shards.push({ m, v: new THREE.Vector3((rng() - 0.5) * 3, rng() * 2.5 + 0.5, rng() * 2), w: new THREE.Vector3(rng() * 12, rng() * 12, rng() * 12) });
                }
                ctx.shake(0.04, 200);
              }
              world.remove(pl.jar);
              pl.jar = null;
            }
            const snap = s.snaps.find((sn) => sn.slot === i);
            const label = snap ? s.labelFor(snap) : null;
            if (pl.result) world.remove(pl.result);
            if (label) {
              const c = coinMesh(label, 0.3, "gold");
              const h = halo(0xffd84a, 1.4, 0.6);
              h.position.z = -0.1;
              c.add(h);
              pl.result = c;
              fx.confettiBurst(new THREE.Vector3(XS[i], SHELF_Y + 0.4, 0.3), 40, 1.8, 1.6);
              fx.sparkBurst(new THREE.Vector3(XS[i], SHELF_Y + 0.4, 0.3), 24, 1.6);
            } else {
              pl.result = labelSprite("No win", 0.2, { fill: "#d8d0e8", stroke: "#141414" });
            }
            pl.result.userData.base = pl.result.scale.clone();
            pl.result.position.set(XS[i], SHELF_Y + 0.35, 0.3);
            world.add(pl.result);
            pl.resultAt = t;
          }
        }
        if (pl.result) {
          const k = reducedMotion ? 1 : ease.outBack(clamp01((t - pl.resultAt) / 0.45), 2);
          pl.result.scale.copy(pl.result.userData.base as THREE.Vector3).multiplyScalar(Math.max(0.01, k));
          pl.result.position.y = SHELF_Y + 0.35 + k * 0.2 + (reducedMotion ? 0 : Math.sin(t * 3 + i) * 0.02);
          if (pl.result instanceof THREE.Group) pl.result.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - (t - pl.resultAt)) * 8 + Math.sin(t * 2) * 0.2;
          // Cleared when the next jar comes in.
          if (!s.snaps.some((sn) => sn.slot === i) && t - pl.resultAt > 0.3) {
            world.remove(pl.result);
            pl.result = null;
          }
        }
        for (const sh of pl.shards) {
          sh.v.y -= 7 * dt;
          sh.m.position.addScaledVector(sh.v, dt);
          sh.m.rotation.x += sh.w.x * dt;
          sh.m.rotation.y += sh.w.y * dt;
          if (sh.m.position.y < SHELF_Y) {
            sh.m.position.y = SHELF_Y;
            sh.v.multiplyScalar(0.3);
            sh.v.y = Math.abs(sh.v.y) * 0.4;
          }
        }
      });
      lasers.forEach((l, k) => {
        l.rotation.z = reducedMotion ? (k ? -0.4 : 0.4) : Math.sin(t * 0.7 + k * 2) * 0.6;
      });
      if (s.done && !celebratedDone) {
        celebratedDone = true;
        if (s.snaps.some((sn) => s.labelFor(sn))) fx.confettiBurst(new THREE.Vector3(0, 0.6, 0.6), 100, 2.4, 2);
      }
      camera.position.z = damp(camera.position.z, 4.2, 2, dt);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      const hit = ctx.pick(places.map((p) => p.jar).filter(Boolean) as THREE.Object3D[], e);
      const slot = hit?.object.userData.slot;
      if (typeof slot === "number") s.smash(slot);
    },
  };
}
