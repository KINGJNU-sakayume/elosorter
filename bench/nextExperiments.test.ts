import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, fitOrdinal, ordinalLossDerivatives } from './ordinalModel';
import { formatResults, modelTrial, pairingTrial, summarize, type ExperimentOptions } from './nextExperiments';

describe('five-category experimental model', () => {
  it('has symmetric response likelihood and a neutral tie gradient', () => {
    for (const score of [0, 0.25, 0.5, 0.75, 1]) {
      const left = ordinalLossDerivatives(0.8, score);
      const right = ordinalLossDerivatives(-0.8, 1 - score);
      expect(left.loss).toBeCloseTo(right.loss, 10);
      expect(left.gradient).toBeCloseTo(-right.gradient, 10);
      expect(left.curvature).toBeCloseTo(right.curvature, 10);
      expect(left.curvature).toBeGreaterThanOrEqual(0);
    }
    expect(ordinalLossDerivatives(0, 0.5).gradient).toBeCloseTo(0, 10);
  });

  it('returns priors with no evidence and orders decisive > slight > tie', () => {
    const mean = [0, 0];
    const variance = [0.6, 0.6];
    expect([...fitOrdinal(mean, variance, []).theta]).toEqual(mean);
    const decisive = fitOrdinal(mean, variance, [[0, 1, 1]]);
    const slight = fitOrdinal(mean, variance, [[0, 1, 0.75]]);
    const tie = fitOrdinal(mean, variance, [[0, 1, 0.5]]);
    for (const fit of [decisive, slight, tie]) expect(fit.converged).toBe(true);
    expect(decisive.theta[0] - decisive.theta[1]).toBeGreaterThan(slight.theta[0] - slight.theta[1]);
    expect(slight.theta[0] - slight.theta[1]).toBeGreaterThan(tie.theta[0] - tie.theta[1]);
    expect(tie.theta[0]).toBeCloseTo(tie.theta[1], 6);
  });

  it('uses the oracle thresholds in their stated order', () => {
    const t = DEFAULT_THRESHOLDS;
    expect(t.tie).toBeGreaterThan(0);
    expect(t.strong).toBeGreaterThan(t.tie);
  });
});

describe('offline A/B comparison experiments', () => {
  const full = process.env.BENCH === 'full';
  const scenarios: Array<{ name: string; options: ExperimentOptions }> = [
    {
      name: 'standard tiers, calibrated response categories',
      options: { n: full ? 120 : 64, seeds: full ? 12 : 3, comparisonsPerTrack: full ? 4 : 2, tierNoise: 0.5 },
    },
    {
      name: 'incorrect intuitive tiers; hidden top-5 favorite',
      options: { n: full ? 120 : 64, seeds: full ? 12 : 3, comparisonsPerTrack: full ? 4 : 2, tierNoise: 1.1, misTierTop: true },
    },
    {
      name: 'wording threshold mismatch',
      options: {
        n: full ? 120 : 64, seeds: full ? 12 : 3, comparisonsPerTrack: full ? 4 : 2,
        tierNoise: 0.5, responseThresholds: { tie: 0.2, strong: 2.2 },
      },
    },
  ];

  for (const { name, options } of scenarios) {
    it(name, () => {
      const models = summarize(Array.from({ length: options.seeds }, (_, i) => modelTrial(options, i + 1)));
      const pairings = summarize(Array.from({ length: options.seeds }, (_, i) => pairingTrial(options, i + 1)));
      console.log(`\n### ${name}\n${options.n} songs, ${options.seeds} seeds, ${options.comparisonsPerTrack} comparisons per track\n\nModel (same comparisons):\n${formatResults(models)}\n\nPairing (same BT model):\n${formatResults(pairings)}`);
      for (const row of [...Object.values(models), ...Object.values(pairings)]) {
        for (const metric of ['pairwise', 'top10', 'top30'] as const) {
          expect(Number.isFinite(row.mean[metric])).toBe(true);
          expect(row.mean[metric]).toBeGreaterThanOrEqual(0);
          expect(row.mean[metric]).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
