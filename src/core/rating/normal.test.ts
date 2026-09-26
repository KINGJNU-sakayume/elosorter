import { describe, expect, it } from 'vitest';
import { bandMoments, normCdf, normPdf, probit } from './normal';

describe('normCdf', () => {
  it('matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normCdf(-1)).toBeCloseTo(0.158655, 6);
    expect(normCdf(Infinity)).toBe(1);
    expect(normCdf(-Infinity)).toBe(0);
  });

  it('is symmetric', () => {
    for (const x of [0.1, 0.7, 1.3, 2.5, 4]) {
      expect(normCdf(x) + normCdf(-x)).toBeCloseTo(1, 7);
    }
  });
});

describe('probit', () => {
  it('inverts normCdf', () => {
    for (let x = -3; x <= 3; x += 0.25) {
      expect(probit(normCdf(x))).toBeCloseTo(x, 4);
    }
  });

  it('reproduces the v1 initial ratings', () => {
    expect(Math.round(1500 + 200 * probit(0.95))).toBe(1829);
    expect(Math.round(1500 + 200 * probit(0.7))).toBe(1605);
    expect(Math.round(1500 + 200 * probit(0.25))).toBe(1365);
  });

  it('handles the edges', () => {
    expect(probit(0)).toBe(-Infinity);
    expect(probit(1)).toBe(Infinity);
  });
});

describe('bandMoments', () => {
  it('whole distribution is standard normal', () => {
    const { mean, variance } = bandMoments(0, 1);
    expect(mean).toBeCloseTo(0, 9);
    expect(variance).toBeCloseTo(1, 9);
  });

  it('upper half is the half-normal', () => {
    const { mean, variance } = bandMoments(0.5, 1);
    expect(mean).toBeCloseTo(Math.sqrt(2 / Math.PI), 6);
    expect(variance).toBeCloseTo(1 - 2 / Math.PI, 6);
  });

  it('top 10% band', () => {
    const { mean, variance } = bandMoments(0.9, 1);
    expect(mean).toBeCloseTo(normPdf(probit(0.9)) / 0.1, 6);
    expect(mean).toBeCloseTo(1.755, 3);
    expect(variance).toBeGreaterThan(0.1);
    expect(variance).toBeLessThan(0.2);
  });

  it('degenerate band does not blow up', () => {
    const { mean, variance } = bandMoments(0.3, 0.3);
    expect(Number.isFinite(mean)).toBe(true);
    expect(variance).toBe(0);
  });
});
