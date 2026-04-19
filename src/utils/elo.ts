import { probit } from './probit';
import type { Track } from './types';

const ELO_FLOOR = 800;
export const TIER_PMID: Record<number, number> = { 1: 0.95, 2: 0.70, 3: 0.25 };
const SIGMA = 200;
const BOUNDARIES = [1700, 1500];
/**
 * isNew 플래그가 해제되는 비교 횟수 임계치.
 * - getNextPair: isNew 곡 중 comparisons < NEW_TRACK_THRESHOLD 인 것만 우선 페어링
 * - CHOOSE_DONE reducer: 비교 후 comparisons >= NEW_TRACK_THRESHOLD 이면 isNew 해제
 * 두 조건은 반드시 대칭이어야 함.
 */
export const NEW_TRACK_THRESHOLD = 8;

export function initRating(tier: 1 | 2 | 3): number {
  return Math.round(1500 + SIGMA * probit(TIER_PMID[tier]));
}

export function getK(t: Track): number {
  let k = t.comparisons <= 15 ? 48 : t.comparisons <= 40 ? 24 : 12;
  for (const b of BOUNDARIES) {
    if (Math.abs(t.rating - b) < 100) { k = 60; break; }
  }
  return k;
}

export function computeElo(a: Track, b: Track, scoreA: number) {
  const E = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
  const newA = Math.max(ELO_FLOOR, Math.round(a.rating + getK(a) * (scoreA - E)));
  const newB = Math.max(ELO_FLOOR, Math.round(b.rating + getK(b) * ((1 - scoreA) - (1 - E))));
  const avgDelta = (Math.abs(newA - a.rating) + Math.abs(newB - b.rating)) / 2;
  return { newRatingA: newA, newRatingB: newB, avgDelta };
}

export function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|');
}

export function getNextPair(
  tracks: Track[],
  seenPairs: Set<string>,
  lastPairKey: string
): [Track, Track] | null {
  const pool = tracks.filter(t => t.tier !== null);
  if (pool.length < 2) return null;

  const newPool = pool.filter(t => t.isNew && t.comparisons < NEW_TRACK_THRESHOLD);
  // 둘 다 같은 원칙: "비교 횟수가 최소인 곡들 중 균등 랜덤 선택"
  // sort 기반 셔플은 V8 등에서 편향되므로 명시적 min-group 샘플링 사용
  const sourcePool = newPool.length > 0 ? newPool : pool;
  const minComp = Math.min(...sourcePool.map(t => t.comparisons));
  const leastCompared = sourcePool.filter(t => t.comparisons === minComp);
  const A: Track = leastCompared[Math.floor(Math.random() * leastCompared.length)];

  let candidates = pool.filter(t => t.id !== A.id && t.tier === A.tier);
  if (!candidates.length) candidates = pool.filter(t => t.id !== A.id);

  const unseen = candidates.filter(t => !seenPairs.has(pairKey(A.id, t.id)));
  const nonConsec = candidates.filter(t => pairKey(A.id, t.id) !== lastPairKey);
  const base = unseen.length > 0 ? unseen : nonConsec.length > 0 ? nonConsec : candidates;

  const sorted = [...base]
    .sort((a, b) => Math.abs(a.rating - A.rating) - Math.abs(b.rating - A.rating))
    .slice(0, 5);
  const B = sorted[Math.floor(Math.random() * sorted.length)];
  return [A, B];
}

export function computeRSI(rsiDeltas: number[]): number | null {
  if (rsiDeltas.length < 5) return null;
  const recent = rsiDeltas.slice(-20);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}
