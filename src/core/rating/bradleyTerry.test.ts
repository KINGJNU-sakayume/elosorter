import { describe, expect, it } from 'vitest';
import { fitBradleyTerry, type IndexedMatch } from './bradleyTerry';
import { createRng } from './rng';
import { sigmoid } from './scale';

function gradient(
  theta: Float64Array,
  mean: number[],
  variance: number[],
  matches: IndexedMatch[],
): number[] {
  const g = mean.map((m, i) => (theta[i] - m) / variance[i]);
  for (const [a, b, s] of matches) {
    const p = sigmoid(theta[a] - theta[b]);
    g[a] -= s - p;
    g[b] += s - p;
  }
  return g;
}

describe('fitBradleyTerry', () => {
  it('returns the prior when there are no matches', () => {
    const fit = fitBradleyTerry([0.5, -0.2], [0.4, 0.3], []);
    expect(Array.from(fit.theta)).toEqual([0.5, -0.2]);
    expect(fit.variance[0]).toBeCloseTo(0.4, 12);
    expect(fit.converged).toBe(true);
  });

  it('a win moves the pair apart symmetrically and shrinks both variances', () => {
    const fit = fitBradleyTerry([0, 0], [0.4, 0.4], [[0, 1, 1]]);
    expect(fit.theta[0]).toBeGreaterThan(0);
    expect(fit.theta[0]).toBeCloseTo(-fit.theta[1], 9);
    expect(fit.variance[0]).toBeLessThan(0.4);
  });

  it('a graded win moves less than a decisive one, a tie pulls together', () => {
    const decisive = fitBradleyTerry([0, 0], [0.4, 0.4], [[0, 1, 1]]).theta[0];
    const slight = fitBradleyTerry([0, 0], [0.4, 0.4], [[0, 1, 0.75]]).theta[0];
    expect(slight).toBeGreaterThan(0);
    expect(slight).toBeLessThan(decisive);

    const tie = fitBradleyTerry([1, -1], [0.4, 0.4], [[0, 1, 0.5]]);
    expect(tie.theta[0] - tie.theta[1]).toBeLessThan(2);
  });

  it('reaches a stationary point of the posterior', () => {
    const rng = createRng(7);
    const n = 40;
    const mean = Array.from({ length: n }, () => rng() * 2 - 1);
    const variance = Array.from({ length: n }, () => 0.2 + rng() * 0.4);
    const matches: IndexedMatch[] = Array.from({ length: 300 }, () => {
      const a = Math.floor(rng() * n);
      const b = (a + 1 + Math.floor(rng() * (n - 1))) % n;
      return [a, b, [0, 0.25, 0.5, 0.75, 1][Math.floor(rng() * 5)]];
    });
    const fit = fitBradleyTerry(mean, variance, matches);
    expect(fit.converged).toBe(true);
    for (const g of gradient(fit.theta, mean, variance, matches)) {
      expect(Math.abs(g)).toBeLessThan(1e-5);
    }
  });

  it('does not depend on the order of the matches (unlike Elo)', () => {
    const matches: IndexedMatch[] = [[0, 1, 1], [1, 2, 1], [2, 0, 0.75], [0, 3, 0], [3, 1, 0.5]];
    const mean = [0, 0.3, -0.3, 0];
    const variance = [0.4, 0.4, 0.4, 0.4];
    const forward = fitBradleyTerry(mean, variance, matches);
    const backward = fitBradleyTerry(mean, variance, [...matches].reverse());
    for (let i = 0; i < 4; i++) expect(forward.theta[i]).toBeCloseTo(backward.theta[i], 6);
  });

  it('converges with lopsided data and a warm start far away', () => {
    const n = 31;
    const matches: IndexedMatch[] = [];
    for (let r = 0; r < 10; r++) for (let j = 1; j < n; j++) matches.push([0, j, 1]);
    const init = new Float64Array(n).fill(0);
    init[0] = -8;
    const fit = fitBradleyTerry(new Array(n).fill(0), new Array(n).fill(0.4), matches, init);
    expect(fit.converged).toBe(true);
    expect(fit.theta[0]).toBeGreaterThan(1);
    for (const g of gradient(fit.theta, new Array(n).fill(0), new Array(n).fill(0.4), matches)) {
      expect(Math.abs(g)).toBeLessThan(1e-5);
    }
  });

  it('stays fast on a large library', () => {
    const rng = createRng(1);
    const n = 3000;
    const matches: IndexedMatch[] = Array.from({ length: 6000 }, () => {
      const a = Math.floor(rng() * n);
      const b = (a + 1 + Math.floor(rng() * (n - 1))) % n;
      return [a, b, rng() < 0.5 ? 1 : 0];
    });
    const started = performance.now();
    const fit = fitBradleyTerry(new Array(n).fill(0), new Array(n).fill(0.4), matches);
    expect(fit.converged).toBe(true);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
