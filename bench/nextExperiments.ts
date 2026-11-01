/**
 * Offline A/B experiments, intentionally disconnected from production ranking.
 *
 * Two axes are isolated:
 *  1) same pair schedule and same answers, comparing fractional-win BT vs ordinal logit;
 *  2) same BT model, comparing all/top/mixed pair-selection schedules.
 *
 * Random answers are keyed by unordered pair and repeat index; this reduces the
 * confounding from different schedules consuming a shared RNG in different orders.
 */
import { pickNextPair, recomputeRatings } from '../src/core/rating/engine';
import { pairKey, type Focus } from '../src/core/rating/pairing';
import { tierPriors } from '../src/core/rating/priors';
import { createRng } from '../src/core/rating/rng';
import { eloSdToTheta, eloToTheta } from '../src/core/rating/scale';
import type { Match, Tier, Track } from '../src/core/types';
import { makeLibrary, measure, type Library } from './oracle';
import { DEFAULT_THRESHOLDS, fitOrdinal, type OrdinalThresholds } from './ordinalModel';

export type ChoiceStrategy = 'all' | 'top' | 'top80-explore20';
export type FitStrategy = 'fractional-BT' | 'five-category-ordinal';
export type Metric = 'pairwise' | 'top10' | 'top30';
export type Result = Record<Metric, number>;
export interface ExperimentOptions {
  n: number;
  seeds: number;
  comparisonsPerTrack: number;
  tierNoise: number;
  /** Force one true Top-5 song into Tier 3 to probe discovery failures. */
  misTierTop?: boolean;
  /** Simulated user's preference-wording thresholds. */
  responseThresholds?: OrdinalThresholds;
}
export interface OutcomeRow {
  name: string;
  mean: Result;
  standardError: Result;
}

const allMetrics: readonly Metric[] = ['pairwise', 'top10', 'top30'];

function toTrack(id: string, tier: Tier): Track {
  return {
    id, name: id, artists: [], album: '', image: '', uri: '', addedAt: null,
    tier, rating: 1500, comparisons: 0, isNew: false,
  };
}

function buildLibrary(options: ExperimentOptions, seed: number): Library {
  const original = makeLibrary(options.n, createRng(seed * 7919), { tierNoise: options.tierNoise });
  if (!options.misTierTop) return original;
  const tiers = new Map(original.tiers);
  const sorted = [...original.ids].sort((a, b) => original.truth.get(b)! - original.truth.get(a)!);
  // One genuine favorite misclassified as 'ordinary', and a mediocre song as 'favorite'.
  // Keep tier counts unchanged to isolate the effect of misclassification.
  const favorite = sorted.find(id => tiers.get(id) === 1)!;
  const ordinary = [...sorted].reverse().find(id => tiers.get(id) === 3)!;
  tiers.set(favorite, 3);
  tiers.set(ordinary, 1);
  return { ...original, tiers };
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Each pair has a reproducible noise stream independent of the pair scheduler. */
function answerer(lib: Library, seed: number, thresholds: OrdinalThresholds) {
  const seen = new Map<string, number>();
  return (a: string, b: string): number => {
    const key = pairKey(a, b);
    const attempt = seen.get(key) ?? 0;
    seen.set(key, attempt + 1);
    const x = a < b ? a : b;
    const y = a < b ? b : a;
    const rng = createRng((seed * 104729 ^ hashKey(key) ^ Math.imul(attempt + 1, 2654435761)) >>> 0);
    const r = Math.max(1e-12, Math.min(1 - 1e-12, rng()));
    const utility = lib.truth.get(x)! - lib.truth.get(y)! + Math.log(r / (1 - r));
    const abs = Math.abs(utility);
    const score = abs < thresholds.tie ? 0.5 :
      abs >= thresholds.strong ? (utility > 0 ? 1 : 0) :
      (utility > 0 ? 0.75 : 0.25);
    return a === x ? score : 1 - score;
  };
}

function topRecall(lib: Library, rating: Map<string, number>, k: number): number {
  const truth = [...lib.ids].sort((a, b) => lib.truth.get(b)! - lib.truth.get(a)!).slice(0, k);
  const estimate = new Set([...lib.ids].sort((a, b) => rating.get(b)! - rating.get(a)!).slice(0, k));
  return truth.filter(id => estimate.has(id)).length / k;
}

function result(lib: Library, rating: Map<string, number>): Result {
  const accuracy = measure(lib, rating);
  return { pairwise: accuracy.pairwise, top10: accuracy.top10, top30: topRecall(lib, rating, Math.min(30, lib.ids.length)) };
}

function btEstimate(tracks: Track[]): Map<string, number> {
  return new Map(tracks.map(t => [t.id, t.rating]));
}

function ordinalPriors(lib: Library) {
  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const tier of lib.tiers.values()) counts[tier]++;
  const tiers = tierPriors(counts);
  return {
    mean: lib.ids.map(id => eloToTheta(tiers[lib.tiers.get(id)!].mean)),
    variance: lib.ids.map(id => eloSdToTheta(tiers[lib.tiers.get(id)!].sd) ** 2),
  };
}

