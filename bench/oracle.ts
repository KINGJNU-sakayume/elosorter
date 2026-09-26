// 가상의 사용자: 곡마다 숨은 "실제 취향" θ가 있고,
// 티어는 잡음 섞인 직감으로 고르며, 비교에는 Bradley–Terry 확률로 답한다.

import type { Tier } from '../src/core/types';
import { ELO_PER_THETA, sigmoid } from '../src/core/rating/scale';
import type { Rng } from '../src/core/rating/rng';

export interface LibraryOptions {
  /** 실제 취향 분포의 표준편차 (Elo) */
  spreadElo?: number;
  /** 직감 분류 잡음 (모집단 표준편차 단위) */
  tierNoise?: number;
  /** 사용자가 실제로 쓰는 티어 비율 */
  shares?: Record<Tier, number>;
}

export interface Library {
  ids: string[];
  /** 실제 취향 (θ, 자연로그 오즈 단위) */
  truth: Map<string, number>;
  tiers: Map<string, Tier>;
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function makeLibrary(n: number, rng: Rng, opts: LibraryOptions = {}): Library {
  const { spreadElo = 200, tierNoise = 0.5, shares = { 1: 0.1, 2: 0.4, 3: 0.5 } } = opts;
  const ids = Array.from({ length: n }, (_, i) => `s${i}`);
  const sd = spreadElo / ELO_PER_THETA;
  const truth = new Map(ids.map(id => [id, sd * gaussian(rng)]));
  const perceived = ids
    .map(id => ({ id, y: truth.get(id)! / sd + tierNoise * gaussian(rng) }))
    .sort((a, b) => b.y - a.y);
  const n1 = Math.round(n * shares[1]);
  const n2 = Math.round(n * shares[2]);
  const tiers = new Map<string, Tier>(
    perceived.map((p, rank) => [p.id, rank < n1 ? 1 : rank < n1 + n2 ? 2 : 3]),
  );
  return { ids, truth, tiers };
}

/** 응답 단계: 앱 v1의 빠른(3단계)/세밀(5단계) 모드, 개선안의 5단계 */
export type Scale = readonly number[];
export const BINARY: Scale = [1, 0];
export const V1_FAST: Scale = [1, 0.5, 0];
export const V1_FINE: Scale = [1, 0.7, 0.5, 0.3, 0];
export const V2_SCALE: Scale = [1, 0.75, 0.5, 0.25, 0];

/**
 * 잠재 효용 차 u = θa − θb + Logistic 잡음 (→ P(a 선호) = σ(θa − θb)).
 * |u|가 작으면 "비슷", 크면 "확실히"로 답한다.
 */
export function answer(lib: Library, a: string, b: string, scale: Scale, rng: Rng): number {
  const r = Math.min(Math.max(rng(), 1e-12), 1 - 1e-12);
  const u = lib.truth.get(a)! - lib.truth.get(b)! + Math.log(r / (1 - r));
  const tie = 0.35;
  const strong = 1.5;
  if (scale.length === 2) return u > 0 ? 1 : 0;
  if (scale.length === 3) return Math.abs(u) < tie ? scale[1] : u > 0 ? scale[0] : scale[2];
  if (Math.abs(u) < tie) return scale[2];
  if (u > 0) return u >= strong ? scale[0] : scale[1];
  return -u >= strong ? scale[4] : scale[3];
}

/** 참고: 두 곡의 실제 선호 확률 */
export function trueWinProbability(lib: Library, a: string, b: string): number {
  return sigmoid(lib.truth.get(a)! - lib.truth.get(b)!);
}

export interface Accuracy {
  /** 순서가 맞는 쌍의 비율 (동점은 0.5) */
  pairwise: number;
  /** 실제 상위 10곡 중 추정 상위 10곡에 든 비율 */
  top10: number;
  /** 스피어만 순위상관 */
  spearman: number;
}

export function measure(lib: Library, estimate: Map<string, number>): Accuracy {
  const ids = lib.ids;
  const n = ids.length;
  let good = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    const ti = lib.truth.get(ids[i])!;
    const ei = estimate.get(ids[i])!;
    for (let j = i + 1; j < n; j++) {
      const dt = ti - lib.truth.get(ids[j])!;
      const de = ei - estimate.get(ids[j])!;
      pairs++;
      if (de === 0) good += 0.5;
      else if (dt * de > 0) good += 1;
    }
  }
  const rank = (score: (id: string) => number) => {
    const sorted = [...ids].sort((x, y) => score(y) - score(x));
    return new Map(sorted.map((id, r) => [id, r]));
  };
  const trueRank = rank(id => lib.truth.get(id)!);
  const estRank = rank(id => estimate.get(id)!);
  let d2 = 0;
  for (const id of ids) d2 += (trueRank.get(id)! - estRank.get(id)!) ** 2;
  const k = Math.min(10, n);
  let hit = 0;
  for (const id of ids) if (trueRank.get(id)! < k && estRank.get(id)! < k) hit++;
  return {
    pairwise: good / pairs,
    top10: hit / k,
    spearman: 1 - (6 * d2) / (n * (n * n - 1)),
  };
}
