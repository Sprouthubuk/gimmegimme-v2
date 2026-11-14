import * as THREE from "three";
import type { GemKind } from "../games/generators";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { BRAND } from "./fx";
import { blobShadow, clamp01, damp, ease, glossy, gradientTexture, halo, metal, outline, roundedBox, studioLights, textTexture, GOLD } from "./kit";

/**
 * A 3D "pick N" board: a 4 x 4 grid of containers (money bags, chests, tiles). Tapping one asks the board
 * to open it; the board's useGemPicks says what is inside (the Nth one opened shows the Nth pick, whichever
 * is tapped). This only draws: the container opens and the loot rises out of it.
 */
export interface PickState {
  /** What each tile shows, or null while closed. */
  kinds: (GemKind | null)[];
  done: boolean;
  winGem: GemKind | null;
  open: (tile: number) => void;
}

export interface Container3D {
  root: THREE.Group;
  /** 0 closed, 1 fully open. */
  setOpen: (t: number) => void;
  /** Idle motion while closed. */
  idle?: (t: number) => void;
}

export interface PickSkin3D {
  sky: [number, string][];
  floor: (g: THREE.Group, ctx: SceneCtx<PickState>) => void;
  sign: (w: number, h: number) => THREE.Texture;
  make: (i: number) => Container3D;
  loot: (kind: GemKind) => Promise<CanvasImageSource>;
  /** Glow colour behind each kind of loot. */
  lootGlow: Record<GemKind, number>;
  decor?: (g: THREE.Group, ctx: SceneCtx<PickState>) => void;
}

const COLS = 4;
const SP = 0.62;

