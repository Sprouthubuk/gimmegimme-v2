/**
 * Optional sounds for the themed skins (Christmas, Pirates, Cash Escape, Hip hop,
 * Smash My Cash): a cracker bang, sleigh bells, a door
 * creak, a chime, a clink of coins, a glass bauble cracking, a jar smashing, a
 * bass drop and a short vault alarm. Made on the spot with the Web Audio API, so there is no
 * file to download. Muted until the player turns them on with the sound button,
 * and back to muted on the next page load. Decorative: a phone that cannot play
 * them simply stays silent.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createRng } from "../../rng";

export type SoundName = "bang" | "bells" | "creak" | "chime" | "clink" | "crack" | "smash" | "bass" | "alarm";

let soundOn = false;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setSoundOn(on: boolean) {
  soundOn = on;
  // Browsers only allow audio to start from a tap, so the context is made here.
  if (on) audio();
  listeners.forEach((cb) => cb());
}

export const useSoundOn = (): boolean => useSyncExternalStore(subscribe, () => soundOn, () => false);

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as AudioCtor | undefined;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A short burst of noise. Seeded, so it is the same every time (and no unseeded randomness is used). */
let noise: AudioBuffer | null = null;
function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === a.sampleRate) return noise;
  const rng = createRng("christmas-noise");
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  noise = buf;
  return buf;
}

function envelope(a: AudioContext, at: number, peak: number, decay: number): GainNode {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  g.connect(a.destination);
  return g;
}

function tone(a: AudioContext, at: number, freq: number, peak: number, decay: number, type: OscillatorType = "sine") {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.connect(envelope(a, at, peak, decay));
  o.start(at);
  o.stop(at + decay + 0.05);
}

const SOUNDS: Record<SoundName, (a: AudioContext, t: number) => void> = {
  bang(a, t) {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    src.connect(lp).connect(envelope(a, t, 0.5, 0.32));
    src.start(t);
    src.stop(t + 0.4);
    const thump = a.createOscillator();
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    thump.connect(envelope(a, t, 0.4, 0.22));
    thump.start(t);
    thump.stop(t + 0.3);
  },
  bells(a, t) {
    const rng = createRng("christmas-bells");
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.11 + rng() * 0.03;
      const f = 2400 + rng() * 500;
      tone(a, at, f, 0.07, 0.25);
      tone(a, at, f * 1.5, 0.04, 0.18);
    }
  },
  creak(a, t) {
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(170, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.45);
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 6;
    o.connect(bp).connect(envelope(a, t, 0.12, 0.5));
    o.start(t);
    o.stop(t + 0.55);
  },
  clink(a, t) {
    // Two or three coins landing on each other: bright, metallic, quick.
    [0, 0.07, 0.15].forEach((d, i) => {
      tone(a, t + d, 3150 - i * 260, 0.06, 0.16, "triangle");
      tone(a, t + d, 4720 - i * 300, 0.03, 0.1);
    });
  },
  crack(a, t) {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    const hp = a.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    src.connect(hp).connect(envelope(a, t, 0.22, 0.12));
    src.start(t);
    src.stop(t + 0.2);
    tone(a, t + 0.02, 1760, 0.05, 0.35);
  },
  smash(a, t) {
    // A crunch of breaking glass, then a few shards tinkling down.
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    const bp = a.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.setValueAtTime(1800, t);
    src.connect(bp).connect(envelope(a, t, 0.35, 0.28));
    src.start(t);
    src.stop(t + 0.35);
    const rng = createRng("smash-shards");
    for (let i = 0; i < 5; i++) tone(a, t + 0.08 + i * 0.06 + rng() * 0.03, 2600 + rng() * 1800, 0.04, 0.18);
  },
  bass(a, t) {
    const o = a.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    o.connect(envelope(a, t, 0.55, 0.5));
    o.start(t);
    o.stop(t + 0.55);
    tone(a, t, 220, 0.12, 0.12, "square");
  },
  alarm(a, t) {
    // Two short two-tone whoops: the vault's alarm going off.
    [0, 0.32].forEach((d) => {
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(660, t + d);
      o.frequency.linearRampToValueAtTime(990, t + d + 0.22);
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      o.connect(lp).connect(envelope(a, t + d, 0.06, 0.28));
      o.start(t + d);
      o.stop(t + d + 0.3);
    });
  },
  chime(a, t) {
    [1046.5, 1318.5, 1568].forEach((f, i) => tone(a, t + i * 0.09, f, 0.09, 0.7));
  },
};

/** Plays a sound if the player has turned sound on. Never throws. */
export function playSound(name: SoundName) {
  if (!soundOn) return;
  const a = audio();
  if (!a) return;
  try {
    SOUNDS[name](a, a.currentTime + 0.01);
  } catch {
    /* sound is decoration only */
  }
}

/**
 * Plays a sound a moment from now, and forgets it if the board closes first: closing a game
 * (or "Reveal all") mid-animation never leaves a stray chime playing afterwards.
 */
export function useSoundLater() {
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    [],
  );
  return useCallback((name: SoundName, ms: number) => {
    timers.current.push(window.setTimeout(() => playSound(name), ms));
  }, []);
}
