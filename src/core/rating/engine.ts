// Track[] + Match[] ↔ 수치 모델을 잇는 계층. 리듀서와 화면은 이 파일의 함수만 쓴다.

import type { Match, Tier, Track } from '../types';
import { fitBradleyTerry, type FitResult, type IndexedMatch } from './bradleyTerry';
import { expectedPairAccuracy } from './metrics';
import { pairKey, selectPair, type Focus, type PairCandidate } from './pairing';
import { tierPriors, type Prior, type TierCounts } from './priors';
import type { Rng } from './rng';
import { ELO_BASE, eloSdToTheta, eloToTheta, thetaSdToElo, thetaToElo } from './scale';

type RankedTrack = Track & { tier: Tier };

export function countTiers(tracks: readonly Track[]): TierCounts {
  const counts: TierCounts = { 1: 0, 2: 0, 3: 0 };
  for (const t of tracks) if (t.tier !== null) counts[t.tier]++;
  return counts;
}

/** 곡의 사전분포: 티어 사전분포 + (있다면) 곡별 오프셋 */
function priorFor(track: RankedTrack, priors: Record<Tier, Prior>): Prior {
  const base = priors[track.tier];
  return track.prior ? { mean: base.mean + track.prior.offset, sd: track.prior.sd } : base;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

interface Model {
  priors: Record<Tier, Prior>;
  index: Map<string, number>;
  mean: Float64Array;
  variance: Float64Array;
}

function buildModel(tracks: readonly Track[]): Model {
  const priors = tierPriors(countTiers(tracks));
  const ranked = tracks.filter((t): t is RankedTrack => t.tier !== null);
  const mean = new Float64Array(ranked.length);
  const variance = new Float64Array(ranked.length);
  ranked.forEach((t, i) => {
    const p = priorFor(t, priors);
    mean[i] = eloToTheta(p.mean);
    variance[i] = eloSdToTheta(p.sd) ** 2;
  });
  return { priors, index: new Map(ranked.map((t, i) => [t.id, i])), mean, variance };
}

function indexMatches(matches: readonly Match[], index: Map<string, number>): IndexedMatch[] {
  const out: IndexedMatch[] = [];
  for (const [a, b, s] of matches) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    out.push([ia, ib, s]);
  }
  return out;
}

function withEstimate(t: Track, i: number | undefined, fit: FitResult): Track {
  if (i === undefined) {
    // 미분류 곡은 순위에서 빠지므로 추정치를 지운다
    if (t.rating === ELO_BASE && t.sigma === undefined) return t;
    const { sigma, ...rest } = t;
    return { ...rest, rating: ELO_BASE };
  }
  const rating = round2(thetaToElo(fit.theta[i]));
  const sigma = round2(thetaSdToElo(Math.sqrt(fit.variance[i])));
  return rating === t.rating && sigma === t.sigma ? t : { ...t, rating, sigma };
}

/**
 * 티어 사전분포와 전체 비교 기록으로 모든 곡의 레이팅(사후 평균)과 σ를 다시 계산한다.
 * 값이 바뀌지 않은 곡은 객체를 그대로 재사용하고, 아무것도 안 바뀌면 입력 배열을 그대로 돌려준다.
 */
export function recomputeRatings(tracks: readonly Track[], matches: readonly Match[]): Track[] {
  const { index, mean, variance } = buildModel(tracks);
  // 직전 추정치에서 출발(웜 스타트)하면 비교 1건 추가 후 수렴이 빠르다
  const init = Float64Array.from(mean);
  for (const t of tracks) {
    const i = index.get(t.id);
    if (i !== undefined && t.sigma !== undefined) init[i] = eloToTheta(t.rating);
  }
  const fit = fitBradleyTerry(mean, variance, indexMatches(matches, index), init);

  let changed = false;
  const next = tracks.map(t => {
    const updated = withEstimate(t, index.get(t.id), fit);
    if (updated !== t) changed = true;
    return updated;
  });
  return changed ? next : (tracks as Track[]);
}

/**
 * 비교 기록이 keep건을 넘으면 오래된 기록을 곡별 사전분포로 접어 넣는다 (가정 밀도 필터링).
 * 오래된 기록만으로 맞춘 사후분포를 새 사전분포로 삼으므로, 최근 기록과 합친 결과는 전체 적합과 거의 같다.
 */
export function compactMatches(
  tracks: readonly Track[],
  matches: readonly Match[],
  keep: number,
): { tracks: Track[]; matches: Match[] } {
  if (matches.length <= keep) return { tracks: tracks as Track[], matches: matches as Match[] };
  const old = matches.slice(0, matches.length - keep);
  const recent = matches.slice(matches.length - keep);
  const { priors, index, mean, variance } = buildModel(tracks);
  const fit = fitBradleyTerry(mean, variance, indexMatches(old, index));
  const involved = new Set(old.flatMap(([a, b]) => [a, b]));

  const folded = tracks.map(t => {
    const i = index.get(t.id);
    if (i === undefined || t.tier === null || !involved.has(t.id)) return t;
    const offset = thetaToElo(fit.theta[i]) - priors[t.tier].mean;
    const sd = thetaSdToElo(Math.sqrt(fit.variance[i]));
    return { ...t, prior: { offset: round2(offset), sd: round2(sd) } };
  });
  return { tracks: recomputeRatings(folded, recent), matches: recent };
}

export interface NextPairOptions {
  rng: Rng;
  focus?: Focus;
  /** 가능하면 피할 곡 (직전 쌍) */
  avoid?: readonly string[];
  /** 비교 기록 외에 이미 본 것으로 칠 쌍 키 (v1 seenPairs, 건너뛴 쌍) */
  extraSeen?: readonly string[];
}

export function pickNextPair(
  tracks: readonly Track[],
  matches: readonly Match[],
  { rng, focus = 'all', avoid = [], extraSeen = [] }: NextPairOptions,
): [string, string] | null {
  const priors = tierPriors(countTiers(tracks));
  const candidates: PairCandidate[] = [];
  for (const t of tracks) {
    if (t.tier === null) continue;
    candidates.push({
      id: t.id,
      rating: t.rating,
      sigma: t.sigma ?? priorFor(t as RankedTrack, priors).sd,
      baseSigma: priors[t.tier].sd,
    });
  }
  const seen = new Set(extraSeen);
  for (const [a, b] of matches) seen.add(pairKey(a, b));
  return selectPair(candidates, { rng, focus, seen, avoid: new Set(avoid) });
}

/** 분류된 곡을 레이팅 내림차순으로. 동점이면 더 확실한(σ가 작은) 곡 먼저 */
export function rankTracks(tracks: readonly Track[]): Track[] {
  return tracks
    .filter(t => t.tier !== null)
    .sort((a, b) =>
      b.rating - a.rating ||
      (a.sigma ?? Infinity) - (b.sigma ?? Infinity) ||
      a.name.localeCompare(b.name));
}

/** 현재 순위의 예상 정확도 (0.5~1). 분류된 곡이 2곡 미만이면 null */
export function rankingAccuracy(tracks: readonly Track[]): number | null {
  return expectedPairAccuracy(tracks.filter(t => t.tier !== null));
}