export function buildPickScene(ctx: SceneCtx<PickState>, skin: PickSkin3D): SceneHandle {
  const { scene, camera, reducedMotion, fx } = ctx;
  scene.background = gradientTexture(skin.sky);
  studioLights(scene, { strength: 1.05 });
  camera.position.set(0, 3.55, 4.55);
  const look = new THREE.Vector3(0, -0.2, 0.0);
  camera.lookAt(look);
  const world = new THREE.Group();
  scene.add(world);
  skin.floor(world, ctx);
  skin.decor?.(world, ctx);
  const signTex = skin.sign(1024, 360);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9 * (360 / 1024)), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(0, 0.6, -1.65);
  sign.lookAt(camera.position.clone().setX(0));
  world.add(sign);

  const lootTex: Partial<Record<GemKind, THREE.Texture>> = {};
  const lootFor = (k: GemKind) => {
    if (!lootTex[k]) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      skin.loot(k).then((img) => {
        c.getContext("2d")!.drawImage(img, 0, 0, 256, 256);
        t.needsUpdate = true;
      }).catch(() => undefined);
      lootTex[k] = t;
    }
    return lootTex[k]!;
  };

  const tiles = Array.from({ length: 16 }, (_, i) => {
    const c = skin.make(i);
    const x = ((i % COLS) - (COLS - 1) / 2) * SP;
    const z = (Math.floor(i / COLS) - 1.5) * SP + 0.1;
    c.root.position.set(x, 0, z);
    c.root.userData.tile = i;
    c.root.traverse((o) => (o.userData.tile = i));
    world.add(c.root);
    const sh = blobShadow(0.26, 0.5);
    sh.position.set(x, -0.29, z);
    world.add(sh);
    return { ...c, x, z, openAt: -1, kind: null as GemKind | null, loot: null as THREE.Sprite | null, glow: null as THREE.Sprite | null, hover: 0 };
  });

  let doneAt = -1;
  let celebrated = false;
  const tmp = new THREE.Vector3();

  return {
    update(dt, t) {
      const s = ctx.get();
      if (s.done && doneAt < 0) doneAt = t;
      for (let i = 0; i < tiles.length; i++) {
        const tl = tiles[i];
        const k = s.kinds[i];
        if (k && tl.openAt < 0) {
          tl.openAt = t;
          tl.kind = k;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lootFor(k), transparent: true, depthWrite: false }));
          sp.scale.setScalar(0.01);
          sp.position.set(tl.x, 0.05, tl.z);
          sp.renderOrder = 5;
          const gl = halo(skin.lootGlow[k], 0.9, 0);
          gl.position.copy(sp.position);
          gl.renderOrder = 4;
          world.add(gl, sp);
          tl.loot = sp;
          tl.glow = gl;
          tl.root.getWorldPosition(tmp);
          if (k === "dud") fx.sparkBurst(tmp.clone().add(new THREE.Vector3(0, 0.3, 0)), 8, 0.8);
          else fx.sparkBurst(tmp.clone().add(new THREE.Vector3(0, 0.3, 0)), 22, 1.6);
          ctx.shake(0.012, 120);
        }
        const p = tl.openAt < 0 ? 0 : reducedMotion ? 1 : clamp01((t - tl.openAt) / 0.55);
        tl.setOpen(ease.outCubic(p));
        if (tl.openAt < 0) {
          tl.idle?.(t + i * 0.37);
          continue;
        }
        if (tl.loot && tl.glow) {
          const rise = reducedMotion ? 1 : ease.outBack(clamp01((t - tl.openAt - 0.1) / 0.5), 1.8);
          const hit = s.done && tl.kind === s.winGem && s.winGem !== null;
          const lose = s.done && !hit;
          const bob = reducedMotion ? 0 : Math.sin(t * 2.4 + i) * 0.03;
          const pulse = hit && !reducedMotion ? 1 + Math.sin((t - doneAt) * 9) * 0.08 : 1;
          const size = (tl.kind === "dud" ? 0.42 : 0.5) * rise * pulse * (hit ? 1.25 : 1);
          tl.loot.scale.setScalar(Math.max(0.01, size));
          tl.loot.position.y = 0.12 + 0.42 * rise + bob + (hit ? 0.12 : 0);
          tl.glow.position.copy(tl.loot.position);
          tl.glow.scale.setScalar(Math.max(0.01, size * 2.1));
          tl.glow.material.opacity = damp(tl.glow.material.opacity, tl.kind === "dud" ? 0 : hit ? 0.9 : lose ? 0.15 : 0.45, 6, dt);
          tl.loot.material.opacity = damp(tl.loot.material.opacity, lose && s.winGem ? 0.45 : 1, 4, dt);
        }
      }
      if (s.done && s.winGem && !celebrated && t - doneAt > 0.25) {
        celebrated = true;
        fx.confettiBurst(new THREE.Vector3(0, 0.6, 0.6), 160, 2.8, 2.2);
        fx.sparkBurst(new THREE.Vector3(0, 0.5, 0.4), 60, 2.4);
        ctx.shake(0.05, 420);
      }
      camera.position.y = damp(camera.position.y, s.done && s.winGem ? 3.4 : 3.55, 2, dt);
      camera.lookAt(look);
    },
    pointer(kind, e) {
      if (kind !== "down") return;
      const s = ctx.get();
      if (s.done) return;
      const hit = ctx.pick(tiles.map((tl) => tl.root), e);
      const tile = hit?.object.userData.tile;
      if (typeof tile === "number" && !s.kinds[tile]) s.open(tile);
    },
  };
}

/** A money bag: a soft sack with a tied neck. The knot pops off and the sack slumps when it opens. */
export function moneyBag(color = 0xc9a26b, mark = "£"): (i: number) => Container3D {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 20; k++) {
    const v = k / 20;
    const y = -0.28 + v * 0.5;
    const r = v < 0.75 ? 0.05 + Math.sin(Math.min(1, v / 0.75) * Math.PI * 0.95) * 0.22 : 0.06 + (v - 0.75) * 0.25;
    pts.push(new THREE.Vector2(Math.max(0.01, r), y));
  }
  const sackGeo = new THREE.LatheGeometry(pts, 32);
  const markTex = textTexture(mark, { width: 256, height: 256, size: 170, fill: "#c4122a", stroke: "#141414", strokeWidth: 10, shadow: false });
  return () => {
    const root = new THREE.Group();
    const sack = new THREE.Mesh(sackGeo, glossy(color, { roughness: 0.8, clearcoat: 0.1, envMapIntensity: 0.4 }));
    outline(sack, 0.012);
    root.add(sack);
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.8 }));
    label.position.set(0, -0.08, 0.235);
    root.add(label);
    const knot = new THREE.Group();
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 20), metal(GOLD, 0.3));
    tie.rotation.x = Math.PI / 2;
    tie.position.y = 0.14;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.12, 12), glossy(color, { roughness: 0.8, clearcoat: 0.1, envMapIntensity: 0.4 }));
    tuft.position.y = 0.24;
    tuft.rotation.x = Math.PI;
    outline(tuft, 0.01);
    knot.add(tie, tuft);
    root.add(knot);
    return {
      root,
      setOpen(p) {
        knot.position.set(p * 0.12, p * 0.5, 0);
        knot.rotation.z = -p * 2.2;
        knot.visible = p < 0.95;
        sack.scale.set(1 + p * 0.12, 1 - p * 0.3, 1 + p * 0.12);
        sack.position.y = -p * 0.06;
        label.position.y = -0.08 - p * 0.06;
      },
      idle(t) {
        root.rotation.z = Math.sin(t * 1.6) * 0.03;
      },
    };
  };
}

