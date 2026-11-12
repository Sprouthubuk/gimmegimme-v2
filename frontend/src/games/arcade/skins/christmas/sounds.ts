/**
 * Optional sounds for the Christmas skin: a cracker bang, sleigh bells, a door
 * creak and a chime. Made on the spot with the Web Audio API, so there is no
 * file to download. Muted until the player turns them on with the sound button,
 * and back to muted on the next page load. Decorative: a phone that cannot play
 * them simply stays silent.
 */
import { useSyncExternalStore } from "react";
import { createRng } from "../../rng";

export type SoundName = "bang" | "bells" | "creak" | "chime";

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
