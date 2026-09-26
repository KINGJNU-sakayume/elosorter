// 표준정규분포 유틸리티.

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/** 상보 오차함수. Numerical Recipes erfcc — 전 구간 상대오차 < 1.2e-7 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(
    -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))),
  );
  return x >= 0 ? r : 2 - r;
}

/** 표준정규 누적분포 Φ(x) */
export function normCdf(x: number): number {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** 표준정규 분위수 함수 Φ⁻¹(p). Acklam 알고리즘 — 상대오차 < 1.15e-9 */
export function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * 백분위 구간 [pLo, pHi]로 잘린 표준정규분포의 평균·분산.
 * 예) 상위 10% 구간 [0.9, 1] → 평균 ≈ 1.755, 분산 ≈ 0.169
 */
export function bandMoments(pLo: number, pHi: number): { mean: number; variance: number } {
  const mass = pHi - pLo;
  const a = probit(pLo);
  const b = probit(pHi);
  if (mass <= 1e-12) {
    const z = Number.isFinite(a) ? a : b;
    return { mean: Number.isFinite(z) ? z : 0, variance: 0 };
  }
  const pa = Number.isFinite(a) ? normPdf(a) : 0;
  const pb = Number.isFinite(b) ? normPdf(b) : 0;
  const apa = Number.isFinite(a) ? a * pa : 0;
  const bpb = Number.isFinite(b) ? b * pb : 0;
  const mean = (pa - pb) / mass;
  const variance = 1 + (apa - bpb) / mass - mean * mean;
  return { mean, variance: Math.max(variance, 0) };
}
