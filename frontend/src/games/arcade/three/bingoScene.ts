import * as THREE from "three";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { CHROME, clamp01, damp, ease, glass, glossy, gradientTexture, halo, logoPlate, metal, outline, roundedBox, studioLights, textTexture } from "./kit";
import { signTexture, type SignLine } from "./signs";

/**
 * A bingo ball machine: a glass globe of tumbling balls, each drawn ball rolls down the chute onto
 * the rail. The order of the draw comes from generateBingo through useBingoDraw; this only draws it.
 */
export interface BingoState {
  started: boolean;
  drawn: number;
  draws: readonly number[];
  done: boolean;
  win: boolean;
  left: number;
  start: () => void;
}
export interface BingoSkin3D {
  sign: SignLine[];
  bg: [number, string][];
  ballColour: (n: number) => number;
  /** Baubles get a gold cap. */
  cap?: boolean;
  base: number;
  trim: number;
  leftWord: string;
  decor?: (world: THREE.Group, ctx: SceneCtx<BingoState>) => ((t: number) => void) | void;
}

const LETTER_COLOUR: Record<string, number> = { B: BRAND.pink, I: BRAND.cyan, N: BRAND.yellow, G: BRAND.pink, O: BRAND.cyan };
const letterOf = (n: number) => "BINGO"[Math.floor((n - 1) / 15)];

export const CLASSIC_BINGO_3D: BingoSkin3D = {
  sign: [{ text: "BINGO!", size: 0.6, fill: ["#ffd0ea", "#ff4fa8", "#c40066"], y: 0.55 }],
  bg: [
    [0, "#2a0a3e"],
    [0.6, "#4a0f5c"],
    [1, "#12041c"],
  ],
  ballColour: (n) => LETTER_COLOUR[letterOf(n)],
  base: BRAND.pink,
  trim: BRAND.cyan,
  leftWord: "BALLS LEFT",
};

function numberedBall(n: number, skin: BingoSkin3D, r: number): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 22), glossy(skin.ballColour(n), { roughness: 0.15, clearcoat: 1 }));
  outline(ball, r * 0.06);
  g.add(ball);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.62, 40),
    new THREE.MeshBasicMaterial({
      map: textTexture("", {
        width: 256,
        height: 256,
        lines: [letterOf(n), String(n)],
        size: 92,
        fill: "#141414",
        strokeWidth: 0,
        shadow: false,
        bg: (c, w, h) => {
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
          c.fill();
        },
      }),
      transparent: true,
      toneMapped: false,
    }),
  );
  face.position.z = r * 1.005;
  g.add(face);
  if (skin.cap) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.26, r * 0.25, 18), metal(0xffc23d));
    cap.position.y = r * 1.02;
    outline(cap, r * 0.04);
    g.add(cap);
  }
  return g;
}

