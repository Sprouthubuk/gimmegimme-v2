import * as THREE from "three";
import logoAsset from "../shell/brand/logo.webp";

/**
 * Materials, textures and shapes shared by the 3D boards, in the Gimme Gimme look: glossy candy colours
 * with a clear-coat shine (like the logo's bubble letters), gold trim, and thick ink outlines.
 */
export const INK = 0x141414;

/** Glossy plastic or glass-bead candy. */
export function glossy(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1, ...opts });
}
/** Polished metal: gold, chrome. */
export function metal(color: THREE.ColorRepresentation, roughness = 0.22) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.15 });
}
export const GOLD = 0xffc23d;
export const CHROME = 0xdfe6ef;
/** Something that glows (bulbs, neon). Bright enough to bloom. */
export function glow(color: THREE.ColorRepresentation, intensity = 2.4) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: intensity, roughness: 0.4 });
}
/** Clear glass that shows reflections but stays cheap on phones. */
export function glass(tint: THREE.ColorRepresentation = 0xffffff, opacity = 0.12) {
  return new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.04, metalness: 0, transparent: true, opacity, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false });
}

/** An ink outline: the object's back faces, pushed out a little and drawn black (the "inverted hull"). */
export function outline(mesh: THREE.Mesh, thickness = 0.035): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.thickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float thickness;")
      .replace("#include <begin_vertex>", "vec3 transformed = position + normal * thickness;");
  };
  const hull = new THREE.Mesh(mesh.geometry, mat);
  hull.name = "outline";
  mesh.add(hull);
  return hull;
}

