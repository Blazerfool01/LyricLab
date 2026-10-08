import type { Fingerprint, RandomSource, Seed } from './contracts';

/** Codepoint ordering avoids host-locale dependence. Arrays retain semantic order. */
export function canonical(value: unknown): string {
  const active = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Non-finite fingerprint input');
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item !== 'object') throw new Error('Unserializable fingerprint input');
    if (active.has(item)) throw new Error('Cyclic fingerprint input');
    active.add(item);
    let encoded: string;
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) if (!(i in item)) throw new Error('Sparse fingerprint input');
      encoded = `[${item.map(encode).join(',')}]`;
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new Error('Nonplain fingerprint input');
      if (Object.getOwnPropertySymbols(item).length) throw new Error('Symbol fingerprint input');
      encoded = `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    active.delete(item);
    return encoded;
  }
  return encode(value);
}
/** FNV-1a/UTF-16 v1, a deterministic content identifier, not a security checksum. */
export function fingerprint(value: unknown): Fingerprint {
  let hash = 2166136261;
  for (const char of canonical(value)) {
    // Iterate code units explicitly, including both halves of astral characters.
    for (let i = 0; i < char.length; i++) hash = Math.imul(hash ^ char.charCodeAt(i), 16777619);
  }
  return `fnv1a-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function validateSeed(seed: number): asserts seed is Seed {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
}
/** Named Mulberry32 streams never share state. Namespace tuple encoding prevents collisions. */
export function namedRandom(seed: Seed, namespace: readonly string[]): RandomSource {
  validateSeed(seed);
  if (!namespace.length || namespace.some(part => typeof part !== 'string' || !part.length)) throw new Error('Stream namespace must contain nonempty strings');
  let state = parseInt(fingerprint([seed, ...namespace]).slice(-8), 16);
  return { next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } };
}
