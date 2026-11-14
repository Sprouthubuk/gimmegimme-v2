import * as THREE from "three";
import { WHEEL_SEGMENTS, type WheelLayout } from "../games/generators";
import type { WheelPhase } from "../games/wheel/useWheelSpin";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { clamp01, coinMesh, damp, ease, glossy, gradientTexture, halo, logoPlate, metal, outline, studioLights, GOLD } from "./kit";

/**
 * A 3D prize wheel. Where it stops is the board's (useWheelSpin's final rotation, from generateWheel);
 * this paints the segments, turns the wheel there with the same long ease-out, and celebrates a win.
 * The vault skin opens its door on a win and lets the cash out.
 */
export interface WheelState {
  phase: WheelPhase;
  /** Final rotation in degrees, clockwise (0 until the spin). */
  rotation: number;
  spinMs: number;
  /** Label to show on the win coin, or null. */
  winLabel: string | null;
  spin: () => void;
}

export interface WheelSkin3D {
  sky: [number, string][];
  fills: Record<"yellow" | "cyan" | "pink" | "white", [string, string]>;
  ink: Record<"yellow" | "cyan" | "pink" | "white", string>;
  noneFill: [string, string];
  rim: "steel" | "gold" | "candy";
  sign: (w: number, h: number) => THREE.Texture;
  /** A vault door: bolts, a spoked handle, and it swings open on a win. */
  vault?: boolean;
  /** Extra scenery; may return a per-frame update. */
  decor?: (g: THREE.Group, ctx: SceneCtx<WheelState>) => void | ((t: number) => void);
}

const R = 1.15;
const SEG = (Math.PI * 2) / WHEEL_SEGMENTS;

