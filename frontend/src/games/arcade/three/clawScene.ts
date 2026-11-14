import * as THREE from "three";
import type { ClawPhase } from "../games/claw/useClaw";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { blobShadow, clamp01, coinMesh, damp, ease, glass, glossy, glow, gradientTexture, halo, labelSprite, logoPlate, metal, outline, roundedBox, studioLights, GOLD } from "./kit";

/**
 * A 3D claw machine. Everything here is drawing: the board's useClaw hook decides the sequence and
 * timings, and the item always opens on the ticket's own result (`label`), whichever item was grabbed.
 * A skin supplies the look (cabinet colours, the items, the sign, the scenery); the machine is shared.
 */
export interface ClawState {
  x: number;
  phase: ClawPhase;
  target: number | null;
  swing: number;
  cracked: boolean;
  /** The ticket's prize label, or null for no win. */
  label: string | null;
  /** Steer the claw to a position across the glass, 0 to 100. */
  steer: (xPercent: number) => void;
}

export interface ClawItemLook {
  /** Builds one item (a bauble, a capsule…) of radius ~0.15, as two halves that can come apart. */
  make: (i: number) => { root: THREE.Group; left: THREE.Object3D; right: THREE.Object3D; cap?: THREE.Object3D };
}

export interface ClawSkin3D {
  cabinet: number;
  cabinetDark: number;
  trim: number;
  /** Background of the whole stage, top to bottom. */
  sky: [number, string][];
  /** Back wall of the glass. */
  wall: [number, string][];
  floor: number;
  sign: (w: number, h: number) => THREE.Texture;
  item: ClawItemLook;
  /** Scenery inside the glass. */
  scenery?: (g: THREE.Group, ctx: SceneCtx<ClawState>) => void;
  /** Coloured bulbs along the top. */
  bulbs: number[];
  emptyText: string;
  snow?: boolean;
}

const W = 2.1; // glass width
const FLOOR = -1.12;
const TOP = 1.12;
const REST_Y = 0.62;
const CHUTE = new THREE.Vector3(0, FLOOR, 0.52);
/** Matches useClaw's timings (ms); reduced motion is much shorter. */
const DUR: Record<ClawPhase, number> = { aim: 0, descend: 950, close: 420, ascend: 900, carry: 750, drop: 650, open: 2200 };

const toX = (pct: number) => (pct / 100 - 0.5) * (W - 0.2);
const rowY: Record<number, number> = { 86: FLOOR + 0.2, 73: FLOOR + 0.45, 60: FLOOR + 0.7, 48: FLOOR + 0.95 };

