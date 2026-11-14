import "pixi.js/unsafe-eval"; // Pixi without eval: the site's Content-Security-Policy allows no eval
import { Application, Assets, Container, Graphics, Sprite, Texture, type Ticker } from "pixi.js";
import { glowTexture } from "../shared/textures";
import { hex, type Theme } from "../shared/theme";

/**
 * The Pixi scene shared by every game: a near-black backdrop with slow bokeh and a faint perspective grid,
 * a lit stage with a soft spotlight and a reflective floor. Designed in a 390-wide portrait space and scaled
 * to fit; the height follows the screen so nothing is cut off.
 */

export const DESIGN_W = 390;

export interface Stage {
  app: Application;
  /** Everything in design units (390 wide). */
  root: Container;
  /** The game's own layer, between the backdrop and the effects. */
  scene: Container;
  /** Particles, rays and other effects above the game. */
  fx: Container;
  /** Design-space size, updated on resize. */
  size: { w: number; h: number };
  /** Where the game centres its main object, and where the hint button sits (the game sets both). */
  focus: { x: number; y: number; hintY: number };
  onResize(fn: () => void): void;
  destroy(): void;
}

export async function createStage(host: HTMLElement, theme: Theme, reducedMotion: boolean, backgroundImage?: string): Promise<Stage> {
  // Workers load images from blob: URLs, which the site's security policy doesn't allow.
  Assets.setPreferences({ preferWorkers: false });
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundColor: hex(theme.background),
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    powerPreference: "high-performance",
  });
  app.canvas.setAttribute("aria-hidden", "true");
  host.appendChild(app.canvas);

  const root = new Container();
  const back = new Container();
  const scene = new Container();
  const fx = new Container();
  root.addChild(back, scene, fx);
  app.stage.addChild(root);

  const size = { w: DESIGN_W, h: 844 };
  const focus = { x: DESIGN_W / 2, y: 400, hintY: 610 };
  const glow = glowTexture(256, 0.45);
  const textures: Texture[] = [glow];

  // Backdrop: an image if the theme has one, otherwise colour and light.
  let bgImage: Sprite | null = null;
  if (backgroundImage) {
    try {
      const t = await Assets.load<Texture>(backgroundImage);
      bgImage = new Sprite(t);
      bgImage.alpha = 0.85;
      back.addChild(bgImage);
    } catch { /* fall back to the drawn scene */ }
  }

  const grid = new Graphics();
  back.addChild(grid);
  const bokeh: { s: Sprite; vx: number; vy: number; tw: number }[] = [];
  const bokehLayer = new Container();
  back.addChild(bokehLayer);
  const count = reducedMotion ? 8 : 16;
  for (let i = 0; i < count; i++) {
    const s = new Sprite(glow);
    s.anchor.set(0.5);
    s.tint = hex(theme.bokeh[i % theme.bokeh.length]);
    s.blendMode = "add";
    const d = 20 + Math.random() * 70;
    s.width = s.height = d;
    s.alpha = 0.08 + Math.random() * 0.16;
    s.position.set(Math.random() * DESIGN_W, Math.random() * 844);
    bokehLayer.addChild(s);
    bokeh.push({ s, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.12, tw: Math.random() * Math.PI * 2 });
  }

  const spot = new Sprite(glow);
  spot.anchor.set(0.5);
  spot.tint = hex(theme.spotlight);
  spot.alpha = 0.22;
  spot.blendMode = "add";
  back.addChild(spot);

  const floor = new Graphics();
  back.addChild(floor);

  const snowLayer = new Container();
  back.addChild(snowLayer);
  const snow: { s: Sprite; v: number; drift: number }[] = [];
  const flakes = reducedMotion ? 0 : theme.snow;
  for (let i = 0; i < flakes; i++) {
    const s = new Sprite(glow);
    s.anchor.set(0.5);
    s.width = s.height = 3 + Math.random() * 5;
    s.alpha = 0.35 + Math.random() * 0.45;
    s.position.set(Math.random() * DESIGN_W, Math.random() * 844);
    snowLayer.addChild(s);
    snow.push({ s, v: 0.3 + Math.random() * 0.6, drift: Math.random() * Math.PI * 2 });
  }

  let gridOffset = 0;
  const drawGrid = () => {
    const { w, h } = size;
    grid.clear();
    const horizon = h * 0.6;
    const c = hex(theme.gridColor);
    for (let i = -10; i <= 10; i++) {
      grid.moveTo(w / 2 + i * 8, horizon).lineTo(w / 2 + i * 80, h);
    }
    for (let k = 0; k < 9; k++) {
      const t = ((k + gridOffset) % 9) / 9;
      const y = horizon + (h - horizon) * t * t;
      grid.moveTo(0, y).lineTo(w, y);
    }
    grid.stroke({ width: 1, color: c, alpha: theme.gridAlpha });
  };

  const drawFloor = () => {
    floor.clear();
    // Soft pool of light beneath the focus, standing in for the stage's reflection.
    floor.ellipse(focus.x, focus.y + 250, 150, 22).fill({ color: hex(theme.spotlight), alpha: 0.09 });
    floor.ellipse(focus.x, focus.y + 250, 90, 12).fill({ color: hex(theme.spotlight), alpha: 0.12 });
  };

  const listeners: (() => void)[] = [];
  const layout = () => {
    const scale = app.screen.width / DESIGN_W;
    root.scale.set(scale);
    size.w = DESIGN_W;
    size.h = app.screen.height / scale;
    focus.x = DESIGN_W / 2;
    focus.y = Math.max(300, Math.min(size.h * 0.47, size.h - 330));
    focus.hintY = focus.y + 210;
    spot.position.set(focus.x, focus.y - 40);
    spot.width = 520;
    spot.height = 620;
    if (bgImage) {
      const k = Math.max(size.w / bgImage.texture.width, size.h / bgImage.texture.height);
      bgImage.scale.set(k);
      bgImage.position.set((size.w - bgImage.width) / 2, (size.h - bgImage.height) / 2);
    }
    drawGrid();
    drawFloor();
    listeners.forEach((fn) => fn());
  };
  app.renderer.on("resize", layout);
  layout();

  const tick = (t: Ticker) => {
    const dt = Math.min(t.deltaTime, 3);
    for (const b of bokeh) {
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      b.tw += 0.01 * dt;
      b.s.alpha = Math.max(0.04, b.s.alpha + Math.sin(b.tw) * 0.0008);
      if (b.s.y < -60) { b.s.y = size.h + 60; b.s.x = Math.random() * size.w; }
      if (b.s.x < -60) b.s.x = size.w + 60;
      if (b.s.x > size.w + 60) b.s.x = -60;
    }
    for (const f of snow) {
      f.s.y += f.v * dt;
      f.drift += 0.02 * dt;
      f.s.x += Math.sin(f.drift) * 0.3;
      if (f.s.y > size.h + 10) { f.s.y = -10; f.s.x = Math.random() * size.w; }
    }
    if (!reducedMotion) {
      gridOffset = (gridOffset + 0.004 * dt) % 9;
      drawGrid();
    }
  };
  app.ticker.add(tick);

  return {
    app, root, scene, fx, size, focus,
    onResize: (fn) => listeners.push(fn),
    destroy() {
      app.ticker.remove(tick);
      app.renderer.off("resize", layout);
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
      for (const t of textures) t.destroy(true);
    },
  };
}
