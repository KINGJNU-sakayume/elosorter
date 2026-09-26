// `npm run bench` — 전략별 정렬 정확도 시뮬레이션.
// BENCH=full 이면 문서(docs/ANALYSIS.md)에 실린 전체 시나리오를 돌린다.
// BENCH_OUT=파일경로 를 주면 결과 표를 그 파일에 덧붙인다.

import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatScenario, runScenario, type Scenario } from './simulate';

const FULL = process.env.BENCH === 'full';

const scenarios: Scenario[] = FULL
  ? [
      { label: '300곡 · 권장 비율(10/40/50) · 분류 잡음 τ=0.5', n: 300, seeds: 12, perTrack: [0, 1, 2, 4, 8] },
      { label: '1000곡 · 권장 비율 · τ=0.5', n: 1000, seeds: 4, perTrack: [0, 1, 2, 4] },
      {
        label: '300곡 · 사용자가 Tier 1을 30%로 분류 (30/40/30)',
        n: 300, seeds: 12, perTrack: [0, 1, 2, 4, 8],
        library: { shares: { 1: 0.3, 2: 0.4, 3: 0.3 } },
      },
      {
        label: '300곡 · 직감이 부정확한 사용자 (τ=1.0)',
        n: 300, seeds: 12, perTrack: [0, 1, 2, 4, 8],
        library: { tierNoise: 1.0 },
      },
    ]
  : [{ label: '120곡 · 빠른 점검', n: 120, seeds: 4, perTrack: [0, 1, 3] }];

describe('ranking simulation', () => {
  for (const sc of scenarios) {
    it(sc.label, () => {
      const rows = runScenario(sc);
      const table = formatScenario(sc, rows);
      console.log(`\n${table}`);
      if (process.env.BENCH_OUT) appendFileSync(process.env.BENCH_OUT, `${table}\n`);
      const v1 = rows.find(r => r.strategy.startsWith('v1 (현재)'))!;
      const v2 = rows.find(r => r.strategy.includes('(개선안)'))!;
      const top = rows.find(r => r.strategy.includes('상위권'))!;
      const last = sc.perTrack.length - 1;
      // 전체 정확도는 v1 이상 (오차 범위 1%p 허용)
      expect(v2.pairwise[last]).toBeGreaterThan(v1.pairwise[last] - 0.01);
      // 표시되는 예상 정확도는 실제 정확도와 3%p 이내로 맞아야 한다
      expect(Math.abs(v2.progress[last]! - v2.pairwise[last])).toBeLessThan(0.03);
      // 상위권 집중 모드는 Top 10을 더 빨리 맞춘다
      expect(top.top10[last]).toBeGreaterThanOrEqual(v2.top10[last]);
    });
  }
});
