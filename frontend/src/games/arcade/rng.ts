/**
 * Seeded PRNG. Boards are generated from `${purchaseId}:${ticketNumber}` so the
 * same ticket always draws the same board: re-renders and reloads can't reshuffle
 * what the player saw. Never used to decide an outcome — only to dress it.
 */
export type Rng = () => number;

function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createRng(seed: string): Rng {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Fill `count` slots from `pool` so that no value appears more than `maxEach`
 * times — the building block for "no accidental match-3" losing boards.
 */
export function fillCapped<T>(rng: Rng, pool: readonly T[], count: number, maxEach: number): T[] {
  const bag: T[] = [];
  for (const item of pool) for (let i = 0; i < maxEach; i++) bag.push(item);
  if (bag.length < count) throw new Error(`Pool too small: need ${count}, have ${bag.length}`);
  return shuffle(rng, bag).slice(0, count);
}

export const ticketSeed = (purchaseId: string, ticketNumber: number, index: number) =>
  `${purchaseId}:${ticketNumber}:${index}`;
