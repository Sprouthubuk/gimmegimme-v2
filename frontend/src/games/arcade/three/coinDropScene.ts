import * as THREE from "three";
import { COIN_BINS, type CoinDropLayout } from "../games/generators";
import { BIN_TOP, BIN_W, COIN_R, H, LABEL_TOP, PEG_R, ROWS, ROW_DY, ROW_Y0, W, binX, pegsFor, type CoinDropPhase, type Pt } from "../games/coinDrop/useCoinDrop";
import type { SceneCtx, SceneHandle } from "./Scene3D";
import { clamp01, coinMesh, damp, ease, glossy, glow, gradientTexture, halo, logoPlate, metal, outline, roundedBox, studioLights, textTexture, GOLD } from "./kit";

/**
 * A 3D coin drop. The coin's path, the bins and where it may land are the board's (useCoinDrop,
 * generateCoinDrop); this draws the wall, the studs, the bins and a real coin following that path.
 */
export interface CoinDropState {
  phase: CoinDropPhase;
  aim: number;
  coin: Pt | null;
  landedBin: number | null;
  setAim: (bin: number) => void;
  drop: () => void;
}

export interface CoinDropSkin3D {
  sky: [number, string][];
  wall: (w: number, h: number) => THREE.Texture;
  frame: number;
  stud: number;
  studLit: number;
  sign: (w: number, h: number) => THREE.Texture;
  /** One bin's body (speaker, cup…), sized BIN x binH. */
  bin: (i: number, w: number, h: number) => { root: THREE.Group; thump?: (t: number) => void };
  plate: Record<"yellow" | "cyan" | "pink" | "white" | "none", string>;
}

const BW = 2.5;
const S = BW / W;
const X = (x: number) => (x - W / 2) * S;
const TOPY = 1.05;
const Y = (y: number) => TOPY - y * S;

