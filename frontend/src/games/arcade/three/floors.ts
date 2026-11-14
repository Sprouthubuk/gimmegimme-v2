import * as THREE from "three";
import { glossy } from "./kit";

/** Floors for the 3D boards, drawn on canvas so they cost nothing to load. */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

/** Wet cobbles under street lamps. */
export function cobbles(rng: () => number): THREE.Mesh {
  const tex = canvasTex(512, 512, (g) => {
    g.fillStyle = "#1a2236";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const cx = x * 64 + (y % 2) * 32 + 32;
        const cy = y * 64 + 32;
        const grad = g.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, 34);
        const l = 24 + Math.floor(rng() * 12);
        grad.addColorStop(0, `hsl(225 20% ${l + 18}%)`);
        grad.addColorStop(1, `hsl(225 22% ${l - 14}%)`);
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(cx, cy, 28, 26, rng(), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#0b0f1a";
        g.lineWidth = 4;
        g.stroke();
      }
  }, 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.2), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.3;
  return m;
}

/** Ship's deck planks. */
export function planks(rng: () => number): THREE.Mesh {
  const tex = canvasTex(512, 512, (g) => {
    for (let i = 0; i < 8; i++) {
      const grad = g.createLinearGradient(i * 64, 0, i * 64 + 64, 0);
      const h = 24 + rng() * 6;
      grad.addColorStop(0, `hsl(${h} 55% 30%)`);
      grad.addColorStop(0.5, `hsl(${h} 58% 38%)`);
      grad.addColorStop(1, `hsl(${h} 55% 28%)`);
      g.fillStyle = grad;
      g.fillRect(i * 64, 0, 64, 512);
      g.strokeStyle = "rgba(60,25,8,0.35)";
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const x = i * 64 + 8 + rng() * 48;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, 170, x - 6, 340, x + 3, 512);
        g.stroke();
      }
      g.fillStyle = "#1c0b03";
      g.fillRect(i * 64, 0, 4, 512);
      const seam = Math.floor(rng() * 400);
      g.fillRect(i * 64, seam, 64, 4);
      g.fillStyle = "#c9a26b";
      g.beginPath();
      g.arc(i * 64 + 12, seam + 14, 3, 0, Math.PI * 2);
      g.arc(i * 64 + 52, seam + 14, 3, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.2), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.65, clearcoat: 0.25, envMapIntensity: 0.4, color: 0xd8c8b8 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.3;
  return m;
}

/** A glossy candy-pink floor with brand polka dots. */
export function candy(): THREE.Mesh {
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#ff8cc8";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.beginPath();
      g.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 9, 0, Math.PI * 2);
      g.fill();
    }
  }, 4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.3;
  return m;
}

/** A street lamp with a warm glow. */
export function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  const iron = glossy(0x1d1d24, { roughness: 0.4 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.6, 12), iron);
  post.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffd36a, emissiveIntensity: 2 }));
  head.position.y = 1.38;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 6), iron);
  cap.position.y = 1.52;
  const light = new THREE.PointLight(0xffd36a, 2.5, 3.5, 1.6);
  light.position.y = 1.3;
  g.add(post, head, cap, light);
  return g;
}
