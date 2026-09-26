import { describe, expect, it } from 'vitest';
import { expectedPairAccuracy } from './metrics';

describe('expectedPairAccuracy', () => {
  it('is null for fewer than two items', () => {
    expect(expectedPairAccuracy([{ rating: 1500, sigma: 50 }])).toBeNull();
  });

  it('is 0.5 when everything is tied', () => {
    const items = Array.from({ length: 20 }, () => ({ rating: 1600, sigma: 100 }));
    expect(expectedPairAccuracy(items)).toBeCloseTo(0.5, 9);
  });

  it('approaches 1 for well separated, certain ratings', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ rating: 1000 + i * 100, sigma: 5 }));
    expect(expectedPairAccuracy(items)).toBeGreaterThan(0.999);
  });

  it('sampling agrees with the exact value', () => {
    const items = Array.from({ length: 400 }, (_, i) => ({
      rating: 1500 + Math.sin(i) * 300,
      sigma: 40 + (i % 7) * 10,
    }));
    const exact = expectedPairAccuracy(items, Infinity)!;
    const sampled = expectedPairAccuracy(items, 20000)!;
    expect(Math.abs(exact - sampled)).toBeLessThan(0.01);
  });
});
