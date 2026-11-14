import * as THREE from "three";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { clamp01, coinMesh, damp, ease, glossy, gradientTexture, halo, labelSprite, logoPlate, metal, outline, roundedBox, studioLights } from "./kit";
import { PINK_FILL, YELLOW_FILL, signTexture } from "./signs";

/**
 * Hook a Duck in 3D: rubber ducks bobbing round a water channel at a fairground stall. The board decides
 * the sequence and the ticket's result; every duck has that same result underneath.
 */
export type DuckPhase = "ready" | "hooking" | "lifting" | "tagged";
export interface DuckState {
  phase: DuckPhase;
  chosen: number | null;
  label: string | null;
  hook: (i: number) => void;
}

const COLS = [BRAND.pink, BRAND.yellow, BRAND.cyan, BRAND.yellow, BRAND.cyan, BRAND.pink];

function rubberDuck(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = glossy(color, { roughness: 0.22 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), mat);
  body.scale.set(1.25, 0.8, 1);
  outline(body, 0.012);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 16), mat);
  tail.rotation.z = Math.PI / 2 + 0.6;
  tail.position.set(-0.24, 0.07, 0);
  outline(tail, 0.01);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 18), mat);
  head.position.set(0.12, 0.2, 0);
  outline(head, 0.012);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 16), glossy(0xff8a1f, { roughness: 0.25 }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.27, 0.18, 0);
  beak.scale.set(1, 1, 0.65);
  outline(beak, 0.008);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.2 });
  for (const z of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), eyeMat);
    eye.position.set(0.2, 0.25, z);
    g.add(eye);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), metal(0xdfe6ef));
  ring.position.set(0.12, 0.36, 0);
  g.add(body, tail, head, beak, ring);
  return g;
}

