// 보드 타일 목록(manifest v1). 합성 데이터만 쓴다.
// 규격 검사는 board js/schema.js 복사본(src/test/boardSchema.js)을 board js/config.js와 같은 정책으로 쓴다.

import { describe, expect, it } from 'vitest';
import sample from '../../../board/sample.json';
import { validateManifest } from '../../test/boardSchema';
import { BOARD_POLICY } from '../../test/boardPolicy';
import { APP_URL } from '../../services/lifehub/remote';
import { recomputeRatings } from '../rating/engine';
import { syntheticSession } from '../session/synthetic';
import { SESSION_VERSION, type SessionData } from '../session/schema';
import type { Track } from '../types';
import { SAMPLE_NOW, sampleSession } from './sampleState';
import { BOARD_HREF, buildBoardTiles, clip, dateLabel, hasAnyRecord, MAX, TILE_IDS, type BoardManifest } from './tiles';

const plain = (m: BoardManifest) => JSON.parse(JSON.stringify(m)) as unknown;

function expectValid(m: BoardManifest) {
  const v = validateManifest(plain(m), BOARD_POLICY);
  expect(v.errors).toEqual([]);
  expect(v.ok).toBe(true);
  expect(v.tiles).toHaveLength(m.tiles.length);
  return v;
}

const tile = (m: BoardManifest, id: string) => m.tiles.find(t => t.id === id);

function session(tracks: Track[], patch: Partial<SessionData> = {}): SessionData {
  const matches = patch.matches ?? [];
  return {
    version: SESSION_VERSION, ownerId: null, source: 'liked', sourceName: null,
    tracks: recomputeRatings(tracks, matches), matches, compCount: matches.length, legacySeen: [],
    lastSyncedAt: null, savedAt: '2026-11-07T11:00:00Z', syncVersion: null,
    ...patch,
    ...(patch.tracks ? { tracks: recomputeRatings(patch.tracks, matches) } : {}),
  };
}

function t(id: string, tier: Track['tier'], extra: Partial<Track> = {}): Track {
  return {
    id, name: `곡 ${id}`, artists: ['지어낸 가수'], album: '앨범', image: '', uri: `spotify:track:${id}`,
    addedAt: null, tier, rating: 1500, comparisons: 0, isNew: false, ...extra,
  };
}

/** \s 공백만이거나 빈 글자가 어디에도 없는지 */
function noBlankStrings(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.every(noBlankStrings);
  if (v && typeof v === 'object') return Object.values(v).every(noBlankStrings);
  return true;
}

