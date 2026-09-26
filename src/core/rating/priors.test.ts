import { describe, expect, it } from 'vitest';
import { LEGACY_INITIAL_RATING, TARGET_SHARE, legacyPriorSd, tierPriors, tierShares } from './priors';

describe('tierShares', () => {
  it('falls back to the target shares when nothing is classified', () => {
    expect(tierShares({ 1: 0, 2: 0, 3: 0 })).toEqual(TARGET_SHARE);
  });

  it('approaches the observed shares as counts grow', () => {
    const s = tierShares({ 1: 300, 2: 300, 3: 400 });
    expect(s[1]).toBeCloseTo(0.3, 2);
    expect(s[1] + s[2] + s[3]).toBeCloseTo(1, 12);
  });
});

describe('tierPriors', () => {
  it('orders tiers and lands near the v1 values for the target distribution', () => {
    const p = tierPriors({ 1: 10, 2: 40, 3: 50 });
    expect(p[1].mean).toBeGreaterThan(p[2].mean);
    expect(p[2].mean).toBeGreaterThan(p[3].mean);
    for (const tier of [1, 2, 3] as const) {
      expect(Math.abs(p[tier].mean - LEGACY_INITIAL_RATING[tier])).toBeLessThan(25);
      expect(p[tier].sd).toBeGreaterThan(90);
      expect(p[tier].sd).toBeLessThan(160);
    }
  });

  it('shifts the tier-1 prior down when tier 1 is large', () => {
    const narrow = tierPriors({ 1: 50, 2: 200, 3: 250 });
    const wide = tierPriors({ 1: 250, 2: 150, 3: 100 });
    expect(wide[1].mean).toBeLessThan(narrow[1].mean - 100);
  });

  it('with no classification noise, the prior is the truncated normal band', () => {
    const p = tierPriors({ 1: 10, 2: 40, 3: 50 }, 0);
    expect(p[1].mean).toBeCloseTo(1500 + 200 * 1.755, 0);
    expect(p[3].mean).toBeCloseTo(1500 - 200 * Math.sqrt(2 / Math.PI), 0);
  });

  it('is centered when a single tier holds everything', () => {
    const p = tierPriors({ 1: 0, 2: 0, 3: 1000 });
    expect(Math.abs(p[3].mean - 1500)).toBeLessThan(15);
  });
});

describe('legacyPriorSd', () => {
  it('equals the tier sd without comparisons and shrinks with more', () => {
    expect(legacyPriorSd(120, 0)).toBeCloseTo(120, 6);
    expect(legacyPriorSd(120, 10)).toBeLessThan(legacyPriorSd(120, 2));
    expect(legacyPriorSd(120, 10)).toBeGreaterThan(40);
  });
});