export function buildCoinDropScene(ctx: SceneCtx<CoinDropState>, skin: CoinDropSkin3D, layout: CoinDropLayout): SceneHandle {
  const { scene, camera, reducedMotion, fx } = ctx;
  scene.background = gradientTexture(skin.sky);
  studioLights(scene);
  const fill = new THREE.PointLight(0xffffff, 1.6, 6, 1.5);
  fill.position.set(0, 0.2, 2.2);
  scene.add(fill);
  camera.position.set(0, 0.4, 6.9);
  const look = new THREE.Vector3(0, 0.36, 0);
  camera.lookAt(look);

  const board = new THREE.Group();
  scene.add(board);
  const boardH = H * S;
  // Back wall and frame.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(BW, boardH), new THREE.MeshStandardMaterial({ map: skin.wall(512, Math.round((512 * H) / W)), roughness: 0.85 }));
  wall.position.set(0, TOPY - boardH / 2, -0.06);
  board.add(wall);
  const frameMat = glossy(skin.frame, { roughness: 0.35 });
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(roundedBox(0.12, boardH + 0.16, 0.3, 0.04), frameMat);
    side.position.set(sx * (BW / 2 + 0.06), TOPY - boardH / 2, 0.06);
    outline(side, 0.015);
    board.add(side);
  }
  const bottom = new THREE.Mesh(roundedBox(BW + 0.24, 0.12, 0.3, 0.04), frameMat);
  bottom.position.set(0, TOPY - boardH - 0.04, 0.06);
  outline(bottom, 0.015);
  board.add(bottom);
  const signTex = skin.sign(1024, 360);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7 * (360 / 1024)), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(0, TOPY + 0.86, 0.1);
  board.add(sign);
  const logo = logoPlate(0.5);
  logo.position.set(0, TOPY - boardH - 0.36, 0.2);
  board.add(logo);

  // Studs.
  const studGeo = new THREE.CylinderGeometry(PEG_R * S * 1.25, PEG_R * S * 1.25, 0.12, 20);
  studGeo.rotateX(Math.PI / 2);
  const studs: { m: THREE.Mesh; x: number; y: number; lit: number }[] = [];
  for (let r = 0; r < ROWS; r++)
    for (const x of pegsFor(r)) {
      const m = new THREE.Mesh(studGeo, metal(skin.stud, 0.2));
      m.position.set(X(x), Y(ROW_Y0 + r * ROW_DY), 0.02);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(PEG_R * S * 1.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal(skin.stud, 0.15));
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.06;
      m.add(cap);
      outline(m, 0.006);
      board.add(m);
      studs.push({ m, x, y: ROW_Y0 + r * ROW_DY, lit: 0 });
    }
  const studHalo = studs.map((st) => {
    const h = halo(skin.studLit, 0.22, 0);
    h.position.copy(st.m.position).add(new THREE.Vector3(0, 0, 0.1));
    board.add(h);
    return h;
  });

  // Bins and their prize plates.
  const binH = (LABEL_TOP - BIN_TOP) * S;
  const bins = layout.bins.map((b, i) => {
    const bin = skin.bin(i, BIN_W * S - 0.03, binH);
    bin.root.position.set(X(binX(i)), Y(BIN_TOP) - binH / 2, 0.02);
    board.add(bin.root);
    const plateH = (H - LABEL_TOP) * S;
    const tone = b.label ? b.tone : "none";
    const plateTex = textTexture(b.label ? (b.label.length > 6 ? `${b.label.slice(0, 5)}…` : b.label) : "✕", {
      width: 256,
      height: 256,
      size: b.label ? 120 : 110,
      fill: b.label ? "#ffffff" : "#8a8aa0",
      stroke: "#141414",
      strokeWidth: b.label ? 18 : 0,
      bg: skin.plate[tone],
      shadow: !!b.label,
    });
    const plate = new THREE.Mesh(roundedBox(BIN_W * S - 0.03, plateH - 0.02, 0.06, 0.02), [new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4 })]);
    // A front face with the label.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BIN_W * S - 0.05, plateH - 0.05), new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false }));
    face.position.set(X(binX(i)), Y(LABEL_TOP) - plateH / 2, 0.08);
    board.add(face);
    void plate;
    const glowH = halo(b.label ? 0xffd84a : 0xffffff, 0.8, 0);
    glowH.position.set(X(binX(i)), Y(BIN_TOP) - binH / 2, 0.3);
    board.add(glowH);
    return { ...bin, glow: glowH };
  });
  for (let i = 1; i < COIN_BINS; i++) {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.025, (H - BIN_TOP) * S, 0.14), metal(GOLD, 0.3));
    div.position.set(X(i * BIN_W), Y(BIN_TOP) - ((H - BIN_TOP) * S) / 2, 0.06);
    board.add(div);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.03, 0.16), metal(GOLD, 0.3));
  shelf.position.set(0, Y(BIN_TOP), 0.06);
  board.add(shelf);

  // The coin, and an aim marker on the rail.
  const coin = coinMesh("£", COIN_R * S * 1.45, "gold");
  coin.position.set(X(binX(3)), Y(-COIN_R - 6), 0.12);
  board.add(coin);
  const coinGlow = halo(0xffd84a, 0.45, 0.55);
  coin.add(coinGlow);
  coinGlow.position.z = -0.05;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 3), glow(0xffffff, 1.6));
  arrow.rotation.z = Math.PI;
  board.add(arrow);

  let phase: CoinDropPhase = "aim";
  let landedAt = -1;
  let celebrated = false;
  let coinX = coin.position.x;
  let lastY = coin.position.y;
  let dragX: number | null = null;
  let downAt = { x: 0, y: 0 };

  const aimFrom = (e: PointerEvent) => {
    const ray = ctx.ray(e);
    const tt = (0.12 - ray.origin.z) / ray.direction.z;
    const px = ray.origin.x + ray.direction.x * tt;
    const frac = (px / BW) + 0.5;
    ctx.get().setAim(Math.max(0, Math.min(COIN_BINS - 1, Math.round(frac * (COIN_BINS - 1)))));
  };

  return {
    update(dt, t) {
      const s = ctx.get();
      if (s.phase !== phase) {
        phase = s.phase;
        if (phase === "landed") landedAt = t;
      }
      if (phase === "aim" || !s.coin) {
        coinX = damp(coinX, X(binX(s.aim)), 14, dt);
        coin.position.set(coinX, Y(-COIN_R - 8) + (reducedMotion ? 0 : Math.sin(t * 3) * 0.03), 0.12);
        coin.rotation.y = reducedMotion ? 0 : Math.sin(t * 1.5) * 0.5;
        arrow.visible = true;
        arrow.position.set(coinX, Y(-COIN_R - 8) + 0.3 + (reducedMotion ? 0 : Math.sin(t * 5) * 0.03), 0.12);
      } else {
        arrow.visible = false;
        coin.position.set(X(s.coin.x), Y(s.coin.y), 0.12);
        const vy = coin.position.y - lastY;
        coin.rotation.z -= reducedMotion ? 0 : (coin.position.x - coinX) * 6;
        coin.rotation.y += reducedMotion ? 0 : dt * 8;
        if (phase === "landed") coin.rotation.y = damp(coin.rotation.y % (Math.PI * 2), 0, 6, dt);
        coinX = coin.position.x;
        void vy;
        if (phase === "dropping" && !reducedMotion && Math.floor(t * 20) % 2 === 0) fx.sparkBurst(coin.position.clone().add(board.position), 1, 0.3);
      }
      lastY = coin.position.y;
      // Studs light up where the coin touches them, then fade.
      studs.forEach((st, i) => {
        if (s.coin && phase === "dropping" && Math.hypot(s.coin.x - st.x, s.coin.y - st.y) < PEG_R + COIN_R + 4) {
          if (st.lit < 0.5 && !reducedMotion) ctx.shake(0.008, 60);
          st.lit = 1;
        }
        st.lit = Math.max(0, st.lit - dt * 1.2);
        studHalo[i].material.opacity = st.lit * 0.9;
        st.m.scale.setScalar(1 + st.lit * 0.25);
      });
      // Landing: the bin thumps and glows; a win throws confetti.
      bins.forEach((b, i) => {
        const hit = phase === "landed" && s.landedBin === i;
        b.thump?.(hit && !reducedMotion ? Math.max(0, Math.sin((t - landedAt) * 18)) * Math.max(0, 1 - (t - landedAt) * 0.6) : 0);
        b.glow.material.opacity = damp(b.glow.material.opacity, hit ? (layout.bins[i].label ? 0.9 : 0.25) : 0, 6, dt);
      });
      const won = phase === "landed" && s.landedBin != null && !!layout.bins[s.landedBin].label;
      if (won && !celebrated && t - landedAt > 0.05) {
        celebrated = true;
        const at = coin.position.clone().add(new THREE.Vector3(0, 0.2, 0.3));
        fx.confettiBurst(at, 140, 2.6, 2.4);
        fx.sparkBurst(at, 50, 2.2);
        ctx.shake(0.05, 380);
      }
      if (won) {
        const k = reducedMotion ? 1 : ease.outBack(clamp01((t - landedAt) / 0.5), 2);
        coin.scale.setScalar(1 + k * 0.6);
        coin.position.z = 0.12 + k * 0.3;
      }
      camera.lookAt(look);
    },
    pointer(kind, e) {
      const s = ctx.get();
      if (s.phase !== "aim") return;
      if (kind === "down") {
        downAt = { x: e.clientX, y: e.clientY };
        dragX = e.clientX;
        aimFrom(e);
      } else if (kind === "move" && dragX != null && e.buttons & 1) aimFrom(e);
      else if (kind === "up") {
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        dragX = null;
        if (moved < 8) s.drop();
      }
    },
  };
}

