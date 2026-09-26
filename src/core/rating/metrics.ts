import { normCdf } from './normal';
import { createRng } from './rng';

export interface Estimate {
  rating: number;
  sigma?: number;
}

/**
 * 예상 정확도: 임의의 두 곡을 골랐을 때 현재 순위의 선후가 실제 취향과 같을 확률의 기대값.
 *   P(i, j 순서가 맞음) = Φ(|μi − μj| / √(σi² + σj²))
 * 0.5 = 무작위 순서, 1 = 완전히 확정된 순서. 곡 수와 무관하게 해석할 수 있다.
 * 쌍이 많으면 고정 시드로 표본 추출해 계산량을 일정하게 유지한다.
 */
export function expectedPairAccuracy(items: readonly Estimate[], maxPairs = 30000): number | null {
  const n = items.length;
  if (n < 2) return null;

  const prob = (x: Estimate, y: Estimate) => {
    const d = Math.abs(x.rating - y.rating);
    if (d === 0) return 0.5;
    const s = Math.hypot(x.sigma ?? 0, y.sigma ?? 0);
    return s === 0 ? 1 : normCdf(d / s);
  };

  const total = (n * (n - 1)) / 2;
  let sum = 0;
  if (total <= maxPairs) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) sum += prob(items[i], items[j]);
    }
    return sum / total;
  }
  const rng = createRng(0x9e3779b9 ^ n);
  for (let k = 0; k < maxPairs; k++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;
    sum += prob(items[i], items[j]);
  }
  return sum / maxPairs;
}
