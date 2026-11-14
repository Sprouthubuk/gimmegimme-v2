import { Container, Sprite, type Texture, type Ticker } from "pixi.js";

/**
 * Pooled particles with a hard cap, so a big win never drops frames on a mid-range phone. Purely visual.
 */

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  max: number;
  gravity: number;
  drag: number;
  fade: boolean;
  spin3d: boolean;
}

export interface BurstOptions {
  x: number;
  y: number;
  count: number;
  texture: Texture;
  tints: number[];
  speed?: [number, number];
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  drag?: number;
  spread?: number;
  angle?: number;
  /** Confetti: flips as it falls. */
  flutter?: boolean;
  additive?: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  readonly view = new Container();
  private live: P[] = [];
  private pool: Sprite[] = [];

  constructor(private ticker: Ticker, private cap = 220) {
    this.ticker.add(this.update, this);
  }

  burst(o: BurstOptions): void {
    const room = Math.max(0, this.cap - this.live.length);
    const n = Math.min(o.count, room);
    for (let i = 0; i < n; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = o.texture;
      s.anchor.set(0.5);
      s.tint = o.tints[i % o.tints.length];
      s.blendMode = o.additive ? "add" : "normal";
      const size = rnd(...(o.size ?? [6, 14]));
      s.width = size;
      s.height = o.flutter ? size * 0.55 : size;
      s.position.set(o.x, o.y);
      s.alpha = 1;
      s.rotation = rnd(0, Math.PI * 2);
      const a = (o.angle ?? -Math.PI / 2) + rnd(-(o.spread ?? Math.PI), o.spread ?? Math.PI);
      const v = rnd(...(o.speed ?? [2, 7]));
      const max = rnd(...(o.life ?? [40, 80]));
      this.view.addChild(s);
      this.live.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: rnd(-0.2, 0.2), life: max, max, gravity: o.gravity ?? 0.12, drag: o.drag ?? 0.985, fade: true, spin3d: !!o.flutter });
    }
  }

  private update(t: Ticker): void {
    const dt = Math.min(t.deltaTime, 3);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.view.removeChild(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      if (p.spin3d) p.s.scale.y = Math.abs(Math.cos((p.max - p.life) * 0.18)) * (p.s.scale.x || 1);
      if (p.fade) p.s.alpha = Math.min(1, p.life / (p.max * 0.4));
    }
  }

  clear(): void {
    for (const p of this.live) { this.view.removeChild(p.s); this.pool.push(p.s); }
    this.live = [];
  }

  destroy(): void {
    this.ticker.remove(this.update, this);
    this.view.destroy({ children: true });
    this.pool = [];
    this.live = [];
  }
}
