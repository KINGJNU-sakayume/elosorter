// v1 알고리즘(src/utils/elo.ts, 커밋 8720872)을 시드 기반 난수로 그대로 옮긴 것. 비교 기준선용.

import type { Tier } from '../src/core/types';
import { probit } from '../src/core/rating/normal';
import type { Rng } from '../src/core/rating/rng';

const ELO_FLOOR = 800;
const TIER_PMID: Record<Tier, number> = { 1: 0.95, 2: 0.7, 3: 0.25 };
const SIGMA = 200;
const BOUNDARIES = [1700, 1500];
export const FINE_MODE_THRESHOLD = 150;

export interface LegacyTrack {
  id: string;
  tier: Tier;
  rating: number;
  comparisons: number;
}

export function initRating(tier: Tier): number {
  return Math.round(1500 + SIGMA * probit(TIER_PMID[tier]));
}

export function getK(t: LegacyTrack, boundaryBoost: boolean): number {
  let k = t.comparisons <= 15 ? 48 : t.comparisons <= 40 ? 24 : 12;
  if (boundaryBoost) {
    for (const b of BOUNDARIES) {
      if (Math.abs(t.rating - b) < 100) { k = 60; break; }
    }
  }
  return k;
}

export function computeElo(a: LegacyTrack, b: LegacyTrack, scoreA: number, boundaryBoost: boolean) {
  const E = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
  const newA = Math.max(ELO_FLOOR, Math.round(a.rating + getK(a, boundaryBoost) * (scoreA - E)));
  const newB = Math.max(ELO_FLOOR, Math.round(b.rating + getK(b, boundaryBoost) * ((1 - scoreA) - (1 - E))));
  return { newA, newB, avgDelta: (Math.abs(newA - a.rating) + Math.abs(newB - b.rating)) / 2 };
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function getNextPair(
  pool: readonly { id: string; tier: Tier; rating: number; comparisons: number }[],
  seenPairs: Set<string>,
  lastPairKey: string,
  rng: Rng,
): [string, string] | null {
  if (pool.length < 2) return null;
  const minComp = Math.min(...pool.map(t => t.comparisons));
  const least = pool.filter(t => t.comparisons === minComp);
  const A = least[Math.floor(rng() * least.length)];

  let candidates = pool.filter(t => t.id !== A.id && t.tier === A.tier);
  if (!candidates.length) candidates = pool.filter(t => t.id !== A.id);
  const unseen = candidates.filter(t => !seenPairs.has(pairKey(A.id, t.id)));
  const nonConsec = candidates.filter(t => pairKey(A.id, t.id) !== lastPairKey);
  const base = unseen.length ? unseen : nonConsec.length ? nonConsec : candidates;
  const nearest = [...base]
    .sort((x, y) => Math.abs(x.rating - A.rating) - Math.abs(y.rating - A.rating))
    .slice(0, 5);
  const B = nearest[Math.floor(rng() * nearest.length)];
  return [A.id, B.id];
}

/** v1의 seenPairs 상한 (1000개, 오래된 것부터 삭제) */
export function rememberPair(seen: Set<string>, key: string): void {
  seen.add(key);
  if (seen.size > 1000) seen.delete(seen.values().next().value!);
}