function faceTexture(layout: WheelLayout, skin: WheelSkin3D): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const cx = S / 2;
  const r = S / 2 - 4;
  g.fillStyle = "#141414";
  g.beginPath();
  g.arc(cx, cx, r + 4, 0, Math.PI * 2);
  g.fill();
  layout.segments.forEach((seg, i) => {
    const mid = -Math.PI / 2 + i * SEG;
    const a0 = mid - SEG / 2;
    const a1 = mid + SEG / 2;
    const [c0, c1] = seg.kind === "none" ? skin.noneFill : skin.fills[seg.tone as keyof WheelSkin3D["fills"]] ?? skin.noneFill;
    const grad = g.createRadialGradient(cx, cx, r * 0.15, cx, cx, r);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, r, a0, a1);
    g.closePath();
    g.fill();
    g.strokeStyle = "#141414";
    g.lineWidth = 7;
    g.stroke();
    // Label, reading outwards from the centre.
    g.save();
    g.translate(cx, cx);
    g.rotate(mid + Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const text = seg.kind === "none" ? "NO WIN" : seg.label.length > 9 ? `${seg.label.slice(0, 8)}…` : seg.label;
    let size = seg.kind === "none" ? 44 : 78;
    g.font = `${size}px "Lilita One"`;
    const room = 2 * (r * 0.72) * Math.sin(SEG / 2) - 18;
    while (g.measureText(text).width > room && size > 18) {
      size -= 2;
      g.font = `${size}px "Lilita One"`;
    }
    g.lineJoin = "round";
    g.lineWidth = size * 0.18;
    g.strokeStyle = "#141414";
    const y = -r * 0.7;
    g.strokeText(text, 0, y);
    g.fillStyle = seg.kind === "none" ? "#ffffff" : skin.ink[seg.tone as keyof WheelSkin3D["ink"]] ?? "#ffffff";
    g.fillText(text, 0, y);
    g.restore();
  });
  // Gloss.
  const gl = g.createLinearGradient(0, 0, 0, S);
  gl.addColorStop(0, "rgba(255,255,255,0.18)");
  gl.addColorStop(0.5, "rgba(255,255,255,0)");
  g.fillStyle = gl;
  g.beginPath();
  g.arc(cx, cx, r, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildWheelScene(ctx: SceneCtx<WheelState>, skin: WheelSkin3D, layout: WheelLayout): SceneHandle {
  const { scene, camera, reducedMotion, fx, rng } = ctx;
  scene.background = gradientTexture(skin.sky);
  studioLights(scene);
  const front = new THREE.PointLight(0xffffff, 2, 6, 1.6);
  front.position.set(0.5, 0.8, 2.5);
  scene.add(front);
  camera.position.set(0, 0.2, 6.5);
  const look = new THREE.Vector3(0, 0.15, 0);
  camera.lookAt(look);

  const world = new THREE.Group();
  scene.add(world);
  const decorTick = skin.decor?.(world, ctx);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8 * (360 / 1024)), new THREE.MeshBasicMaterial({ map: skin.sign(1024, 360), transparent: true, toneMapped: false }));
  sign.position.set(0, 1.7, 0.2);
  sign.scale.setScalar(0.92);
  world.add(sign);
  const logo = logoPlate(0.55);
  logo.position.set(0, -1.62, 0.3);
  world.add(logo);

  // The door / wheel assembly: a frame that stays, and a door that can swing open on its hinge (left).
  const frame = new THREE.Group();
  frame.position.y = 0.05;
  world.add(frame);
  const rimMat = skin.rim === "gold" ? metal(GOLD, 0.2) : skin.rim === "steel" ? metal(0xb9c3d3, 0.25) : glossy(0xff2d95, { roughness: 0.2 });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(R + 0.13, 0.13, 20, 80), rimMat);
  outline(outer, 0.015);
  frame.add(outer);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 64), new THREE.MeshBasicMaterial({ color: 0x050307 }));
  back.position.z = -0.15;
  frame.add(back);
  // Inside the vault: gold glow and stacks of cash, seen when the door opens.
  const inside = new THREE.Group();
  inside.visible = false;
  frame.add(inside);
  if (skin.vault) {
    const glowIn = halo(0xffc84a, 2.6, 0.9);
    glowIn.position.z = -0.1;
    inside.add(glowIn);
    const barMat = metal(GOLD, 0.2);
    for (let k = 0; k < 9; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.16), barMat);
      bar.position.set(((k % 3) - 1) * 0.36, -0.55 + Math.floor(k / 3) * 0.13, -0.05);
      inside.add(bar);
    }
  }
  const hinge = new THREE.Group();
  hinge.position.x = -R - 0.05;
  frame.add(hinge);
  const door = new THREE.Group();
  door.position.x = R + 0.05;
  hinge.add(door);
  const wheel = new THREE.Group();
  door.add(wheel);
  // The body is a short cylinder; the face is a flat disc on its front, so the picture maps exactly:
  // canvas top is the top of the wheel, and segment i sits i x 30 degrees clockwise from it.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.12, 96), rimMat);
  body.rotation.x = Math.PI / 2;
  wheel.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(R - 0.005, 96), new THREE.MeshPhysicalMaterial({ map: faceTexture(layout, skin), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.5 }));
  face.position.z = 0.062;
  wheel.add(face);
  // Pegs round the edge that the pointer ticks against.
  const pegMat = metal(GOLD, 0.2);
  for (let i = 0; i < WHEEL_SEGMENTS; i++) {
    const a = Math.PI / 2 - (i + 0.5) * SEG;
    const peg = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), pegMat);
    peg.position.set(Math.cos(a) * (R - 0.03), Math.sin(a) * (R - 0.03), 0.09);
    outline(peg, 0.008);
    wheel.add(peg);
  }
  // Hub, and for the vault a spoked handle and bolts.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 40), metal(skin.vault ? 0xc9d2e0 : GOLD, 0.2));
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.1;
  outline(hub, 0.012);
  wheel.add(hub);
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal(GOLD, 0.15));
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.z = 0.17;
  wheel.add(hubCap);
  const bolts: THREE.Mesh[] = [];
  if (skin.vault) {
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Group();
      spoke.rotation.z = (k * Math.PI) / 3;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 12), metal(0xc9d2e0, 0.2));
      bar.position.z = 0.24;
      outline(bar, 0.008);
      for (const sy of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), metal(GOLD, 0.2));
        knob.position.set(0, sy * 0.475, 0.24);
        outline(knob, 0.008);
        spoke.add(knob);
      }
      spoke.add(bar);
      wheel.add(spoke);
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 14), metal(GOLD, 0.2));
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * (R + 0.13), Math.sin(a) * (R + 0.13), 0.12);
      b.userData.a = a;
      frame.add(b);
      bolts.push(b);
    }
  }
  // Pointer at the top.
  const flapper = new THREE.Group();
  flapper.position.set(0, R + 0.2, 0.25);
  frame.add(flapper);
  const pointerShape = new THREE.Shape();
  pointerShape.moveTo(0, -0.22);
  pointerShape.lineTo(-0.13, 0.08);
  pointerShape.quadraticCurveTo(0, 0.2, 0.13, 0.08);
  pointerShape.closePath();
  const pointerGeo = new THREE.ExtrudeGeometry(pointerShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3 });
  const pointer = new THREE.Mesh(pointerGeo, glossy(0xff2d95, { roughness: 0.2 }));
  outline(pointer, 0.012);
  pointer.position.y = -0.05;
  flapper.add(pointer);
  const winHalo = halo(0xffe066, 1.3, 0);
  winHalo.position.set(0, R * 0.62, 0.3);
  frame.add(winHalo);

  let phase: WheelPhase = "ready";
  let spinAt = -1;
  let landedAt = -1;
  let angle = 0; // radians, clockwise positive
  let lastSeg = 0;
  let flap = 0;
  let coin: THREE.Group | null = null;
  let celebrated = false;
  const notes: THREE.Mesh[] = [];
  // CSS cubic-bezier(0.12, 0.6, 0.08, 1), solved for y at time x.
  const bez = (x: number) => {
    const p1x = 0.12, p1y = 0.6, p2x = 0.08, p2y = 1;
    let t = x;
    for (let k = 0; k < 8; k++) {
      const bx = 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t - x;
      const dx = 3 * (1 - t) * (1 - t) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
      if (Math.abs(dx) < 1e-6) break;
      t = clamp01(t - bx / dx);
    }
    return 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t;
  };

  return {
    update(dt, t) {
      const s = ctx.get();
      if (decorTick) decorTick(t);
      if (s.phase !== phase) {
        phase = s.phase;
        if (phase === "spinning") spinAt = t;
        if (phase === "landed") landedAt = t;
      }
      const target = THREE.MathUtils.degToRad(s.rotation);
      if (phase === "ready") angle = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.02;
      else if (phase === "spinning") angle = reducedMotion ? target : target * bez(clamp01((t - spinAt) / (s.spinMs / 1000)));
      else angle = target;
      wheel.rotation.z = -angle;
      // The pointer flicks each time a peg passes it.
      const seg = Math.floor(angle / SEG + 0.5);
      if (seg !== lastSeg) {
        lastSeg = seg;
        flap = 1;
      }
      flap = Math.max(0, flap - dt * 7);
      flapper.rotation.z = reducedMotion ? 0 : flap * 0.45;
      // Win: the segment under the pointer glows; the vault opens and the cash escapes.
      const won = phase === "landed" && !!s.winLabel;
      winHalo.material.opacity = damp(winHalo.material.opacity, won ? 0.85 : 0, 6, dt);
      if (won) {
        const e = t - landedAt;
        if (skin.vault) {
          bolts.forEach((b) => {
            const k = reducedMotion ? 1 : ease.outCubic(clamp01(e / 0.35));
            const a = b.userData.a as number;
            b.position.set(Math.cos(a) * (R + 0.13 + k * 0.12), Math.sin(a) * (R + 0.13 + k * 0.12), 0.12);
          });
          const open = reducedMotion ? 1 : ease.outBack(clamp01((e - 0.35) / 0.8), 1.2);
          hinge.rotation.y = -open * 1.25;
          inside.visible = open > 0.02;
        }
        if (!coin && e > (skin.vault ? 0.6 : 0.15)) {
          coin = coinMesh(s.winLabel!, 0.48, "gold");
          const h = halo(0xffd84a, 2.2, 0.6);
          h.position.z = -0.15;
          coin.add(h);
          coin.position.set(0, 0.05, 0.6);
          world.add(coin);
        }
        if (coin) {
          const c = e - (skin.vault ? 0.6 : 0.15);
          const k = reducedMotion ? 1 : ease.outBack(clamp01(c / 0.6), 1.8);
          coin.scale.setScalar(Math.max(0.01, k));
          coin.position.z = 0.6 + k * 0.6;
          coin.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - c / 1.2) * Math.PI * 6 + Math.sin(t * 1.6) * 0.15;
          if (!celebrated && c > 0.1) {
            celebrated = true;
            fx.confettiBurst(new THREE.Vector3(0, 0.2, 1.2), 160, 3, 2.2);
            fx.sparkBurst(new THREE.Vector3(0, 0.1, 1.2), 60, 2.6);
            ctx.shake(0.07, 450);
            // Notes flying out of the vault.
            if (skin.vault && !reducedMotion) for (let k = 0; k < 18; k++) {
              const note = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), new THREE.MeshStandardMaterial({ color: k % 3 ? 0x5fbf6a : 0xffd23f, side: THREE.DoubleSide, roughness: 0.6 }));
              note.position.set((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, 0.2);
              note.userData.v = new THREE.Vector3((rng() - 0.5) * 3.5, rng() * 2.5, 1 + rng() * 2);
              note.userData.w = new THREE.Vector3(rng() * 8, rng() * 8, rng() * 8);
              notes.push(note);
              world.add(note);
            }
          }
        }
      }
      for (const n of notes) {
        const v = n.userData.v as THREE.Vector3;
        const w = n.userData.w as THREE.Vector3;
        v.y -= 2.4 * dt;
        v.multiplyScalar(1 - dt * 0.6);
        n.position.addScaledVector(v, dt);
        n.rotation.x += w.x * dt;
        n.rotation.y += w.y * dt;
      }
      camera.position.z = damp(camera.position.z, won ? 6.0 : 6.5, 2, dt);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.phase === "ready" && ctx.pick([wheel], e)) s.spin();
    },
  };
}