export function buildDuckScene(ctx: SceneCtx<DuckState>): SceneHandle {
  const { scene, camera, reducedMotion, fx } = ctx;
  scene.background = gradientTexture([
    [0, "#1a0828"],
    [0.6, "#3a0d4a"],
    [1, "#0d0414"],
  ]);
  studioLights(scene, { strength: 1.05 });
  const lamp = new THREE.PointLight(0xfff0d0, 3, 6, 1.5);
  lamp.position.set(0, 1.2, 1.5);
  scene.add(lamp);
  camera.position.set(0, 0.95, 5.5);
  const look = new THREE.Vector3(0, 0.32, 0);
  camera.lookAt(look);
  const world = new THREE.Group();
  scene.add(world);

  // Awning: pink and white stripes with scalloped edge.
  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.06), glossy(i % 2 ? 0xffffff : BRAND.pink, { roughness: 0.4 }));
    stripe.position.set(-1.26 + i * 0.36, 1.45, -0.3);
    stripe.rotation.x = 0.25;
    world.add(stripe);
    const scallop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20, 1, false, 0, Math.PI), glossy(i % 2 ? 0xffffff : BRAND.pink, { roughness: 0.4 }));
    scallop.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI / 2);
    scallop.position.set(-1.26 + i * 0.36, 1.2, -0.24);
    outline(scallop, 0.008);
    world.add(scallop);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2 * (360 / 1024)),
    new THREE.MeshBasicMaterial({ map: signTexture(1024, 360, [{ text: "HOOK A", size: 0.32, fill: YELLOW_FILL, y: 0.3 }, { text: "DUCK", size: 0.42, fill: PINK_FILL, y: 0.72 }]), transparent: true, toneMapped: false }),
  );
  sign.position.set(0, 1.62, 0);
  world.add(sign);
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 14), glossy(0xffffff, { roughness: 0.3 }));
    pole.position.set(sx * 1.45, 0.1, -0.2);
    outline(pole, 0.01);
    world.add(pole);
  }
  // Back wall with prize stars, the water channel.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: 0x2a0d3e, roughness: 0.8 }));
  wall.position.set(0, 0.2, -0.6);
  world.add(wall);
  for (let i = 0; i < 9; i++) {
    const h = halo([BRAND.pink, BRAND.cyan, BRAND.yellow][i % 3], 0.2, 0.8);
    h.position.set(-1.2 + i * 0.3, 0.95, -0.55);
    world.add(h);
  }
  const tank = new THREE.Mesh(roundedBox(3, 0.5, 1.5, 0.12), glossy(BRAND.cyan, { roughness: 0.25 }));
  tank.position.set(0, -0.72, 0.1);
  outline(tank, 0.02);
  world.add(tank);
  const waterTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#36c6ef";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = 5;
    for (let y = 16; y < 256; y += 40) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20) * 6);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1.5);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.3), new THREE.MeshPhysicalMaterial({ map: waterTex, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.92 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.46, 0.1);
  world.add(water);
  const logo = logoPlate(0.5);
  logo.position.set(0, -0.75, 0.86);
  world.add(logo);

  // Ducks: two rows drifting along the channel.
  const ducks = COLS.map((c, i) => {
    const d = rubberDuck(c);
    d.userData.duck = i;
    d.traverse((o) => (o.userData.duck = i));
    world.add(d);
    return { d, home: new THREE.Vector3(-0.95 + (i % 3) * 0.95, -0.4, i < 3 ? -0.25 : 0.35), off: i * 0.37 };
  });
  // The hook on its line.
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: 0x141414 }));
  world.add(line);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI * 1.5), metal(0xdfe6ef));
  world.add(hook);
  const hookTop = 1.3;

  let phase: DuckPhase = "ready";
  let phaseAt = 0;
  let hookX = 0.9;
  let hookY = 0.85;
  let tag: THREE.Object3D | null = null;
  let celebrated = false;
  const dur: Record<DuckPhase, number> = { ready: 0, hooking: 0.75, lifting: 0.95, tagged: 1.3 };

  return {
    update(dt, t) {
      const s = ctx.get();
      if (s.phase !== phase) {
        phase = s.phase;
        phaseAt = t;
      }
      const p = reducedMotion ? 1 : clamp01((t - phaseAt) / dur[phase] || 0);
      ducks.forEach((dk, i) => {
        const chosen = s.chosen === i;
        if (chosen && phase !== "ready") return;
        const drift = reducedMotion ? 0 : Math.sin(t * 0.5 + dk.off * 4) * 0.12;
        dk.d.position.set(dk.home.x + drift, dk.home.y + (reducedMotion ? 0 : Math.sin(t * 2.4 + dk.off * 5) * 0.025), dk.home.z);
        dk.d.rotation.set(reducedMotion ? 0 : Math.sin(t * 1.8 + i) * 0.06, (i % 2 ? -0.4 : 0.4) + (reducedMotion ? 0 : Math.sin(t * 0.5 + dk.off * 4) * 0.3), reducedMotion ? 0 : Math.sin(t * 2 + i) * 0.05);
      });
      const c = s.chosen != null ? ducks[s.chosen] : null;
      if (c) {
        const ring = new THREE.Vector3(c.d.position.x + 0.12 * Math.cos(c.d.rotation.y), c.d.position.y + 0.36, c.d.position.z - 0.12 * Math.sin(c.d.rotation.y));
        if (phase === "hooking") {
          hookX = damp(hookX, ring.x, 10, dt);
          hookY = 0.85 + (ring.y - 0.85) * ease.inOutCubic(p);
        } else if (phase === "lifting" || phase === "tagged") {
          const lift = phase === "lifting" ? ease.inOutCubic(p) : 1;
          hookY = ring.y + lift * 0.75;
          c.d.position.y = c.home.y + lift * 0.75;
          // Turn the duck over to see underneath.
          c.d.rotation.set(phase === "tagged" ? Math.PI * (reducedMotion ? 1 : ease.outBack(clamp01((t - phaseAt) / 0.5))) : Math.sin(t * 8) * 0.1 * (1 - lift), c.d.rotation.y * 0.9, 0);
          c.d.position.z = damp(c.d.position.z, 0.6, 3, dt);
        }
      } else {
        hookX = damp(hookX, 0.9, 4, dt);
        hookY = damp(hookY, 0.85 + (reducedMotion ? 0 : Math.sin(t * 1.4) * 0.03), 4, dt);
      }
      line.position.set(hookX, (hookTop + hookY) / 2, c ? c.d.position.z : 0.2);
      line.scale.y = Math.max(0.05, hookTop - hookY);
      hook.position.set(hookX, hookY - 0.04, line.position.z);
      // The tag underneath: the ticket's own result.
      if (phase === "tagged" && c && !tag) {
        if (s.label) {
          tag = coinMesh(s.label, 0.3, "gold");
          const h = halo(0xffd84a, 1.4, 0.6);
          h.position.z = -0.1;
          tag.add(h);
        } else tag = labelSprite("No prize", 0.2, { fill: "#ffffff", stroke: "#141414" });
        tag.userData.base = tag.scale.clone();
        world.add(tag);
      }
      if (tag && c) {
        const k = reducedMotion ? 1 : ease.outBack(clamp01((t - phaseAt - 0.35) / 0.5), 2);
        tag.scale.copy(tag.userData.base as THREE.Vector3).multiplyScalar(Math.max(0.01, k));
        tag.position.set(c.d.position.x, c.d.position.y - 0.05 - k * 0.15, c.d.position.z + 0.35);
        if (tag instanceof THREE.Group) tag.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - (t - phaseAt)) * 10;
        if (s.label && !celebrated && k > 0.5) {
          celebrated = true;
          fx.confettiBurst(tag.position.clone(), 120, 2.4, 2);
          fx.sparkBurst(tag.position.clone(), 40, 2);
          ctx.shake(0.05, 380);
        }
      }
      waterTex.offset.x = reducedMotion ? 0 : t * 0.04;
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.phase !== "ready") return;
      const hit = ctx.pick(ducks.map((d) => d.d), e);
      const i = hit?.object.userData.duck;
      if (typeof i === "number") s.hook(i);
    },
  };
}