/** A treasure chest: wood with gold bands; the lid swings back on its hinge. */
export function treasureChest(wood = 0x8a4b1f): (i: number) => Container3D {
  const bodyGeo = roundedBox(0.44, 0.24, 0.32, 0.03);
  const lidGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.44, 24, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2);
  lidGeo.translate(0, 0, 0.16);
  return () => {
    const root = new THREE.Group();
    const woodMat = glossy(wood, { roughness: 0.55, clearcoat: 0.4 });
    const goldMat = metal(GOLD, 0.25);
    const body = new THREE.Mesh(bodyGeo, woodMat);
    body.position.y = -0.17;
    outline(body, 0.01);
    root.add(body);
    for (const x of [-0.15, 0.15]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.33), goldMat);
      band.position.set(x, -0.17, 0);
      root.add(band);
    }
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, -0.05, -0.16);
    const lid = new THREE.Mesh(lidGeo, woodMat);
    outline(lid, 0.01);
    lidPivot.add(lid);
    for (const x of [-0.15, 0.15]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.04, 24, 1, false, 0, Math.PI), goldMat);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 0, 0.16);
      lidPivot.add(band);
    }
    const lock = new THREE.Mesh(roundedBox(0.08, 0.1, 0.03, 0.01), goldMat);
    lock.position.set(0, 0.0, 0.33);
    lidPivot.add(lock);
    root.add(lidPivot);
    const hoard = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.26), new THREE.MeshStandardMaterial({ color: 0xffc23d, emissive: 0xffb020, emissiveIntensity: 0, roughness: 0.4, metalness: 0.6 }));
    hoard.rotation.x = -Math.PI / 2;
    hoard.position.y = -0.06;
    root.add(hoard);
    const inner = new THREE.PointLight(0xffd36a, 0, 0.8, 2);
    inner.position.set(0, -0.02, 0);
    root.add(inner);
    return {
      root,
      setOpen(p) {
        lidPivot.rotation.x = -p * 1.9;
        inner.intensity = p * 1.2;
        (hoard.material as THREE.MeshStandardMaterial).emissiveIntensity = p * 1.4;
      },
      idle(t) {
        lidPivot.rotation.x = Math.max(0, Math.sin(t * 2.1)) * -0.03;
      },
    };
  };
}

/** A glossy tile with a "?" that flips over (the classic gem board). */
export function flipTile(colors: number[] = [BRAND.pink, BRAND.cyan, BRAND.yellow]): (i: number) => Container3D {
  const geo = roundedBox(0.5, 0.12, 0.5, 0.05);
  const q = textTexture("?", { width: 256, height: 256, size: 200, fill: "#ffffff", stroke: "#141414", strokeWidth: 16 });
  return (i) => {
    const root = new THREE.Group();
    const tile = new THREE.Mesh(geo, glossy(colors[i % colors.length], { roughness: 0.25 }));
    outline(tile, 0.012);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: q, transparent: true, toneMapped: false }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.061;
    tile.add(face);
    tile.position.y = -0.2;
    root.add(tile);
    return {
      root,
      setOpen(p) {
        tile.rotation.x = p * Math.PI;
        tile.position.y = -0.2 + Math.sin(p * Math.PI) * 0.25 - p * 0.04;
        tile.scale.setScalar(1 - p * 0.15);
      },
      idle(t) {
        tile.position.y = -0.2 + Math.sin(t * 2) * 0.01;
      },
    };
  };
}
