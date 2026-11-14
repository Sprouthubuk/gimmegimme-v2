import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createRng, type Rng } from "../rng";
import { Fx } from "./fx";
import "./three.css";

/**
 * A 3D stage for a reveal board. The board keeps all of its rules (which result, when it is revealed) in
 * its own hooks, exactly as before; this only draws. The scene reads the board's latest state every frame
 * through ctx.get(), and reports taps back through callbacks the board puts in that state.
 *
 * If WebGL is not available the board's 2D version (fallback) is shown instead, so a game always plays.
 */
export interface SceneCtx<S> {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Canvas size in CSS pixels. */
  size: { w: number; h: number };
  /** Seeded, so a board looks the same every time it is replayed. Never decides anything. */
  rng: Rng;
  reducedMotion: boolean;
  /** The board's latest state. */
  get: () => S;
  /** Particle bursts (confetti, sparkles). */
  fx: Fx;
  /** The first of `objects` under a pointer event, or null. */
  pick: (objects: THREE.Object3D[], e: { clientX: number; clientY: number }) => THREE.Intersection | null;
  /** A pointer event as a ray from the camera. */
  ray: (e: { clientX: number; clientY: number }) => THREE.Ray;
  /** Shake the camera (wins, impacts). Skipped with reduced motion. */
  shake: (strength?: number, ms?: number) => void;
  bloom: UnrealBloomPass | null;
}

export interface SceneHandle {
  /** Called every frame: dt and t in seconds. */
  update: (dt: number, t: number) => void;
  pointer?: (kind: "down" | "move" | "up", e: PointerEvent) => void;
  dispose?: () => void;
}

interface Scene3DProps<S> {
  state: S;
  setup: (ctx: SceneCtx<S>) => SceneHandle;
  seed: string;
  reducedMotion: boolean;
  /** Height / width of the stage. */
  aspect?: number;
  className?: string;
  /** Glow on bright and emissive parts. */
  bloom?: { strength: number; radius: number; threshold: number } | false;
  /** Shown when WebGL is not available. */
  fallback: ReactNode;
  /** Accessible description of what is drawn. */
  label: string;
  /** Extra layers drawn over the canvas (labels, buttons). */
  children?: ReactNode;
}

let webglChecked: boolean | null = null;
/** True when this browser can draw WebGL. Checked once. */
export function canUseWebGL(): boolean {
  if (webglChecked != null) return webglChecked;
  try {
    const c = document.createElement("canvas");
    webglChecked = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

export function Scene3D<S>({ state, setup, seed, reducedMotion, aspect = 1, className = "", bloom = false, fallback, label, children }: Scene3DProps<S>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [failed, setFailed] = useState(() => typeof document !== "undefined" && !canUseWebGL());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (failed) return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.className = "rg3-canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", label);
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.03).texture;
    scene.environmentIntensity = 0.55;
    room.dispose?.();

    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (bloom) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    const size = { w: 1, h: 1 };
    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, Math.round(w * aspect));
      size.w = w;
      size.h = h;
      host.style.height = `${h}px`;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      composer?.setSize(w, h);
      bloomPass?.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const toNdc = (e: { clientX: number; clientY: number }) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    let shakeUntil = 0;
    let shakeStrength = 0;
    let clock = 0;
    const fx = new Fx(scene, createRng(`${seed}:fx`), reducedMotion);
    const ctx: SceneCtx<S> = {
      THREE,
      renderer,
      scene,
      camera,
      size,
      rng: createRng(seed),
      reducedMotion,
      get: () => stateRef.current,
      fx,
      pick: (objects, e) => {
        toNdc(e);
        return raycaster.intersectObjects(objects, true)[0] ?? null;
      },
      ray: (e) => {
        toNdc(e);
        return raycaster.ray.clone();
      },
      shake: (strength = 0.06, ms = 380) => {
        if (reducedMotion) return;
        shakeStrength = strength;
        shakeUntil = clock + ms / 1000;
      },
      bloom: bloomPass,
    };

    let handle: SceneHandle | null = null;
    const onPointer = (kind: "down" | "move" | "up") => (e: PointerEvent) => {
      if (kind === "down") renderer.domElement.setPointerCapture?.(e.pointerId);
      handle?.pointer?.(kind, e);
    };
    const down = onPointer("down");
    const move = onPointer("move");
    const up = onPointer("up");
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);

    // Only draw while the stage is on screen and the tab is visible.
    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting);
    });
    io.observe(host);

    let last = performance.now();
    const basePos = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!handle || !visible || document.hidden) return;
      clock += dt;
      handle.update(dt, clock);
      fx.update(dt);
      basePos.copy(camera.position);
      if (clock < shakeUntil) {
        const k = shakeStrength * ((shakeUntil - clock) / 0.4);
        camera.position.x += Math.sin(clock * 83) * k;
        camera.position.y += Math.cos(clock * 71) * k;
      }
      if (composer) composer.render();
      else renderer.render(scene, camera);
      camera.position.copy(basePos);
    };

    // Text on the board is drawn in the brand fonts, so wait for them first.
    const fontsReady = document.fonts ? Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 32px "Nunito"')]).catch(() => undefined) : Promise.resolve();
    fontsReady.then(() => {
      if (disposed) return;
      try {
        handle = setup(ctx);
      } catch (err) {
        console.error("3D board failed to build; showing the 2D board", err);
        setFailed(true);
        return;
      }
      setReady(true);
      raf = requestAnimationFrame(loop);
    });

    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      handle?.dispose?.();
      fx.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      scene.environment?.dispose();
      (scene.background as THREE.Texture | null)?.dispose?.();
      pmrem.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // The scene is built once per board; state changes are read through ctx.get().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  if (failed) return <>{fallback}</>;
  return (
    <div ref={hostRef} className={`rg3-stage ${ready ? "is-ready" : ""} ${className}`}>
      {children}
    </div>
  );
}
