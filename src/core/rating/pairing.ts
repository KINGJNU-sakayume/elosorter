// 다음 비교 쌍 선택 (능동 학습).
//
// A: 티어 사전분포 대비 불확실성(σ / σ_tier)이 가장 큰 곡들 중 무작위.
//    비교가 적은 곡, 새로 들어온 곡이 자연스럽게 먼저 나온다.
// B: A와 레이팅이 가까운 이웃 중 "결과를 가장 예측하기 어려운" 곡 (p(1−p) 최대).
//    티어 경계와 무관하게 레이팅이 겹치면 다른 티어 곡과도 비교한다.
//    (v1은 같은 티어끼리만 비교해서 티어를 넘나드는 순서는 검증되지 않았다.)
//
// bench/ 시뮬레이션에서 B 선택 규칙(최근접 5곡 무작위, p(1−p), 분산 감소량 등)은
// 전체 정확도 차이가 오차 범위(±0.4%p) 안이었다. 가장 설명하기 쉬운 p(1−p)를 쓴다.

import { eloSdToTheta, eloToTheta, sigmoid } from './scale';
import { pickRandom, type Rng } from './rng';

export interface PairCandidate {
  id: string;
  /** 사후 평균 (Elo) */
  rating: number;
  /** 사후 표준편차 (Elo) */
  sigma: number;
  /** 기준 불확실성 = 소속 티어 사전분포의 표준편차 (Elo) */
  baseSigma: number;
}

/** 'top'은 현재 상위권(상위 15%, 최소 10곡)만 A 후보로 삼아 상위 순위를 먼저 다듬는다 */
export type Focus = 'all' | 'top';

export interface PairOptions {
  rng: Rng;
  /** 이미 비교한 쌍 (pairKey) — 가능하면 피한다 */
  seen?: ReadonlySet<string>;
  /** 직전 쌍의 곡 등, 가능하면 피할 곡 */
  avoid?: ReadonlySet<string>;
  focus?: Focus;
}

const NEIGHBORS = 24;
const TOP_CHOICES = 3;
const A_BAND = 0.02;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function focusPoolSize(n: number): number {
  return Math.min(n, Math.max(10, Math.ceil(n * 0.15)));
}

function preferNot<T extends { id: string }>(items: T[], avoid?: ReadonlySet<string>): T[] {
  if (!avoid?.size) return items;
  const kept = items.filter(c => !avoid.has(c.id));
  return kept.length ? kept : items;
}

/**
 * 결과 불확실성 p(1−p). p는 두 곡의 σ를 반영한 예측 승률 (Glicko의 g 보정):
 *   p = σ(g · (θA − θB)),  g = 1 / √(1 + 3(vA + vB)/π²)
 * 레이팅이 비슷할수록, 불확실할수록 0.25에 가까워진다.
 */
function outcomeUncertainty(a: PairCandidate, b: PairCandidate): number {
  const v = eloSdToTheta(a.sigma) ** 2 + eloSdToTheta(b.sigma) ** 2;
  const g = 1 / Math.sqrt(1 + (3 * v) / (Math.PI * Math.PI));
  const p = sigmoid(g * (eloToTheta(a.rating) - eloToTheta(b.rating)));
  return p * (1 - p);
}

export function selectPair(
  candidates: readonly PairCandidate[],
  { rng, seen, avoid, focus = 'all' }: PairOptions,
): [string, string] | null {
  if (candidates.length < 2) return null;

  // 동점 곡들의 순서가 매번 같지 않도록 섞은 뒤 안정 정렬 (레이팅 내림차순)
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const byRating = shuffled.sort((x, y) => y.rating - x.rating);

  const pool = focus === 'top' ? byRating.slice(0, focusPoolSize(byRating.length)) : byRating;
  const aPool = preferNot(pool, avoid);
  const uncertainty = (c: PairCandidate) => c.sigma / c.baseSigma;
  let maxU = -Infinity;
  for (const c of aPool) maxU = Math.max(maxU, uncertainty(c));
  const a = pickRandom(aPool.filter(c => uncertainty(c) >= maxU - A_BAND), rng);

  // A 주변에서 레이팅이 가까운 순서대로 이웃 수집
  const pos = byRating.indexOf(a);
  const neighbors: PairCandidate[] = [];
  let up = pos - 1;
  let down = pos + 1;
  while (neighbors.length < NEIGHBORS && (up >= 0 || down < byRating.length)) {
    const dUp = up >= 0 ? byRating[up].rating - a.rating : Infinity;
    const dDown = down < byRating.length ? a.rating - byRating[down].rating : Infinity;
    neighbors.push(dUp <= dDown ? byRating[up--] : byRating[down++]);
  }

  // 이미 비교한 쌍은 다른 후보가 없을 때만 다시 낸다
  const opponents = preferNot(neighbors, avoid);
  const fresh = seen?.size ? opponents.filter(c => !seen.has(pairKey(a.id, c.id))) : opponents;
  const best = (fresh.length ? fresh : opponents)
    .map(c => ({ c, gain: outcomeUncertainty(a, c) }))
    .sort((x, y) => y.gain - x.gain)
    .slice(0, TOP_CHOICES);
  const b = pickRandom(best, rng).c;

  // 좌우 위치 편향을 없애려고 배치를 무작위로
  return rng() < 0.5 ? [a.id, b.id] : [b.id, a.id];
}
