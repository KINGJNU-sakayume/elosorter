/**
 * EXPERIMENT ONLY: 5-category cumulative-logit likelihood, not used by the app.
 *
 * P(Y <= k | d) = logistic(cutpoint[k] - d), d = thetaA - thetaB
 * Y = 0,1,2,3,4 corresponds to saved scores 0,.25,.5,.75,1.
 * Thresholds are fixed in the experiment, not estimated from user data.
 */
import { sigmoid } from '../src/core/rating/scale';
import type { IndexedMatch } from '../src/core/rating/bradleyTerry';

export interface OrdinalFit {
  theta: Float64Array;
  variance: Float64Array;
  converged: boolean;
  sweeps: number;
}

export interface OrdinalThresholds { tie: number; strong: number }
export const DEFAULT_THRESHOLDS: OrdinalThresholds = { tie: 0.35, strong: 1.5 };

/** Derivatives of negative log p(category | thetaA - thetaB). */
export function ordinalLossDerivatives(
  difference: number,
  score: number,
  { tie, strong }: OrdinalThresholds = DEFAULT_THRESHOLDS,
): { loss: number; gradient: number; curvature: number } {
  if (!(tie > 0 && strong > tie)) throw new Error('Expected 0 < tie < strong');
  const category = Math.round(score * 4);
  if (category < 0 || category > 4 || Math.abs(category / 4 - score) > 1e-8) {
    throw new Error('Only five saved choice scores are supported');
  }
  const cut = [-strong, -tie, tie, strong];
  const lo = category === 0 ? 0 : sigmoid(cut[category - 1] - difference);
  const hi = category === 4 ? 1 : sigmoid(cut[category] - difference);
  const loDensity = lo * (1 - lo);
  const hiDensity = hi * (1 - hi);
  const probability = Math.max(1e-15, hi - lo);
  const first = loDensity - hiDensity;
  const second = hiDensity * (1 - 2 * hi) - loDensity * (1 - 2 * lo);
  return {
    loss: -Math.log(probability),
    gradient: -first / probability,
    curvature: Math.max(0, (first / probability) ** 2 - second / probability),
  };
}

/**
 * MAP via cyclic coordinate Newton, with step clipping for stability.
 * Diagonal Hessian inverse is a local approximation, as in the existing BT engine.
 * Only for controlled offline simulation: do not use as a drop-in production fitter.
 */
export function fitOrdinal(
  priorMean: ArrayLike<number>,
  priorVariance: ArrayLike<number>,
  matches: ReadonlyArray<IndexedMatch>,
  init?: ArrayLike<number>,
  thresholds: OrdinalThresholds = DEFAULT_THRESHOLDS,
): OrdinalFit {
  const n = priorMean.length;
  const theta = Float64Array.from({ length: n }, (_, i) => init?.[i] ?? priorMean[i]);
  const precision = Float64Array.from({ length: n }, (_, i) => 1 / priorVariance[i]);
  const adjacent: { opponent: number; score: number; flipped: boolean }[][] =
    Array.from({ length: n }, () => []);
  for (const [a, b, score] of matches) {
    adjacent[a].push({ opponent: b, score, flipped: false });
    adjacent[b].push({ opponent: a, score: 1 - score, flipped: false });
  }
  let converged = false;
  let sweeps = 0;
  for (; sweeps < 120; sweeps++) {
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      if (!adjacent[i].length) { theta[i] = priorMean[i]; continue; }
      let gradient = (theta[i] - priorMean[i]) * precision[i];
      let curvature = precision[i];
      for (const m of adjacent[i]) {
        const d = ordinalLossDerivatives(theta[i] - theta[m.opponent], m.score, thresholds);
        gradient += d.gradient;
        curvature += d.curvature;
      }
      const step = Math.max(-0.8, Math.min(0.8, gradient / curvature));
      theta[i] -= step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-6) { converged = true; sweeps++; break; }
  }
  const variance = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let curvature = precision[i];
    for (const m of adjacent[i]) {
      curvature += ordinalLossDerivatives(theta[i] - theta[m.opponent], m.score, thresholds).curvature;
    }
    variance[i] = 1 / curvature;
  }
  return { theta, variance, converged, sweeps };
}