describe('buildBoardTiles', () => {
  it('the sample output passes schema v1 with the policy: no errors, every tile kept', () => {
    const m = buildBoardTiles(sampleSession(), SAMPLE_NOW);
    const v = expectValid(m);
    expect(v.tiles.map(x => x.id)).toEqual(['ranking', 'last', 'session', 'added']);
    // 저장소의 board/sample.json도 같은 결과이고 그대로 통과한다
    expect(sample).toEqual(plain(m));
    const fromFile = validateManifest(sample, BOARD_POLICY);
    expect(fromFile.errors).toEqual([]);
    expect(fromFile.tiles).toHaveLength(sample.tiles.length);
  });

  it('keeps ids, sizes, first size and default flags fixed', () => {
    const m = buildBoardTiles(sampleSession(), SAMPLE_NOW);
    expect(m.app).toBe('elosorter');
    expect(m.version).toBe(1);
    expect(m.generated_at).toBe('2026-11-07T12:00:00.000Z');
    expect(m.tiles.map(x => [x.id, x.tone, x.form ?? null, x.sizes, x.size, x.default])).toEqual([
      ['ranking', 'type', 'list', ['1x1', '2x1', '2x2'], '2x2', true],
      ['last', 'type', 'line', ['2x1', '4x1'], '2x1', false],
      ['session', 'type', 'num', ['1x1', '2x1'], '1x1', false],
      ['added', 'strip', null, ['2x1', '4x1'], '4x1', false],
    ]);
    expect(TILE_IDS).toEqual({ ranking: 'ranking', last: 'last', session: 'session', added: 'added' });
    for (const x of m.tiles) expect(x.href).toBe(APP_URL);
    expect(BOARD_HREF).toBe(APP_URL);
  });

  it('ranking: top 5 rows, trend from the last comparison, compCount and a date in the foot', () => {
    const m = buildBoardTiles(sampleSession(), SAMPLE_NOW);
    const r = tile(m, 'ranking')!;
    const rows = r.data.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows.map(x => x.rank)).toEqual([1, 2, 3, 4, 5]);
    // 마지막 비교(긴 오후가 먼 불빛을 확실히 이김)가 두 곡의 자리를 바꿨다
    expect(rows[3]).toMatchObject({ title: '긴 오후', trend: 'up', value: '1' });
    expect(rows[4]).toMatchObject({ title: '먼 불빛', trend: 'down', value: '1' });
    expect(rows[0]).toMatchObject({ trend: 'same' });
    expect(rows[0].value).toBeUndefined();
    expect(r.data.foot).toBe('비교 214회 · 11/7');
    expect(r.detail!.rows.length).toBeLessThanOrEqual(12);
    expect(r.detail!.rows[0].sub).toBe('물결 악단');
  });

  it('ranking: no trend when there is no comparison record (e.g. a session moved from v1)', () => {
    const m = buildBoardTiles(session([t('a', 1), t('b', 2)]), SAMPLE_NOW);
    expectValid(m);
    const rows = tile(m, 'ranking')!.data.rows as Array<Record<string, unknown>>;
    expect(rows.every(x => x.trend === undefined && x.value === undefined)).toBe(true);
    expect(tile(m, 'last')).toBeUndefined();
  });

  it('empty state: no classified track → no tiles and no record', () => {
    for (const s of [session([]), session([t('a', null, { addedAt: '2026-11-01T00:00:00Z' })])]) {
      const m = buildBoardTiles(s, SAMPLE_NOW);
      expect(m.tiles).toEqual([]);
      expect(hasAnyRecord(s)).toBe(false);
      expectValid(m);
    }
  });

  it('one classified track: ranking only (no accuracy with one track, no added date)', () => {
    const s = session([t('a', 1)]);
    expect(hasAnyRecord(s)).toBe(true);
    const m = buildBoardTiles(s, SAMPLE_NOW);
    expectValid(m);
    expect(m.tiles.map(x => x.id)).toEqual(['ranking']);
  });

  it('a cover without a public address becomes a letter cell ({mono}); disallowed origins too', () => {
    const s = session([
      t('a', 1, { name: '빈 표지' }),
      t('b', 2, { name: 'Other', image: 'https://example.com/x.jpg' }),
      t('c', 3, { name: '데이터', thumb: 'data:image/png;base64,AAAA' }),
      t('d', 3, { name: 'Ok', thumb: 'https://i.scdn.co/image/abc', image: 'https://i.scdn.co/image/big' }),
    ]);
    const m = buildBoardTiles(s, SAMPLE_NOW);
    expectValid(m);
    const covers = Object.fromEntries((tile(m, 'ranking')!.data.rows as Array<{ title: string; cover?: unknown }>).map(r => [r.title, r.cover]));
    expect(covers['빈 표지']).toEqual({ mono: '빈' });
    expect(covers.Other).toEqual({ mono: 'O' });
    expect(covers['데이터']).toEqual({ mono: '데' });
    expect(covers.Ok).toEqual({ src: 'https://i.scdn.co/image/abc', alt: '' }); // 300px 썸네일 먼저
    expect(JSON.stringify(m)).not.toContain('data:');
  });

  it('cuts long text to the schema limits and stays valid', () => {
    const long = '가'.repeat(300);
    const s = session(
      [
        t('a', 1, { name: long, artists: [long], addedAt: '2026-11-01T00:00:00Z' }),
        t('b', 2, { name: long, addedAt: '2026-11-02T00:00:00Z' }),
      ],
      { sourceName: long, matches: [['a', 'b', 1]], compCount: 123_456_789_012 },
    );
    const m = buildBoardTiles(s, SAMPLE_NOW);
    expectValid(m);
    const r = tile(m, 'ranking')!;
    expect((r.data.label as string).length).toBeLessThanOrEqual(MAX.text);
    expect((r.data.rows as Array<{ title: string }>)[0].title.length).toBeLessThanOrEqual(MAX.text);
    expect((r.data.rows as Array<{ title: string }>)[0].title.endsWith('…')).toBe(true);
    expect((tile(m, 'last')!.data.title as string).length).toBeLessThanOrEqual(MAX.long);
    for (const f of tile(m, 'session')!.data.foot as Array<{ k: string; v: string }>) {
      expect(f.k.length).toBeLessThanOrEqual(MAX.footKV);
      expect(f.v.length).toBeLessThanOrEqual(MAX.footKV);
    }
    for (const x of m.tiles) expect(x.name.length).toBeLessThanOrEqual(MAX.name);
  });

  it('never sends blank text: blank names, artists and source names are dropped or replaced', () => {
    const s = session(
      [t('a', 1, { name: '   ', artists: ['', ' '], addedAt: '2026-11-01T00:00:00Z' }), t('b', 2, { name: '\n', artists: [] })],
      { sourceName: '  ', source: 'playlist:abc', matches: [['a', 'b', 0.5]] },
    );
    const m = buildBoardTiles(s, SAMPLE_NOW);
    expectValid(m);
    expect(noBlankStrings(plain(m))).toBe(true);
    expect(tile(m, 'ranking')!.data.label).toBe('ELO Sorter · 정렬 중');
    expect(tile(m, 'last')!.data).toMatchObject({ sub: '두 곡이 비슷함', pill: '비슷함' });
    expect(tile(m, 'ranking')!.detail!.rows[0].sub).toBeUndefined();
  });

  it('same input → same output (no randomness, no clock other than now)', () => {
    const a = JSON.stringify(buildBoardTiles(sampleSession(), SAMPLE_NOW));
    const b = JSON.stringify(buildBoardTiles(sampleSession(), SAMPLE_NOW));
    expect(a).toBe(b);
    expect(JSON.stringify(buildBoardTiles(sampleSession(), SAMPLE_NOW + 60_000))).not.toBe(a); // generated_at만 다르다
  });

  it('a large library stays far below 64 KiB and passes the schema', () => {
    const big = syntheticSession({ tracks: 2000, matches: 3000, seed: 7 });
    const s = { ...big, tracks: recomputeRatings(big.tracks, big.matches), savedAt: '2026-11-07T11:00:00Z' };
    const m = buildBoardTiles(s, SAMPLE_NOW);
    expectValid(m);
    expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThan(64 * 1024);
  });

  it('the added tile counts tracks waiting for a tier and lists the newest additions with dates', () => {
    const m = buildBoardTiles(sampleSession(), SAMPLE_NOW);
    const added = tile(m, 'added')!;
    expect(added.data.label).toBe('ELO Sorter · 분류 대기 2곡');
    expect((added.data.items as Array<{ title: string }>).map(x => x.title).slice(0, 2)).toEqual(['첫눈 예보', '늦은 답장']);
    expect(added.detail!.rows[0]).toMatchObject({ value: '분류 대기', sub: '물결 악단 · 11/6 추가' });
  });
});

describe('helpers', () => {
  it('clip trims, collapses spaces, cuts with … and drops blanks', () => {
    expect(clip('  a  b ', 10)).toBe('a b');
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('   ', 4)).toBeUndefined();
    expect(clip(undefined, 4)).toBeUndefined();
    expect(clip('a😀bc', 3)!.length).toBeLessThanOrEqual(3);
  });

  it('dateLabel writes a date, with the year when it differs from now', () => {
    expect(dateLabel('2026-11-05T12:00:00Z', SAMPLE_NOW)).toBe('11/5');
    expect(dateLabel('2025-11-05T12:00:00Z', SAMPLE_NOW)).toBe('2025/11/5');
    expect(dateLabel('nope', SAMPLE_NOW)).toBeUndefined();
    expect(dateLabel(null, SAMPLE_NOW)).toBeUndefined();
  });
});
