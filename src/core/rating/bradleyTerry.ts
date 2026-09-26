// 베이지안 Bradley–Terry 모델의 MAP 추정.
//
//   P(a가 b보다 좋다) = σ(θa − θb),   θi ~ N(μi, vi)  (티어 사전분포)
//
// 목적함수 (음의 로그 사후확률):
//   F(θ) = Σi (θi − μi)² / 2vi − Σ(a,b,s) [ s·log σ(θa−θb) + (1−s)·log σ(θb−θa) ]
// s는 0~1의 점수라서 "약간 우세(0.75)" 같은 단계형 응답도 그대로 반영된다.
//
// Elo와 달리 모든 비교를 한꺼번에 푸는 전역 추정이라
//  - 비교 순서에 따라 결과가 달라지지 않고,
//  - 나중에 강해진 상대에게 이겼던 기록도 소급해 반영되며,
//  - 비교 한 건을 빼면(되돌리기) 정확히 이전 상태로 돌아간다.
//
// 풀이: 좌표별 뉴턴 스윕(Gauss–Seidel). 곡률을 max(h, h_upper/2)로 잡아
// 매 스텝 목적함수가 줄어듦을 보장한다 (h_upper = 1/v + deg/4 는 전역 상계).

import { sigmoid } from './scale';

/** [a 인덱스, b 인덱스, a의 점수] */
export type IndexedMatch = readonly [a: number, b: number, scoreA: number];

export interface FitResult {
  /** 사후 최빈값 θ */
  theta: Float64Array;
  /** 사후 분산 근사 (라플라스 근사의 대각 성분) */
  variance: Float64Array;
  sweeps: number;
  converged: boolean;
}

export interface FitOptions {
  tol?: number;
  maxSweeps?: number;
}

export function fitBradleyTerry(
  priorMean: ArrayLike<number>,
  priorVar: ArrayLike<number>,
  matches: ReadonlyArray<IndexedMatch>,
  init?: ArrayLike<number>,
  { tol = 1e-7, maxSweeps = 1000 }: FitOptions = {},
): FitResult {
  const n = priorMean.length;
  const theta = new Float64Array(n);
  const precision = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = init ? init[i] : priorMean[i];
    theta[i] = Number.isFinite(start) ? start : priorMean[i];
    precision[i] = 1 / priorVar[i];
  }

  // 인접 리스트 (CSR): 곡 i의 상대와 i 입장의 점수
  const offset = new Int32Array(n + 1);
  for (const [a, b] of matches) { offset[a + 1]++; offset[b + 1]++; }
  for (let i = 0; i < n; i++) offset[i + 1] += offset[i];
  const cursor = offset.slice(0, n);
  const opponent = new Int32Array(offset[n]);
  const score = new Float64Array(offset[n]);
  for (const [a, b, s] of matches) {
    opponent[cursor[a]] = b; score[cursor[a]++] = s;
    opponent[cursor[b]] = a; score[cursor[b]++] = 1 - s;
  }

  const active: number[] = [];
  for (let i = 0; i < n; i++) {
    if (offset[i + 1] > offset[i]) active.push(i);
    else theta[i] = priorMean[i]; // 비교가 없으면 사후 = 사전
  }

  let sweeps = 0;
  let converged = active.length === 0;
  while (!converged && sweeps < maxSweeps) {
    sweeps++;
    let maxStep = 0;
    for (const i of active) {
      const ti = theta[i];
      let grad = (ti - priorMean[i]) * precision[i];
      let hess = precision[i];
      for (let k = offset[i]; k < offset[i + 1]; k++) {
        const p = sigmoid(ti - theta[opponent[k]]);
        grad -= score[k] - p;
        hess += p * (1 - p);
      }
      const upper = precision[i] + 0.25 * (offset[i + 1] - offset[i]);
      const step = grad / Math.max(hess, 0.5 * upper);
      theta[i] = ti - step;
      const abs = Math.abs(step);
      if (abs > maxStep) maxStep = abs;
    }
    if (maxStep < tol) converged = true;
  }

  const variance = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let hess = precision[i];
    for (let k = offset[i]; k < offset[i + 1]; k++) {
      const p = sigmoid(theta[i] - theta[opponent[k]]);
      hess += p * (1 - p);
    }
    variance[i] = 1 / hess;
  }
  return { theta, variance, sweeps, converged };
}
