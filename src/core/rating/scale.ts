// Elo 척도 ↔ 로그오즈(θ) 변환.
// 내부 계산은 자연로그 오즈 θ로 하고, 화면·저장은 익숙한 Elo 척도(1500 중심)로 한다.
// Elo 400점 차이 = 승리 오즈 10배  ⇔  Δθ = ln(10)

export const ELO_BASE = 1500;
/** θ 1단위에 해당하는 Elo 점수 (≈173.7) */
export const ELO_PER_THETA = 400 / Math.LN10;
/** 라이브러리 전체 취향 분포를 N(1500, 200²)로 가정 */
export const POP_SD_ELO = 200;

export const eloToTheta = (elo: number): number => (elo - ELO_BASE) / ELO_PER_THETA;
export const thetaToElo = (theta: number): number => ELO_BASE + theta * ELO_PER_THETA;
export const eloSdToTheta = (sd: number): number => sd / ELO_PER_THETA;
export const thetaSdToElo = (sd: number): number => sd * ELO_PER_THETA;

export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}
