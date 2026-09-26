import { describe, expect, it } from 'vitest';
import { focusPoolSize, pairKey, selectPair, type PairCandidate } from './pairing';
import { createRng } from './rng';

const make = (n: number, f: (i: number) => Partial<PairCandidate> = () => ({})): PairCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    rating: 1500 + (n - i) * 10,
    sigma: 60,
    baseSigma: 120,
    ...f(i),
  }));

describe('pairKey', () => {
  it('is order independent', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });
});

describe('selectPair', () => {
  it('needs at least two candidates', () => {
    expect(selectPair(make(1), { rng: createRng(1) })).toBeNull();
  });

  it('returns two distinct known ids and is deterministic per seed', () => {
    const cands = make(30);
    const a = selectPair(cands, { rng: createRng(42) });
    const b = selectPair(cands, { rng: createRng(42) });
    expect(a).toEqual(b);
    expect(a![0]).not.toBe(a![1]);
    expect(cands.map(c => c.id)).toEqual(expect.arrayContaining(a!));
  });

  it('always includes the most uncertain track', () => {
    const cands = make(30, i => (i === 17 ? { sigma: 120 } : {}));
    for (let seed = 0; seed < 50; seed++) {
      expect(selectPair(cands, { rng: createRng(seed) })).toContain('t17');
    }
  });

  it('prefers opponents with a close rating', () => {
    const cands = make(200, i => (i === 100 ? { sigma: 120 } : {}));
    for (let seed = 0; seed < 30; seed++) {
      const pair = selectPair(cands, { rng: createRng(seed) })!;
      const other = pair.find(id => id !== 't100')!;
      expect(Math.abs(Number(other.slice(1)) - 100)).toBeLessThanOrEqual(12);
    }
  });

  it('avoids pairs that were already compared when it can', () => {
    const cands = make(3, i => (i === 0 ? { sigma: 120 } : {}));
    const seen = new Set([pairKey('t0', 't1')]);
    for (let seed = 0; seed < 30; seed++) {
      const pair = selectPair(cands, { rng: createRng(seed), seen })!;
      expect(pair).toContain('t0');
      expect(pair).toContain('t2');
    }
  });

  it('avoids the previous pair when it can', () => {
    const cands = make(10);
    const avoid = new Set(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);
    const pair = selectPair(cands, { rng: createRng(3), avoid })!;
    expect(pair.sort()).toEqual(['t8', 't9']);
  });

  it('focus=top draws the uncertain side from the leaders', () => {
    const cands = make(100, i => ({ sigma: 60 + i * 0.5 }));
    const size = focusPoolSize(100);
    for (let seed = 0; seed < 40; seed++) {
      const pair = selectPair(cands, { rng: createRng(seed), focus: 'top' })!;
      expect(pair.some(id => Number(id.slice(1)) < size)).toBe(true);
    }
  });
});