export function buildClawScene(ctx: SceneCtx<ClawState>, skin: ClawSkin3D, pile: readonly { x: number; y: number }[]): SceneHandle {
  const { scene, camera, rng, reducedMotion, fx } = ctx;
  scene.background = gradientTexture(skin.sky);
  studioLights(scene);
  const inside = new THREE.PointLight(0xfff0d0, 2.2, 5, 1.8);
  inside.position.set(0, 1.0, 0.2);
  scene.add(inside);

  const camHome = new THREE.Vector3(0, 0.26, 6.6);
  const camLook = new THREE.Vector3(0, 0.16, 0);
  camera.position.copy(camHome);
  camera.lookAt(camLook);

  const machine = new THREE.Group();
  scene.add(machine);

  // ---- cabinet frame: glossy pillars, top box, base ----
  const body = glossy(skin.cabinet, { roughness: 0.42, clearcoat: 0.7 });
  const bodyDark = glossy(skin.cabinetDark, { roughness: 0.4 });
  const trim = metal(skin.trim, 0.2);
  const pillarGeo = roundedBox(0.22, 3.0, 1.5, 0.08);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, body);
    p.position.set(sx * (W / 2 + 0.11), -0.05, 0);
    outline(p, 0.025);
    machine.add(p);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.7, 0.035), trim);
    strip.position.set(sx * (W / 2 + 0.11), -0.05, 0.76);
    machine.add(strip);
  }
  const topBox = new THREE.Mesh(roundedBox(W + 0.5, 0.86, 1.6, 0.12), body);
  topBox.position.set(0, TOP + 0.46, 0);
  outline(topBox, 0.03);
  machine.add(topBox);
  // The sign on the front of the top box.
  const signTex = skin.sign(1024, 340);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, (W + 0.2) * (340 / 1024)), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(0, TOP + 0.47, 0.82);
  machine.add(sign);
  // Bulbs along the top edge of the glass.
  const bulbs: THREE.Mesh[] = [];
  const bulbHalos: THREE.Sprite[] = [];
  const bulbGeo = new THREE.SphereGeometry(0.045, 16, 12);
  const nb = 13;
  for (let i = 0; i < nb; i++) {
    const m = new THREE.Mesh(bulbGeo, glow(skin.bulbs[i % skin.bulbs.length], 2.6));
    m.position.set(-W / 2 + 0.05 + (i * (W - 0.1)) / (nb - 1), TOP + 0.02, 0.8);
    machine.add(m);
    bulbs.push(m);
    const h = halo(skin.bulbs[i % skin.bulbs.length], 0.26, 0.7);
    h.position.copy(m.position).add(new THREE.Vector3(0, 0, 0.03));
    machine.add(h);
    bulbHalos.push(h);
  }
  const base = new THREE.Mesh(roundedBox(W + 0.5, 0.62, 1.6, 0.12), body);
  base.position.set(0, FLOOR - 0.33, 0);
  outline(base, 0.03);
  machine.add(base);
  const logo = logoPlate(0.62);
  logo.position.set(-0.68, FLOOR - 0.33, 0.83);
  machine.add(logo);
  const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.045, 0.05), trim);
  baseTrim.position.set(0, FLOOR - 0.05, 0.8);
  machine.add(baseTrim);
  // The chute: a gold-rimmed opening in the front of the floor.
  const chuteRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 40), trim);
  chuteRim.rotation.x = Math.PI / 2;
  chuteRim.position.copy(CHUTE).add(new THREE.Vector3(0, 0.025, 0));
  machine.add(chuteRim);
  const chuteHole = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), new THREE.MeshBasicMaterial({ color: 0x050307 }));
  chuteHole.rotation.x = -Math.PI / 2;
  chuteHole.position.copy(CHUTE).add(new THREE.Vector3(0, 0.03, 0));
  machine.add(chuteHole);
  const chuteGlow = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), glow(GOLD, 0));
  chuteGlow.rotation.x = Math.PI / 2;
  chuteGlow.position.copy(chuteRim.position).add(new THREE.Vector3(0, 0.03, 0));
  machine.add(chuteGlow);

  // ---- inside the glass ----
  const wallTex = gradientTexture(skin.wall, 0.2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, TOP - FLOOR + 0.1), new THREE.MeshBasicMaterial({ map: wallTex }));
  wall.position.set(0, (TOP + FLOOR) / 2, -0.7);
  machine.add(wall);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 1.45), glossy(skin.floor, { roughness: 0.75, clearcoat: 0.2 }));
  floor.position.set(0, FLOOR - 0.06, 0.02);
  machine.add(floor);
  const sceneryGroup = new THREE.Group();
  machine.add(sceneryGroup);
  skin.scenery?.(sceneryGroup, ctx);
  // Front glass with a reflection streak.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, TOP - FLOOR), glass(0xffffff, 0.08));
  front.position.set(0, (TOP + FLOOR) / 2, 0.75);
  front.renderOrder = 5;
  machine.add(front);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
  streak.position.set(-0.45, 0, 0.76);
  streak.rotation.z = -0.35;
  streak.renderOrder = 6;
  machine.add(streak);

  // Snow falling inside.
  let snow: THREE.Points | null = null;
  if (skin.snow) {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rng() - 0.5) * W;
      pos[i * 3 + 1] = FLOOR + rng() * (TOP - FLOOR);
      pos[i * 3 + 2] = -0.6 + rng() * 1.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false }));
    machine.add(snow);
  }

  // ---- the pile ----
  const items = pile.map((p, i) => {
    const look = skin.item.make(i);
    const row = Math.round(p.y);
    const z = ((i * 37) % 5) * 0.05 - 0.08 + (row === 86 ? 0.12 : row === 73 ? 0.02 : row === 60 ? -0.05 : -0.1);
    look.root.position.set(toX(p.x), rowY[row] ?? FLOOR + 0.2, z);
    look.root.rotation.set((rng() - 0.5) * 0.5, (rng() - 0.5) * 1.2, (rng() - 0.5) * 0.5);
    machine.add(look.root);
    return { ...look, home: look.root.position.clone(), homeRot: look.root.rotation.clone(), jostle: 0 };
  });
  // A few more at the back, to fill the glass. Decoration only: they are never grabbed.
  for (let i = 0; i < 9; i++) {
    const look = skin.item.make(100 + i);
    look.root.position.set(-0.85 + i * 0.21, FLOOR + 0.22 + (i % 2) * 0.24, -0.42);
    look.root.rotation.set(rng(), rng() * 2, rng());
    machine.add(look.root);
  }

  // ---- the claw ----
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, W - 0.1, 12), metal(0xb8c2cf));
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, TOP - 0.06, 0);
  machine.add(rail);
  const rig = new THREE.Group(); // moves left and right (and forward to the chute)
  rig.position.set(0, TOP - 0.06, 0);
  machine.add(rig);
  const carriage = new THREE.Mesh(roundedBox(0.34, 0.14, 0.3, 0.05), metal(GOLD));
  outline(carriage, 0.02);
  rig.add(carriage);
  const arm = new THREE.Group(); // swings from the carriage
  rig.add(arm);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), metal(0xd8dde4, 0.35));
  arm.add(cable);
  const head = new THREE.Group();
  arm.add(head);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.13, 24), metal(GOLD));
  outline(hub, 0.015);
  head.add(hub);
  const hubLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), glow(0xff3b5c, 3));
  hubLight.position.set(0, 0.02, 0.1);
  head.add(hubLight);
  const prongs: THREE.Group[] = [];
  const prongCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, -0.08, 0), new THREE.Vector3(0.13, -0.2, 0), new THREE.Vector3(0.07, -0.3, 0)]);
  const prongGeo = new THREE.TubeGeometry(prongCurve, 20, 0.022, 8, false);
  for (let k = 0; k < 3; k++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (k * Math.PI * 2) / 3 + Math.PI / 6;
    const holder = new THREE.Group();
    holder.position.set(0.06, -0.05, 0);
    const prong = new THREE.Mesh(prongGeo, metal(GOLD, 0.18));
    outline(prong, 0.01);
    holder.add(prong);
    pivot.add(holder);
    head.add(pivot);
    prongs.push(holder);
  }
  // Where the claw will land: a beam of light from the claw down to the pile, and a glowing ring.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  machine.add(beam);
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 40), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  aim.rotation.x = -Math.PI / 2 + 0.75;
  machine.add(aim);
  const aimGlow = halo(0xfff3b0, 0.45, 0.6);
  machine.add(aimGlow);
  const aimShadow = blobShadow(0.22, 0.4);
  machine.add(aimShadow);

  // ---- centre stage, for the reveal ----
  const stage = new THREE.Group();
  stage.visible = false;
  scene.add(stage);
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x07040a, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.set(0, 0, 1.15);
  dim.renderOrder = 20;
  scene.add(dim);
  const raysTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.translate(256, 256);
    for (let i = 0; i < 18; i++) {
      g.rotate((Math.PI * 2) / 18);
      const grad = g.createLinearGradient(0, 0, 250, 0);
      grad.addColorStop(0, "rgba(255,240,170,0.9)");
      grad.addColorStop(1, "rgba(255,240,170,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(256, -26);
      g.lineTo(256, 26);
      g.closePath();
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: raysTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  rays.position.set(0, 0.1, 1.3);
  rays.renderOrder = 21;
  scene.add(rays);
  const stageLight = new THREE.PointLight(0xfff2d8, 0, 5, 1.5);
  stageLight.position.set(0.4, 0.9, 2.8);
  scene.add(stageLight);
  let stageItem: ReturnType<ClawItemLook["make"]> | null = null;
  let coin: THREE.Group | null = null;
  let emptyTag: THREE.Sprite | null = null;

  // ---- motion state ----
  let phase: ClawPhase = "aim";
  let phaseAt = 0;
  let headY = REST_Y;
  let clawX = 0;
  let clawZ = 0;
  let open = 1; // prongs: 1 open, 0 closed
  let held: (typeof items)[number] | null = null;
  let falling: { obj: THREE.Group; v: THREE.Vector3 } | null = null;
  let swingNow = 0;
  let crackedAt = -1;
  let celebrated = false;
  const dur = (p: ClawPhase) => (reducedMotion ? Math.min(DUR[p], p === "open" ? 400 : 80) : DUR[p]) / 1000;

  const tmp = new THREE.Vector3();

  const handle: SceneHandle = {
    update(dt, t) {
      const s = ctx.get();
      if (s.phase !== phase) {
        phase = s.phase;
        phaseAt = t;
        if (phase === "close" && s.target != null) for (let i = 0; i < items.length; i++) {
          const a = pile[i];
          const b = pile[s.target];
          if (i !== s.target && Math.abs(a.x - b.x) <= 18 && Math.abs(a.y - b.y) <= 16) items[i].jostle = 1;
        }
        if (phase === "drop" && held) {
          // Let go: the item leaves the claw and falls into the chute.
          held.root.getWorldPosition(tmp);
          machine.attach(held.root);
          falling = { obj: held.root, v: new THREE.Vector3(0, 0, 0) };
          held = null;
        }
        if (phase === "open" && s.target != null) {
          if (falling) falling.obj.visible = false;
          stageItem = skin.item.make(s.target);
          stageItem.root.scale.setScalar(2.4);
          stage.add(stageItem.root);
          stage.position.set(0, -1.6, 1.9);
          stage.visible = true;
        }
      }
      const p = clamp01((t - phaseAt) / Math.max(0.001, dur(phase)));

      // Carriage: follows the player's aim; goes to the chute to drop.
      const wantX = phase === "carry" || phase === "drop" ? CHUTE.x : toX(s.x);
      const wantZ = phase === "carry" || phase === "drop" ? CHUTE.z - 0.05 : 0;
      clawX = damp(clawX, wantX, phase === "aim" ? 16 : 5, dt);
      clawZ = damp(clawZ, wantZ, 5, dt);
      rig.position.x = clawX;
      rig.position.z = clawZ;
      swingNow = damp(swingNow, reducedMotion ? 0 : s.swing, 10, dt);
      arm.rotation.z = THREE.MathUtils.degToRad(swingNow);
      arm.rotation.x = reducedMotion ? 0 : Math.sin(t * 1.3) * 0.02;

      // Head height and grip.
      const target = s.target != null ? items[s.target] : null;
      const grabY = target ? target.home.y + 0.3 - (TOP - 0.06) : REST_Y;
      const restRel = -(TOP - 0.06 - REST_Y) + 0.35;
      if (phase === "aim") {
        headY = damp(headY, restRel, 8, dt);
        open = damp(open, 1, 8, dt);
      } else if (phase === "descend") {
        headY = restRel + (grabY - restRel) * ease.inOutCubic(p);
        open = 1;
      } else if (phase === "close") {
        headY = grabY;
        open = 1 - ease.outCubic(p);
      } else if (phase === "ascend") {
        headY = grabY + (restRel - grabY) * ease.inOutCubic(p);
        open = 0;
      } else if (phase === "carry") {
        headY = restRel;
        open = 0;
      } else if (phase === "drop") {
        open = ease.outBack(Math.min(1, p * 2));
      }
      head.position.y = headY;
      cable.scale.y = Math.max(0.05, -headY - 0.06);
      cable.position.y = headY / 2 + 0.03;
      for (const pr of prongs) pr.rotation.z = -0.15 + open * 0.55;

      // Pick up the target once the prongs have closed.
      if ((phase === "ascend" || phase === "carry") && target && held !== target) {
        held = target;
        head.attach(target.root);
        target.root.position.set(0, -0.31, 0);
      }
      if (held && !reducedMotion) {
        held.root.rotation.z = Math.sin(t * 6) * 0.12;
        held.root.rotation.x = Math.cos(t * 5) * 0.08;
      }

      // Jostled neighbours wobble back into place.
      for (const it of items) {
        if (it.jostle > 0 && it !== held) {
          it.jostle = Math.max(0, it.jostle - dt * 2.2);
          const k = reducedMotion ? 0 : Math.sin(it.jostle * 18) * it.jostle;
          it.root.position.set(it.home.x + k * 0.03, it.home.y + Math.abs(k) * 0.04, it.home.z);
          it.root.rotation.z = it.homeRot.z + k * 0.25;
        }
      }

      // Falling into the chute.
      if (falling && falling.obj.visible) {
        falling.v.y -= 9.8 * dt;
        falling.obj.position.addScaledVector(falling.v, dt);
        falling.obj.position.x = damp(falling.obj.position.x, CHUTE.x, 10, dt);
        falling.obj.position.z = damp(falling.obj.position.z, CHUTE.z, 10, dt);
        falling.obj.rotation.x += dt * 5;
        if (falling.obj.position.y < CHUTE.y - 0.25) falling.obj.visible = false;
      }
      (chuteGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = phase === "drop" ? 3 * (1 - p) + 1 : phase === "carry" ? 1.2 + Math.sin(t * 12) : 0;

      // Aim ring on the pile under the claw.
      const showAim = phase === "aim";
      aim.visible = aimShadow.visible = beam.visible = aimGlow.visible = showAim;
      if (showAim) {
        let topY = FLOOR + 0.05;
        for (const it of items) if (Math.abs(it.home.x - clawX) < 0.16) topY = Math.max(topY, it.home.y + 0.17);
        aim.position.set(clawX, topY + 0.01, 0.12);
        aimGlow.position.set(clawX, topY + 0.02, 0.14);
        aimShadow.position.set(clawX, topY, 0.05);
        const beamTop = TOP - 0.06 + headY - 0.3;
        beam.position.set(clawX, (beamTop + topY) / 2, 0.02);
        beam.scale.y = Math.max(0.05, beamTop - topY);
        (beam.material as THREE.MeshBasicMaterial).opacity = reducedMotion ? 0.2 : 0.16 + Math.sin(t * 5) * 0.06;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 5) * 0.12;
        aim.scale.setScalar(pulse);
      }

      // Bulbs chase; they race on the reveal.
      const speed = phase === "open" ? 18 : 6;
      bulbs.forEach((b, i) => {
        const on = reducedMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * speed - i * 0.9));
        (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + on * 1.4;
        bulbHalos[i].material.opacity = 0.15 + on * 0.75;
      });

      // Snow.
      if (snow && !reducedMotion) {
        const a = snow.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i++) {
          let y = a.getY(i) - dt * (0.12 + (i % 5) * 0.03);
          if (y < FLOOR) y = TOP;
          a.setY(i, y);
          a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.02);
        }
        a.needsUpdate = true;
      }

      // Centre stage reveal.
      const stageT = phase === "open" ? t - phaseAt : -1;
      const dimTarget = stageT >= 0 ? 0.62 : 0;
      const dm = dim.material as THREE.MeshBasicMaterial;
      dm.opacity = damp(dm.opacity, dimTarget, 6, dt);
      const rm = rays.material as THREE.MeshBasicMaterial;
      rm.opacity = damp(rm.opacity, stageT >= 0 ? (s.label ? 0.85 : 0.25) : 0, 5, dt);
      rays.rotation.z += dt * (reducedMotion ? 0 : 0.35);
      stageLight.intensity = damp(stageLight.intensity, stageT >= 0 ? 5 : 0, 6, dt);
      // Camera leans in for the reveal.
      const camTarget = stageT >= 0 ? new THREE.Vector3(0, 0.05, 5.0) : camHome;
      camera.position.x = damp(camera.position.x, camTarget.x, 3, dt);
      camera.position.y = damp(camera.position.y, camTarget.y, 3, dt);
      camera.position.z = damp(camera.position.z, camTarget.z, 3, dt);
      camera.lookAt(camLook);

      if (stageItem && stageT >= 0) {
        // Rise out of the chute, bounce, wobble.
        const rise = reducedMotion ? 1 : ease.outBack(clamp01(stageT / 0.55), 1.4);
        stage.position.y = -1.6 + (0.15 + 1.6) * rise;
        stage.position.z = 1.9;
        const wob = reducedMotion ? 0 : Math.sin(stageT * 22) * Math.max(0, 0.6 - stageT) * 0.5;
        stageItem.root.rotation.set(0, Math.sin(stageT * 1.2) * 0.25, wob);
        if (s.cracked && crackedAt < 0) {
          crackedAt = t;
          if (s.label) {
            coin = coinMesh(s.label, 0.42, "gold");
            const ch = halo(0xffd85a, 1.9, 0.55);
            ch.position.z = -0.2;
            coin.add(ch);
            coin.scale.setScalar(0.01);
            stage.add(coin);
          } else {
            emptyTag = labelSprite(skin.emptyText, 0.3, { fill: "#ffffff", stroke: "#141414" });
            emptyTag.position.set(0, 0.55, 0.2);
            stage.add(emptyTag);
          }
        }
        if (crackedAt >= 0) {
          const c = t - crackedAt;
          const k = reducedMotion ? 1 : ease.outCubic(clamp01(c / 0.7));
          stageItem.left.position.set(-0.55 * k, -0.35 * k * k, 0.1 * k);
          stageItem.left.rotation.z = 1.1 * k;
          stageItem.right.position.set(0.55 * k, -0.35 * k * k, 0.1 * k);
          stageItem.right.rotation.z = -1.1 * k;
          if (stageItem.cap) {
            stageItem.cap.position.y = 0.6 * k;
            stageItem.cap.rotation.z = 2 * k;
          }
          const fade = 1 - clamp01((c - 0.4) / 0.5);
          for (const half of [stageItem.left, stageItem.right, stageItem.cap]) half?.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m && "opacity" in m) {
              m.transparent = true;
              (m as THREE.MeshPhysicalMaterial).opacity = Math.max(0, fade);
            }
          });
          if (coin) {
            const pop = reducedMotion ? 1 : ease.outBack(clamp01(c / 0.5), 2.2);
            coin.scale.setScalar(Math.max(0.01, pop) * (1 + (reducedMotion ? 0 : Math.sin(t * 3) * 0.03)));
            coin.position.set(0, 0.05 + 0.1 * pop, 0.3);
            coin.rotation.y = reducedMotion ? 0 : Math.max(0, 1 - c / 1.1) * Math.PI * 6 + Math.sin(t * 1.6) * 0.18;
            if (!celebrated && c > 0.08) {
              celebrated = true;
              stage.getWorldPosition(tmp);
              fx.confettiBurst(tmp.clone().add(new THREE.Vector3(0, 0.2, 0.3)), 150, 3.0, 2.2);
              fx.sparkBurst(tmp.clone().add(new THREE.Vector3(0, 0.2, 0.4)), 60, 2.6);
              ctx.shake(0.07, 450);
            }
          }
          if (emptyTag) {
            const pop = reducedMotion ? 1 : ease.outBack(clamp01(c / 0.4));
            emptyTag.material.opacity = pop;
            emptyTag.scale.set(0.3 * 3.2 * pop, 0.3 * pop, 1);
          }
        }
      }
    },
    pointer(kind, e) {
      const s = ctx.get();
      if (s.phase !== "aim" || (kind === "move" && !(e.buttons & 1))) return;
      if (kind === "up") return;
      // Steer by dragging across the glass.
      const ray = ctx.ray(e);
      const tt = -ray.origin.z / ray.direction.z;
      const px = ray.origin.x + ray.direction.x * tt;
      s.steer(((px / (W - 0.2)) + 0.5) * 100);
    },
  };
  return handle;
}

