// 티어 분류 → 레이팅 사전분포.
//
// 모델: 곡의 실제 취향 x ~ N(0, 1) (모집단 표준편차 단위).
// 사용자는 x에 잡음 ε ~ N(0, τ²)이 섞인 직감 y = x + ε 로 티어를 고르고,
// 티어 비율대로 y의 분위 구간을 나눈다 (Tier 1 = 상위 구간).
// 그러면 티어가 주어졌을 때 x의 조건부 평균·분산은
//   E[x | tier] = m' / √(1+τ²),   Var[x | tier] = (τ² + v') / (1+τ²)
// 이고, m'·v'는 해당 분위 구간으로 잘린 표준정규분포의 평균·분산이다.
//
// 고정값(1829/1605/1365) 대신 실제 분류 비율에서 사전분포를 계산하므로
// 사용자가 Tier 1을 30%로 잡든 5%로 잡든 일관된 척도가 된다.

import { TIERS, type Tier } from '../types';
import { bandMoments } from './normal';
import { ELO_BASE, POP_SD_ELO, eloSdToTheta, thetaSdToElo } from './scale';

/** 권장 티어 비율 (UI 가이드이자, 분류 초반 비율 스무딩의 기준값) */
export const TARGET_SHARE: Readonly<Record<Tier, number>> = { 1: 0.1, 2: 0.4, 3: 0.5 };

/** 직감 분류 잡음 τ (모집단 표준편차 단위) */
export const TIER_NOISE = 0.5;

/** 분류한 곡이 적을 때 비율이 튀지 않도록 섞는 의사 표본 수 */
const PSEUDO_COUNT = 10;

/** v1 초기 레이팅: round(1500 + 200·Φ⁻¹(P_mid)), P_mid = 0.95 / 0.70 / 0.25 */
export const LEGACY_INITIAL_RATING: Readonly<Record<Tier, number>> = { 1: 1829, 2: 1605, 3: 1365 };

export interface Prior {
  /** Elo 척도 평균 */
  mean: number;
  /** Elo 척도 표준편차 */
  sd: number;
}

export type TierCounts = Record<Tier, number>;

export function tierShares(counts: TierCounts): Record<Tier, number> {
  const denom = counts[1] + counts[2] + counts[3] + PSEUDO_COUNT;
  return {
    1: (counts[1] + PSEUDO_COUNT * TARGET_SHARE[1]) / denom,
    2: (counts[2] + PSEUDO_COUNT * TARGET_SHARE[2]) / denom,
    3: (counts[3] + PSEUDO_COUNT * TARGET_SHARE[3]) / denom,
  };
}

export function tierPriors(counts: TierCounts, noise = TIER_NOISE): Record<Tier, Prior> {
  const s = tierShares(counts);
  const bands: Record<Tier, [number, number]> = {
    3: [0, s[3]],
    2: [s[3], s[3] + s[2]],
    1: [s[3] + s[2], 1],
  };
  const k = 1 + noise * noise;
  const out = {} as Record<Tier, Prior>;
  for (const tier of TIERS) {
    const { mean, variance } = bandMoments(bands[tier][0], bands[tier][1]);
    out[tier] = {
      mean: ELO_BASE + (POP_SD_ELO * mean) / Math.sqrt(k),
      sd: POP_SD_ELO * Math.sqrt((noise * noise + variance) / k),
    };
  }
  return out;
}

/**
 * v1 곡의 사전분포 표준편차. v1은 비교 기록 없이 레이팅만 남겼으므로,
 * c회 비교를 "정보량 c/2회 분량"으로 할인해 반영한다
 * (v1은 1400~1800 구간에서 K=60이 고정돼 레이팅 잡음이 컸다).
 */
export function legacyPriorSd(tierSd: number, comparisons: number): number {
  const v = eloSdToTheta(tierSd) ** 2;
  const precision = 1 / v + 0.25 * (Math.max(0, comparisons) / 2);
  return thetaSdToElo(Math.sqrt(1 / precision));
}
