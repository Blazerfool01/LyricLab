import { describe, expect, it } from 'vitest';
import { fingerprint, namedRandom } from './randomness';

const draw = (source: { next(): number }, count = 12) => Array.from({ length: count }, () => source.next());

describe('canonical fingerprints', () => {
  it.each([
    [null, '77074ba4'],
    [{}, '5465b825'],
    [{ a: 1, b: 2 }, '5314055b'],
    [[1, 2, 3], 'e0f965d9'],
  ])('matches the fixed FNV-1a vector for %j', (value, expected) => {
    expect(fingerprint(value)).toBe(`fnv1a-v1-${expected}`);
  });

  it('ignores nested object insertion order without mutating input', () => {
    const left = { z: [{ beta: 2, alpha: 1 }], a: { y: false, x: 'north' } };
    const right = { a: { x: 'north', y: false }, z: [{ alpha: 1, beta: 2 }] };
    const before = JSON.stringify(left);
    expect(fingerprint(left)).toBe(fingerprint(right));
    expect(JSON.stringify(left)).toBe(before);
  });

  it('retains array ordering, primitive types and significant content', () => {
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
    expect(fingerprint('1')).not.toBe(fingerprint(1));
    expect(fingerprint({ text: 'north' })).not.toBe(fingerprint({ text: 'south' }));
    expect(fingerprint(['a', 'bc'])).not.toBe(fingerprint(['ab', 'c']));
  });
});

describe('named deterministic streams', () => {
  it('pins the named Mulberry32 v1 stream vector', () => {
    const source = namedRandom(2408, ['section-key-a', 'candidate', '3']);
    expect(draw(source, 8)).toEqual([
      0.3748045878019184, 0.85668765171431, 0.7588493118528277,
      0.31615578732453287, 0.915941332699731, 0.4321333719417453,
      0.42235349444672465, 0.07498780125752091,
    ]);
  });

  it('repeats a stream from explicit seed and namespace', () => {
    const namespace = Object.freeze(['section-key-a', 'candidate', '3']);
    expect(draw(namedRandom(2408, namespace))).toEqual(draw(namedRandom(2408, namespace)));
  });

  it('keeps style and later candidate streams independent of earlier draw counts', () => {
    const styleBefore = draw(namedRandom(2408, ['style']));
    const candidateBefore = draw(namedRandom(2408, ['section-a', 'candidate', '2']));
    const rejected = namedRandom(2408, ['section-a', 'candidate', '1']);
    draw(rejected, 1000);
    expect(draw(namedRandom(2408, ['style']))).toEqual(styleBefore);
    expect(draw(namedRandom(2408, ['section-a', 'candidate', '2']))).toEqual(candidateBefore);
  });

  it('isolates already-created streams and new instances of the same stream', () => {
    const first = namedRandom(123, ['section-a']);
    const independent = namedRandom(123, ['section-b']);
    const expected = namedRandom(123, ['section-a']);
    expect(first.next()).toBe(expected.next());
    draw(independent, 50);
    expect(first.next()).toBe(expected.next());
    expect(draw(namedRandom(123, ['section-a']))).toEqual(draw(namedRandom(123, ['section-a'])));
  });

  it('distinguishes seed, namespace segments, order, operation and variation', () => {
    const vectors = [
      [2408, ['section-a', 'candidate', '1']],
      [2409, ['section-a', 'candidate', '1']],
      [2408, ['section-a', 'candidate', '2']],
      [2408, ['section-a', 'dialect', '1']],
      [2408, ['section-a/candidate/1']],
      [2408, ['candidate', 'section-a', '1']],
    ] as const;
    const sequences = vectors.map(([seed, namespace]) => JSON.stringify(draw(namedRandom(seed, namespace))));
    expect(new Set(sequences).size).toBe(vectors.length);
  });

  it.each([0, 0xffffffff])('accepts uint32 boundary seed %i and produces [0, 1) values', seed => {
    for (const value of draw(namedRandom(seed, ['boundary']), 100)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it.each([-1, 0x100000000, 1.5, NaN, Infinity, -Infinity])('rejects invalid seed %s', seed => {
    expect(() => namedRandom(seed, ['candidate'])).toThrow();
  });

  it.each([{ namespace: [] }, { namespace: [''] }, { namespace: ['candidate', ''] }])('rejects an empty namespace or segment $namespace', ({ namespace }) => {
    expect(() => namedRandom(2408, namespace)).toThrow();
  });
});