/** A canvas texture with lettering in the brand fonts. */
export function textTexture(
  text: string,
  {
    width = 512,
    height = 256,
    font = "Lilita One",
    size = 140,
    fill = "#ffffff",
    stroke = "#141414",
    strokeWidth = 16,
    bg = null as null | string | ((ctx: CanvasRenderingContext2D, w: number, h: number) => void),
    shadow = true,
    lines = null as null | string[],
  } = {},
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (typeof bg === "string") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  } else if (bg) bg(ctx, width, height);
  const all = lines ?? [text];
  // Shrink to fit the width.
  let s = size;
  ctx.font = `${s}px "${font}"`;
  const widest = () => Math.max(...all.map((l) => ctx.measureText(l).width));
  while (s > 12 && widest() > width * 0.88) {
    s -= 4;
    ctx.font = `${s}px "${font}"`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const lh = s * 1.02;
  all.forEach((l, i) => {
    const y = height / 2 + (i - (all.length - 1) / 2) * lh + s * 0.04;
    if (shadow) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(l, width / 2, y + s * 0.07);
    }
    if (strokeWidth) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth * (s / size);
      ctx.strokeText(l, width / 2, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(l, width / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A vertical gradient for a scene's background. */
export function gradientTexture(stops: [number, string][], vignette = 0.55): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  if (vignette) {
    const v = ctx.createLinearGradient(0, 0, 0, 512);
    v.addColorStop(0, `rgba(0,0,0,${vignette * 0.4})`);
    v.addColorStop(0.5, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 16, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A gold coin face with a prize on it. */
function coinFace(label: string, tone: "gold" | "pink" | "cyan" = "gold"): THREE.CanvasTexture {
  const palette = { gold: ["#fff6c2", "#ffd23f", "#c98a00", "#7a4a00"], pink: ["#ffd0e8", "#ff4fa8", "#c40066", "#6e0038"], cyan: ["#d8f6ff", "#38cdf6", "#0087b8", "#004a66"] }[tone];
  return textTexture(label, {
    width: 512,
    height: 512,
    size: label.length > 5 ? 150 : 190,
    fill: "#ffffff",
    stroke: "#141414",
    strokeWidth: 22,
    bg: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.38, h * 0.32, 20, w / 2, h / 2, w * 0.52);
      g.addColorStop(0, palette[0]);
      g.addColorStop(0.45, palette[1]);
      g.addColorStop(1, palette[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 18;
      ctx.strokeStyle = palette[3];
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([10, 16]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    },
  });
}

/** A chunky coin with the prize printed on both faces. */
export function coinMesh(label: string, radius = 0.32, tone: "gold" | "pink" | "cyan" = "gold"): THREE.Group {
  const g = new THREE.Group();
  // The cylinder is turned to face the camera, so each cap's picture is turned back upright.
  const front = coinFace(label, tone);
  front.center.set(0.5, 0.5);
  front.rotation = Math.PI / 2;
  const back = coinFace(label, tone);
  back.center.set(0.5, 0.5);
  back.rotation = -Math.PI / 2;
  back.repeat.set(-1, 1);
  back.wrapS = THREE.RepeatWrapping;
  const rim = tone === "gold" ? metal(GOLD, 0.18) : glossy(tone === "pink" ? 0xff2d95 : 0x1fc4f4);
  const faceMat = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.2, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, envMapIntensity: 0.6 });
  const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.22, 56);
  const coin = new THREE.Mesh(geo, [rim, faceMat(front), faceMat(back)]);
  coin.rotation.x = Math.PI / 2;
  outline(coin, radius * 0.06);
  g.add(coin);
  return g;
}

/** A sprite label that always faces the camera. */
export function labelSprite(text: string, height = 0.22, opts: Parameters<typeof textTexture>[1] = {}): THREE.Sprite {
  const tex = textTexture(text, { width: 512, height: 160, size: 110, ...opts });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((height * 512) / 160, height, 1);
  return s;
}

/** Lights that suit glossy candy: a warm key, a cool rim and a soft fill. */
export function studioLights(scene: THREE.Scene, { key = 0xfff1e0, rim = 0x8fd8ff, fill = 0xffb3d9, strength = 1 } = {}) {
  const k = new THREE.DirectionalLight(key, 2.4 * strength);
  k.position.set(2.5, 4, 5);
  const r = new THREE.DirectionalLight(rim, 1.6 * strength);
  r.position.set(-4, 2, -3);
  const f = new THREE.HemisphereLight(fill, 0x1a0d22, 0.7 * strength);
  scene.add(k, r, f);
  return { key: k, rim: r, fill: f };
}

/** Rounded box, for cabinets and panels. */
export function roundedBox(W: number, H: number, d: number, r = 0.08, seg = 4): THREE.BufferGeometry {
  // The bevel adds r on every side, so the outline is drawn r smaller: the finished box is W x H x d.
  r = Math.min(r, W / 2 - 0.001, H / 2 - 0.001, d / 2 - 0.001);
  const w = W - r * 2;
  const h = H - r * 2;
  const rr = Math.min(r, w / 2, h / 2);
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + rr, y);
  shape.lineTo(x + w - rr, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + rr);
  shape.lineTo(x + w, y + h - rr);
  shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  shape.lineTo(x + rr, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - rr);
  shape.lineTo(x, y + rr);
  shape.quadraticCurveTo(x, y, x + rr, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: seg, curveSegments: seg * 2 });
  geo.translate(0, 0, -(d - r * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Ease helpers for hand-written motion. */
export const ease = {
  outBack: (t: number, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** A soft round shadow to sit under objects. */
export function blobShadow(radius = 0.3, opacity = 0.45): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, `rgba(0,0,0,${opacity})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

let haloTex: THREE.CanvasTexture | null = null;
/** A soft additive glow, for bulbs, coins and lights: cheaper than a bloom pass and works on every phone. */
export function halo(color: THREE.ColorRepresentation, size = 0.4, opacity = 0.8): THREE.Sprite {
  if (!haloTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

const logoUrl = typeof (logoAsset as unknown) === "string" ? (logoAsset as unknown as string) : (logoAsset as unknown as { src: string }).src;
/** The Gimme Gimme logo on a plane (191 x 128), for the front of a cabinet. */
export function logoPlate(width = 0.6): THREE.Mesh {
  const tex = new THREE.TextureLoader().load(logoUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * 128) / 191), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  return m;
}