/** A glossy bauble with a gold cap, in two halves that come apart. */
export function baubleLook(colors: number[], stripe = GOLD): ClawItemLook {
  const half = new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI);
  const band = new THREE.TorusGeometry(0.152, 0.018, 8, 40, Math.PI);
  band.rotateX(Math.PI / 2);
  return {
    make(i) {
      const color = colors[i % colors.length];
      const root = new THREE.Group();
      const mat = glossy(color, { roughness: 0.18, metalness: 0.25, clearcoat: 1, envMapIntensity: 0.9 });
      const bandMat = metal(stripe, 0.25);
      const mk = (rot: number) => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(half, mat);
        m.rotation.y = rot;
        outline(m, 0.012);
        const b = new THREE.Mesh(band, bandMat);
        b.rotation.y = rot;
        g.add(m, b);
        return g;
      };
      const left = mk(-Math.PI / 2);
      const right = mk(Math.PI / 2);
      const cap = new THREE.Group();
      const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 16), metal(GOLD));
      capMesh.position.y = 0.16;
      outline(capMesh, 0.008);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 16), metal(GOLD));
      loop.position.y = 0.2;
      cap.add(capMesh, loop);
      root.add(left, right, cap);
      return { root, left, right, cap };
    },
  };
}

/** A two-tone capsule (classic claw machine) in two halves. */
export function capsuleLook(colors: number[]): ClawItemLook {
  const top = new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const bottom = new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  return {
    make(i) {
      const root = new THREE.Group();
      const a = new THREE.Mesh(top, glossy(colors[i % colors.length], { transparent: true, opacity: 0.92 }));
      outline(a, 0.012);
      const b = new THREE.Mesh(bottom, glossy(0xf4f4f8));
      outline(b, 0.012);
      const left = new THREE.Group();
      left.add(a);
      const right = new THREE.Group();
      right.add(b);
      root.add(left, right);
      return { root, left, right };
    },
  };
}

export const BRAND_ITEM_COLOURS = [BRAND.pink, BRAND.cyan, BRAND.yellow];
