import * as THREE from "three";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { coinMesh, damp, glossy, gradientTexture, halo, logoPlate, metal, outline, roundedBox, studioLights } from "./kit";
import { signTexture, type SignLine } from "./signs";

/**
 * A lit 3D stage behind an HTML board (the scratch cards): sign and logo at the top, light rays and
 * slow floating pieces round the edges, and a shower when the board says the ticket won. It draws
 * nothing about the result itself.
 */
export interface StageState {
  done: boolean;
  won: boolean;
}
export interface StageSkin3D {
  bg: [number, string][];
  sign: SignLine[];
  rays: number;
  floaters: "coins" | "bars" | "snow";
}

function goldBar(): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(roundedBox(0.34, 0.12, 0.16, 0.03), metal(0xffc23d, 0.18));
  outline(bar, 0.01);
  g.add(bar);
  return g;
}

export function buildStageScene(ctx: SceneCtx<StageState>, skin: StageSkin3D): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng, size } = ctx;
  scene.background = gradientTexture(skin.bg);
  studioLights(scene, { strength: 1.1 });
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  const world = new THREE.Group();
  scene.add(world);
  const halfH = () => Math.tan((camera.fov * Math.PI) / 360) * 5;
  const halfW = () => halfH() * (size.w / size.h);

  // Light rays fanning from behind the sign.
  const rays = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const r = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 7),
      new THREE.MeshBasicMaterial({ color: skin.rays, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    r.geometry.translate(0, 3.5, 0);
    r.rotation.z = (i / 14) * Math.PI * 2;
    rays.add(r);
  }
  rays.position.z = -2;
  world.add(rays);
  const glowTop = halo(skin.rays, 4, 0.25);
  glowTop.position.z = -1.5;
  world.add(glowTop);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4 * (300 / 1000)),
    new THREE.MeshBasicMaterial({ map: signTexture(1000, 300, skin.sign), transparent: true, toneMapped: false }),
  );
  world.add(sign);
  const logo = logoPlate(0.5);
  world.add(logo);

  // Floating pieces round the edges, behind the card.
  const floaters = Array.from({ length: 12 }, (_, i) => {
    let m: THREE.Object3D;
    if (skin.floaters === "coins") m = coinMesh("£", 0.16, i % 3 === 0 ? "pink" : "gold");
    else if (skin.floaters === "bars") m = i % 2 ? goldBar() : coinMesh("£", 0.15, "gold");
    else {
      m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), glossy(0xffffff, { roughness: 0.2 }));
    }
    world.add(m);
    return { m, side: i % 2 ? 1 : -1, y: rng(), sp: 0.08 + rng() * 0.12, ph: rng() * 6.28, z: -0.6 - rng() * 0.8 };
  });

  type Drop = { m: THREE.Object3D; v: THREE.Vector3; spin: number };
  const drops: Drop[] = [];
  let celebrated = false;

  return {
    update(dt, t) {
      const s = ctx.get();
      const H = halfH();
      const W = halfW();
      // Keep the sign in the top band (the HTML card sits below it).
      const signW = Math.min(2.4, W * 1.5);
      sign.scale.setScalar(signW / 2.4);
      const topBand = (92 / size.h) * 2 * H;
      sign.position.set(-W * 0.12, H - topBand / 2, 0);
      logo.position.set(W - 0.42, H - topBand / 2, 0.1);
      rays.position.set(0, H - topBand / 2, -2);
      glowTop.position.set(0, H - topBand / 2, -1.5);
      if (!reducedMotion) rays.rotation.z += dt * 0.12;
      floaters.forEach((f, i) => {
        const y = ((f.y + (reducedMotion ? 0 : t * f.sp)) % 1) * 2 * H - H;
        f.m.position.set(f.side * (W - 0.18) + Math.sin(t + f.ph) * 0.06, y, f.z);
        f.m.rotation.set(0.3, reducedMotion ? i : t * 1.5 + f.ph, 0);
      });
      if (s.done && s.won && !celebrated) {
        celebrated = true;
        if (!reducedMotion) {
          for (let i = 0; i < 36; i++) {
            const m = skin.floaters === "bars" && i % 3 === 0 ? goldBar() : coinMesh("£", 0.17, i % 4 === 0 ? "pink" : "gold");
            m.position.set((rng() - 0.5) * 2 * W, H + 0.3 + rng() * 1.5, 0.6 + rng());
            world.add(m);
            drops.push({ m, v: new THREE.Vector3((rng() - 0.5) * 0.4, -1 - rng() * 1.5, 0), spin: 3 + rng() * 6 });
          }
        }
        fx.confettiBurst(new THREE.Vector3(0, H - topBand / 2, 1), 160, 3, 2);
        ctx.shake(0.04, 350);
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.v.y -= 3 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.spin * dt;
        d.m.rotation.y = damp(d.m.rotation.y, 1, 2, dt);
        if (d.m.position.y < -H - 0.5) {
          world.remove(d.m);
          drops.splice(i, 1);
        }
      }
    },
  };
}
