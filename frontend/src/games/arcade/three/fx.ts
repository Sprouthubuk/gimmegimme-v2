import * as THREE from "three";
import type { Rng } from "../rng";

/** Brand colours for confetti and sparkles. */
export const BRAND = { pink: 0xff2d95, cyan: 0x1fc4f4, yellow: 0xffe11a, ink: 0x141414, white: 0xffffff, gold: 0xffc928 };
const CONFETTI_COLOURS = [BRAND.pink, BRAND.cyan, BRAND.yellow, BRAND.pink, BRAND.cyan, BRAND.gold];

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  max: number;
  scale: number;
  glow: boolean;
}

/**
 * Confetti and glowing sparks, drawn as two instanced meshes so a big win costs two draw calls.
 * Positions come from a seeded generator: decoration only, never anything to do with a result.
 */
export class Fx {
  private confetti: THREE.InstancedMesh;
  private sparks: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private sparkBits: Bit[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private readonly cap = 260;
  private readonly sparkCap = 140;

  constructor(private scene: THREE.Scene, private rng: Rng, private reducedMotion: boolean) {
    const geo = new THREE.PlaneGeometry(0.06, 0.1);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.35, metalness: 0.25 });
    this.confetti = new THREE.InstancedMesh(geo, mat, this.cap);
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.confetti.renderOrder = 10;
    const sgeo = new THREE.OctahedronGeometry(0.035, 0);
    const smat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.sparks = new THREE.InstancedMesh(sgeo, smat, this.sparkCap);
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    for (let i = 0; i < this.cap; i++) this.confetti.setColorAt(i, new THREE.Color(CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]));
    for (let i = 0; i < this.sparkCap; i++) this.sparks.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xfff2a0 : i % 3 === 1 ? 0xffffff : 0xffd0ea).multiplyScalar(2.2));
    scene.add(this.confetti, this.sparks);
  }

  /** Confetti thrown out from `at`. */
  confettiBurst(at: THREE.Vector3, count = 120, speed = 2.6, up = 1.6) {
    if (this.reducedMotion) return;
    const r = this.rng;
    for (let i = 0; i < count && this.bits.length < this.cap; i++) {
      const a = r() * Math.PI * 2;
      const e = r() * 0.9 + 0.2;
      this.bits.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * e * speed, (r() * 0.8 + 0.6) * speed * 0.6 + up, Math.sin(a) * e * speed * 0.5 + 0.4),
        r: new THREE.Euler(r() * 6, r() * 6, r() * 6),
        w: new THREE.Vector3(r() * 14 - 7, r() * 14 - 7, r() * 14 - 7),
        life: 0,
        max: 2.2 + r() * 1.2,
        scale: 0.7 + r() * 0.8,
        glow: false,
      });
    }
  }

  /** Bright sparks that catch the bloom. */
  sparkBurst(at: THREE.Vector3, count = 40, speed = 2.2) {
    if (this.reducedMotion) return;
    const r = this.rng;
    for (let i = 0; i < count && this.sparkBits.length < this.sparkCap; i++) {
      const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      this.sparkBits.push({
        p: at.clone(),
        v: dir.multiplyScalar(speed * (0.4 + r() * 0.8)),
        r: new THREE.Euler(r() * 6, r() * 6, 0),
        w: new THREE.Vector3(r() * 8, r() * 8, 0),
        life: 0,
        max: 0.6 + r() * 0.7,
        scale: 0.6 + r() * 1.1,
        glow: true,
      });
    }
  }

  update(dt: number) {
    this.step(this.bits, this.confetti, dt, 3.2, 1.6);
    this.step(this.sparkBits, this.sparks, dt, 0.8, 2.5);
  }

  private step(list: Bit[], mesh: THREE.InstancedMesh, dt: number, gravity: number, drag: number) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.life += dt;
      if (b.life > b.max) {
        list.splice(i, 1);
        continue;
      }
    }
    for (const b of list) {
      b.v.y -= gravity * dt;
      b.v.multiplyScalar(1 - Math.min(0.9, drag * dt * (b.glow ? 1 : 0.6)));
      if (!b.glow) b.v.x += Math.sin(b.life * 6 + b.scale * 10) * dt * 0.6;
      b.p.addScaledVector(b.v, dt);
      b.r.x += b.w.x * dt;
      b.r.y += b.w.y * dt;
      b.r.z += b.w.z * dt;
      const fade = Math.min(1, (b.max - b.life) * 3);
      this.q.setFromEuler(b.r);
      this.s.setScalar(b.scale * fade);
      this.m.compose(b.p, this.q, this.s);
      mesh.setMatrixAt(n++, this.m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.confetti, this.sparks);
    this.confetti.geometry.dispose();
    (this.confetti.material as THREE.Material).dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }
}
