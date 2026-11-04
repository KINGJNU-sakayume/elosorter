// Life Hub 동기화 문서 크기 측정 (합성 데이터). `npx vitest run --config bench/vitest.config.ts bench/syncSize.test.ts`
// 표는 콘솔에 마크다운으로 나온다. 실제 세션은 쓰지 않는다 — 실제 크기는 설정 화면의 "동기화 문서 크기"로 본다.

import { describe, expect, it } from 'vitest';
import { serializeSession } from '../src/core/session/schema';
import { SYNC_LIMIT_BYTES, serializeSyncBody, utf8Bytes } from '../src/core/session/syncDoc';
import { syntheticSession } from '../src/core/session/synthetic';

const COUNTS = [1000, 3000, 5000, 10000];
/** 앱은 비교 기록이 4000건을 넘으면 3000건으로 압축한다 → 문서에는 많아야 4000건 */
const MATCH_CAP = 4000;
const kib = (n: number) => (n / 1024).toFixed(1);

const bytesOf = (tracks: number, matches: number) => {
  const s = syntheticSession({ tracks, matches, seed: tracks + matches });
  return {
    sync: utf8Bytes(serializeSyncBody(s)),
    full: utf8Bytes(JSON.stringify(serializeSession(s))),
  };
};

describe('sync document size (synthetic)', () => {
  it('prints the size table', () => {
    const rows: string[] = [];
    for (const n of COUNTS) {
      const m = Math.min(2 * n, MATCH_CAP);
      const withMatches = bytesOf(n, m);
      const tracksOnly = bytesOf(n, 0);
      const perMatch = (withMatches.sync - tracksOnly.sync) / m;
      rows.push(
        `| ${n.toLocaleString('en-US')} | ${m.toLocaleString('en-US')} | ${kib(withMatches.sync)} KiB | ${(tracksOnly.sync / n).toFixed(0)} | ${perMatch.toFixed(0)} | ` +
        `${kib(withMatches.full)} KiB | ${(((withMatches.full - withMatches.sync) / withMatches.full) * 100).toFixed(1)}% | ${withMatches.sync <= SYNC_LIMIT_BYTES ? '들어감' : '너무 큼'} |`,
      );
      expect(withMatches.sync).toBeLessThan(withMatches.full);
    }
    // 900 KiB에 들어가는 곡 수 (선형 근사 후 실제로 만들어 확인)
    const unit = bytesOf(2000, 0);
    const perTrack = unit.sync / 2000;
    const mUnit = bytesOf(2000, MATCH_CAP);
    const perMatch = (mUnit.sync - unit.sync) / MATCH_CAP;
    const fit = (matches: number) => Math.floor((SYNC_LIMIT_BYTES - matches * perMatch) / perTrack);
    const capNoMatches = fit(0);
    const capWithCap = fit(MATCH_CAP);
    expect(bytesOf(capNoMatches, 0).sync).toBeLessThanOrEqual(SYNC_LIMIT_BYTES * 1.005);
    expect(bytesOf(capWithCap, MATCH_CAP).sync).toBeLessThanOrEqual(SYNC_LIMIT_BYTES * 1.005);
    console.log([
      '',
      '| 곡 수 | 비교 기록 | 동기화 문서 | 곡당 바이트(비교 제외) | 비교 1건당 바이트 | 파생값 포함 시 | 파생값을 빼서 줄어든 비율 | 900 KiB |',
      '|---:|---:|---:|---:|---:|---:|---:|:---|',
      ...rows,
      '',
      `900 KiB(${SYNC_LIMIT_BYTES.toLocaleString('en-US')}바이트)에 들어가는 곡 수: 비교 기록 없이 약 ${capNoMatches.toLocaleString('en-US')}곡, 비교 ${MATCH_CAP.toLocaleString('en-US')}건(앱이 유지하는 최대)과 함께면 약 ${capWithCap.toLocaleString('en-US')}곡`,
      '',
    ].join('\n'));
  });
});