/** A loudspeaker bin: a black box with a cone that thumps. */
export function speakerBin(i: number, w: number, h: number) {
  void i;
  const root = new THREE.Group();
  const box = new THREE.Mesh(roundedBox(w, h, 0.18, 0.02), glossy(0x1d1d22, { roughness: 0.5 }));
  root.add(box);
  const cone = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.38, w * 0.3, 0.04, 28), glossy(0x3a3a3a, { roughness: 0.6 }));
  outer.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.SphereGeometry(w * 0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal(GOLD, 0.25));
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.02;
  cone.add(outer, inner);
  cone.position.z = 0.1;
  root.add(cone);
  return {
    root,
    thump: (k: number) => {
      cone.scale.setScalar(1 + k * 0.18);
      cone.position.z = 0.1 + k * 0.03;
    },
  };
}

/** A glossy cup bin (classic). */
export function cupBin(i: number, w: number, h: number) {
  const colours = [0xff2d95, 0x1fc4f4, 0xffe11a];
  const root = new THREE.Group();
  const box = new THREE.Mesh(roundedBox(w, h, 0.16, 0.03), glossy(colours[i % 3], { roughness: 0.25 }));
  outline(box, 0.008);
  root.add(box);
  return { root, thump: (k: number) => root.scale.set(1 + k * 0.08, 1 - k * 0.08, 1) };
}