export function buildBingoScene(ctx: SceneCtx<BingoState>, skin: BingoSkin3D): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng } = ctx;
  scene.background = gradientTexture(skin.bg);
  studioLights(scene, { strength: 1.05 });
  camera.position.set(0, 0.25, 3.6);
  const look = new THREE.Vector3(0, 0.12, 0);
  camera.lookAt(look);
  const world = new THREE.Group();
  scene.add(world);

  // The machine: base, globe, chrome ring, chute.
  const G = new THREE.Vector3(-0.78, 0.42, 0);
  const R = 0.6;
  const base = new THREE.Mesh(roundedBox(1.15, 0.42, 0.8, 0.13), glossy(skin.base, { roughness: 0.3 }));
  base.position.set(G.x, -0.38, -0.1);
  outline(base, 0.02);
  world.add(base);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.3, 24), metal(CHROME));
  neck.position.set(G.x, -0.05, 0);
  world.add(neck);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), glass(0xffffff, 0.16));
  globe.position.copy(G);
  world.add(globe);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, 0.035, 12, 64), metal(CHROME));
  rim.position.copy(G);
  rim.rotation.y = Math.PI / 2;
  world.add(rim);
  const rim2 = rim.clone();
  rim2.rotation.set(Math.PI / 2, 0, 0);
  world.add(rim2);
  const gl = halo(0xffffff, R * 2.6, 0.12);
  gl.position.copy(G).add(new THREE.Vector3(0, 0, -0.3));
  world.add(gl);
  const logo = logoPlate(0.5);
  logo.position.set(G.x, -0.38, 0.32);
  world.add(logo);
  const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 20, 1, true), glass(skin.trim, 0.35));
  chute.rotation.z = -Math.PI / 3;
  chute.position.set(G.x + 0.68, G.y - 0.45, 0.15);
  world.add(chute);

  // Sign over the rail.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5 * (300 / 900)),
    new THREE.MeshBasicMaterial({ map: signTexture(900, 300, skin.sign), transparent: true, toneMapped: false }),
  );
  sign.position.set(0.72, 0.95, -0.2);
  world.add(sign);

  // Rail with slots for the last five balls.
  const rail = new THREE.Mesh(roundedBox(3.0, 0.12, 0.5, 0.06), glossy(skin.trim, { roughness: 0.3 }));
  rail.position.set(0, -0.82, 0.3);
  outline(rail, 0.015);
  world.add(rail);
  const SLOT = (k: number) => new THREE.Vector3(k === 0 ? 0.08 : 0.2 + k * 0.36, k === 0 ? -0.5 : -0.56, 0.42);

  // The counter.
  let leftShown = -1;
  const counter = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
  counter.scale.set(0.9, 0.45, 1);
  counter.position.set(0.8, 0.42, 0.1);
  world.add(counter);
  const setCounter = (n: number) => {
    counter.material.map?.dispose();
    counter.material.map = textTexture("", { width: 512, height: 256, lines: [skin.leftWord, String(n)], size: 96, fill: "#ffe11a" });
    counter.material.needsUpdate = true;
  };

  // Tumbling balls in the globe, no numbers.
  const mixers = Array.from({ length: 22 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), glossy(skin.ballColour(1 + ((i * 13) % 75)), { roughness: 0.2 }));
    world.add(m);
    const rest = new THREE.Vector3((rng() - 0.5) * 0.9, -R + 0.1 + Math.floor(i / 7) * 0.14 + rng() * 0.04, (rng() - 0.5) * 0.6).multiplyScalar(0.8);
    return { m, rest, a: rng() * 6.28, b: rng() * 6.28, sp: 1.5 + rng() * 2.5, rr: 0.25 + rng() * 0.38 };
  });
  const decorTick = skin.decor?.(world, ctx);

  type Live = { g: THREE.Group; n: number; born: number; slot: number };
  const live: Live[] = [];
  let shownDrawn = 0;
  let celebrated = false;
  let mixT = 0;

  return {
    update(dt, t) {
      const s = ctx.get();
      if (s.left !== leftShown) {
        leftShown = s.left;
        setCounter(s.left);
      }
      const mixing = s.started && !s.done && !reducedMotion;
      mixT = damp(mixT, mixing ? 1 : 0, 3, dt);
      for (const b of mixers) {
        const w = t * b.sp;
        const flyP = new THREE.Vector3(Math.cos(w + b.a) * b.rr * 1.6, Math.sin(w * 1.3 + b.b) * b.rr * 1.4, Math.sin(w + b.b) * b.rr);
        if (flyP.length() > R - 0.12) flyP.setLength(R - 0.12);
        b.m.position.copy(b.rest).lerp(flyP, mixT).add(G);
      }
      globe.rotation.y += dt * mixT * 2;
      // New balls since last frame (reduced motion jumps straight to the end).
      while (shownDrawn < s.drawn) {
        const n = s.draws[shownDrawn++];
        if (reducedMotion && s.drawn - shownDrawn >= 4) continue;
        for (const l of live) l.slot++;
        const g = numberedBall(n, skin, 0.2);
        g.position.copy(G).add(new THREE.Vector3(0.3, -0.2, 0.1));
        g.scale.setScalar(0.01);
        world.add(g);
        live.unshift({ g, n, born: t, slot: 0 });
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.slot > 3) {
          l.g.scale.multiplyScalar(0.85);
          l.g.position.x += dt * 2;
          if (l.g.scale.x < 0.05) {
            world.remove(l.g);
            live.splice(i, 1);
          }
          continue;
        }
        const target = SLOT(l.slot);
        const age = reducedMotion ? 1 : clamp01((t - l.born) / 0.38);
        if (l.slot === 0 && age < 1) {
          // Out of the globe, down the chute.
          const a = G.clone().add(new THREE.Vector3(0.3, -0.2, 0.1));
          const mid = new THREE.Vector3(G.x + 0.75, G.y - 0.6, 0.3);
          const e = ease.outCubic(age);
          const p1 = a.clone().lerp(mid, e);
          const p2 = mid.clone().lerp(target, e);
          l.g.position.copy(p1.lerp(p2, e));
          l.g.scale.setScalar(Math.max(0.01, ease.outBack(age)) * 1.25);
          l.g.rotation.z = (1 - e) * -6;
        } else {
          l.g.position.lerp(target, 1 - Math.exp(-12 * dt));
          const sc = l.slot === 0 ? 1.3 : 0.85;
          l.g.scale.setScalar(damp(l.g.scale.x, sc, 12, dt));
          l.g.rotation.z = damp(l.g.rotation.z, 0, 10, dt);
        }
        l.g.rotation.y = Math.sin(t * 1.5 + l.n) * 0.12;
      }
      if (s.done && s.win && !celebrated) {
        celebrated = true;
        fx.confettiBurst(new THREE.Vector3(0.3, 0.2, 0.6), 160, 2.8, 2.2);
        fx.sparkBurst(SLOT(0), 40, 2);
        ctx.shake(0.05, 400);
      }
      decorTick?.(t);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.started) return;
      if (ctx.pick([globe, base], e)) s.start();
    },
  };
}
