import { Howl, Howler } from "howler";

/**
 * Sound through Howler. Off until the player turns it on (the choice is remembered). Placeholder sounds are
 * synthesised here as small WAV files, so the game works with no audio files; any of them can be replaced by
 * a file named in assets/manifest.json.
 */

export type SoundName = "scratch-loop" | "reveal" | "win-small" | "win-big" | "lose" | "button";

const KEY = "gg-games-sound";
const RATE = 22050;

function wav(samples: Float32Array): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return "data:audio/wav;base64," + btoa(bin);
}

const len = (s: number) => new Float32Array(Math.round(RATE * s));

/** Bell-like tone: a sine with a quick attack and exponential decay, plus a soft octave. */
function bell(out: Float32Array, at: number, freq: number, dur: number, gain: number) {
  const start = Math.round(at * RATE);
  const n = Math.round(dur * RATE);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t * 200) * Math.exp(-t * (4 / dur));
    out[start + i] += gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t));
  }
}

function synth(name: SoundName): string {
  switch (name) {
    case "scratch-loop": {
      // Filtered grain, looped quietly while scratching.
      const o = len(0.6);
      let last = 0;
      for (let i = 0; i < o.length; i++) {
        last = last * 0.82 + (Math.random() * 2 - 1) * 0.18;
        o[i] = last * 0.5 * (0.7 + 0.3 * Math.sin(i / 90));
      }
      return wav(o);
    }
    case "reveal": {
      const o = len(0.7);
      bell(o, 0, 1318.5, 0.6, 0.18);
      bell(o, 0.06, 1975.5, 0.5, 0.12);
      return wav(o);
    }
    case "win-small": {
      const o = len(1.1);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(o, i * 0.09, f, 0.8, 0.2));
      return wav(o);
    }
    case "win-big": {
      const o = len(2.2);
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => bell(o, i * 0.1, f, 1.4, 0.18));
      [1046.5, 1318.5, 1567.98, 2093].forEach((f) => bell(o, 0.75, f, 1.4, 0.1));
      return wav(o);
    }
    case "lose": {
      // Soft and short: a low muted tone, never a "fail" noise.
      const o = len(0.35);
      for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        o[i] = 0.12 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * (220 - t * 60) * t);
      }
      return wav(o);
    }
    case "button": {
      const o = len(0.06);
      for (let i = 0; i < o.length; i++) {
        const t = i / RATE;
        o[i] = 0.25 * Math.exp(-t * 90) * Math.sin(2 * Math.PI * 1800 * t);
      }
      return wav(o);
    }
  }
}

const NAMES: SoundName[] = ["scratch-loop", "reveal", "win-small", "win-big", "lose", "button"];

export class GameAudio {
  private howls = new Map<SoundName, Howl>();
  private on: boolean;
  private scratchId: number | null = null;

  constructor(private overrides: Record<string, string> = {}) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    this.on = saved === "on";
  }

  get enabled(): boolean { return this.on; }

  /** Turn sound on or off (remembered). Sounds are only built once the player has turned them on. */
  setEnabled(on: boolean): void {
    this.on = on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
    if (!on) this.stopScratch();
    if (on) this.ensure();
  }

  private ensure(): void {
    if (this.howls.size) return;
    for (const n of NAMES) {
      const src = this.overrides[`sound-${n}`] ?? synth(n);
      this.howls.set(n, new Howl({ src: [src], format: ["wav", "mp3", "webm", "ogg"], loop: n === "scratch-loop", volume: n === "scratch-loop" ? 0.35 : 0.8, preload: true }));
    }
  }

  play(n: SoundName): void {
    if (!this.on) return;
    this.ensure();
    this.howls.get(n)?.play();
  }

  startScratch(): void {
    if (!this.on || this.scratchId !== null) return;
    this.ensure();
    this.scratchId = this.howls.get("scratch-loop")?.play() ?? null;
  }

  stopScratch(): void {
    if (this.scratchId === null) return;
    this.howls.get("scratch-loop")?.stop(this.scratchId);
    this.scratchId = null;
  }

  destroy(): void {
    this.stopScratch();
    for (const h of this.howls.values()) h.unload();
    this.howls.clear();
    // Howler keeps one shared AudioContext for the page; leave it for other games.
    void Howler;
  }
}
