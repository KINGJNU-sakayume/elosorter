// 여러 시드로 전략을 돌려 비교 횟수별 정확도를 표로 만든다.

import { createRng } from '../src/core/rating/rng';
import { makeLibrary, measure, type LibraryOptions } from './oracle';
import { STRATEGIES } from './strategies';

export interface Scenario {
  label: string;
  n: number;
  seeds: number;
  /** 곡당 비교 횟수 체크포인트 (예: [0, 1, 2, 4]) */
  perTrack: number[];
  library?: LibraryOptions;
  strategies?: string[];
}

export interface Row {
  strategy: string;
  /** 체크포인트별 평균 */
  pairwise: number[];
  top10: number[];
  spearman: number[];
  progress: (number | null)[];
}

export function runScenario(sc: Scenario): Row[] {
  const names = sc.strategies ?? Object.keys(STRATEGIES);
  const budgets = sc.perTrack.map(k => Math.round(k * sc.n));
  const rows: Row[] = names.map(strategy => ({
    strategy,
    pairwise: budgets.map(() => 0),
    top10: budgets.map(() => 0),
    spearman: budgets.map(() => 0),
    progress: budgets.map(() => 0),
  }));

  for (let seed = 1; seed <= sc.seeds; seed++) {
    const lib = makeLibrary(sc.n, createRng(seed * 7919), sc.library);
    names.forEach((name, r) => {
      const strategy = STRATEGIES[name](lib);
      const rng = createRng(seed * 104729 + r);
      let done = 0;
      budgets.forEach((budget, c) => {
        while (done < budget) { strategy.step(rng); done++; }
        const acc = measure(lib, strategy.estimate());
        rows[r].pairwise[c] += acc.pairwise / sc.seeds;
        rows[r].top10[c] += acc.top10 / sc.seeds;
        rows[r].spearman[c] += acc.spearman / sc.seeds;
        const shown = strategy.progress();
        const prev = rows[r].progress[c];
        rows[r].progress[c] = shown === null || prev === null ? null : prev + shown / sc.seeds;
      });
    });
  }
  return rows;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatScenario(sc: Scenario, rows: Row[]): string {
  const head = sc.perTrack.map(k => (k === 0 ? '분류 직후' : `곡당 ${k}회`));
  const table = (title: string, pick: (r: Row) => (number | null)[]) => [
    `**${title}**`,
    '',
    `| 전략 | ${head.join(' | ')} |`,
    `|---|${head.map(() => '---:').join('|')}|`,
    ...rows.map(r => `| ${r.strategy} | ${pick(r).map(v => (v === null ? '—' : pct(v))).join(' | ')} |`),
    '',
  ].join('\n');
  return [
    `### ${sc.label}`,
    '',
    table('쌍 순서 정확도 (실제 취향 대비)', r => r.pairwise),
    table('Top 10 적중률', r => r.top10),
    table('앱이 표시하는 진행 지표 (v1: 정렬 안정도 / 개선안: 예상 정확도)', r => r.progress),
  ].join('\n');
}