export function modelTrial(options: ExperimentOptions, seed: number): Record<FitStrategy, Result> {
  const lib = buildLibrary(options, seed);
  const thresholds = options.responseThresholds ?? DEFAULT_THRESHOLDS;
  const reply = answerer(lib, seed, thresholds);
  const random = createRng(seed * 104729);
  const matches: Match[] = [];
  let tracks = recomputeRatings(lib.ids.map(id => toTrack(id, lib.tiers.get(id)!)), []);
  const priors = ordinalPriors(lib);
  const index = new Map(lib.ids.map((id, i) => [id, i]));
  let theta = Float64Array.from(priors.mean);
  const amount = Math.round(options.n * options.comparisonsPerTrack);
  for (let count = 0; count < amount; count++) {
    const pair = pickNextPair(tracks, matches, { rng: random, focus: 'all' });
    if (!pair) throw new Error('No pair found');
    const score = reply(...pair);
    matches.push([pair[0], pair[1], score]);
    tracks = recomputeRatings(tracks, matches);
    const indexed = matches.map(([a, b, s]) => [index.get(a)!, index.get(b)!, s] as const);
    const fit = fitOrdinal(priors.mean, priors.variance, indexed, theta);
    if (!fit.converged) throw new Error('Ordinal MAP did not converge');
    theta = fit.theta;
  }
  return {
    'fractional-BT': result(lib, btEstimate(tracks)),
    'five-category-ordinal': result(lib, new Map(lib.ids.map((id, i) => [id, theta[i]]))),
  };
}

export function pairingTrial(options: ExperimentOptions, seed: number): Record<ChoiceStrategy, Result> {
  const lib = buildLibrary(options, seed);
  const thresholds = options.responseThresholds ?? DEFAULT_THRESHOLDS;
  const strategies: ChoiceStrategy[] = ['all', 'top', 'top80-explore20'];
  const outcomes = {} as Record<ChoiceStrategy, Result>;
  for (const strategy of strategies) {
    const reply = answerer(lib, seed, thresholds);
    const random = createRng(seed * 104729);
    const matches: Match[] = [];
    let tracks = recomputeRatings(lib.ids.map(id => toTrack(id, lib.tiers.get(id)!)), []);
    let previous: [string, string] | null = null;
    const amount = Math.round(options.n * options.comparisonsPerTrack);
    for (let count = 0; count < amount; count++) {
      const focus: Focus = strategy === 'all' ? 'all'
        : strategy === 'top' ? 'top'
        : random() < 0.20 ? 'all' : 'top';
      const pair = pickNextPair(tracks, matches, { rng: random, focus, avoid: previous ?? [] });
      if (!pair) throw new Error('No pair found');
      matches.push([pair[0], pair[1], reply(...pair)]);
      tracks = recomputeRatings(tracks, matches);
      previous = pair;
    }
    outcomes[strategy] = result(lib, btEstimate(tracks));
  }
  return outcomes;
}

export function summarize<T extends string>(rows: Record<T, Result>[]): Record<T, OutcomeRow> {
  if (!rows.length) throw new Error('No trials');
  const out = {} as Record<T, OutcomeRow>;
  for (const name of Object.keys(rows[0]) as T[]) {
    const mean = {} as Result;
    const standardError = {} as Result;
    for (const m of allMetrics) {
      const values = rows.map(r => r[name][m]);
      const avg = values.reduce((s, x) => s + x, 0) / values.length;
      mean[m] = avg;
      standardError[m] = values.length > 1 ?
        Math.sqrt(values.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (values.length * (values.length - 1))) : 0;
    }
    out[name] = { name, mean, standardError };
  }
  return out;
}

export function formatResults<T extends string>(rows: Record<T, OutcomeRow>): string {
  const fmt = (v: number) => (100 * v).toFixed(1);
  return [
    '| Model/strategy | Pairwise | Top 10 | Top 30 |',
    '|---|---:|---:|---:|',
    ...Object.values<OutcomeRow>(rows).map(r =>
      `| ${r.name} | ${allMetrics.map(m => `${fmt(r.mean[m])}% ± ${fmt(r.standardError[m])}pp`).join(' | ')} |`),
  ].join('\n');
}
