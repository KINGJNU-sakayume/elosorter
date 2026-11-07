// Life Board(보드)로 보낼 타일 목록(manifest v1)을 세션에서 만든다. 순수 함수만 둔다.
//
// 규격: board 저장소 docs/TILES.md, 검증 코드 js/schema.js(테스트용 복사본: src/test/boardSchema.js), 허용 출처 js/config.js.
// 네트워크·저장소·무작위에 기대지 않는다. 같은 입력(세션, now)이면 언제나 같은 출력이 나와야
// 내용 해시로 중복 전송을 막을 수 있다. 날짜는 기기의 로컬 날짜로 쓴다.
// 동기화 코드(services/lifehub/engine·protocol)와 섞지 않는다. 업로드는 services/lifehub/boardUpload.ts가 한다.

import { rankingAccuracy, rankTracks, recomputeRatings, tierOnlyAccuracy } from '../rating/engine';
import type { SessionData } from '../session/schema';
import type { Track } from '../types';

export const BOARD_APP = 'elosorter';
/** 타일을 누르면 여는 앱 주소. board linkOrigins(https://kingjnu-sakayume.github.io) 안이어야 한다 */
export const BOARD_HREF = 'https://kingjnu-sakayume.github.io/elosorter/';
/** 표지는 Spotify 앨범 아트(i.scdn.co)만 쓴다. board imageOrigins에 있는 출처다 */
export const COVER_ORIGINS: readonly string[] = ['https://i.scdn.co'];

/** board js/schema.js의 최대 길이 (JavaScript `.length` 기준) */
export const MAX = { mono: 2, footKV: 10, numValue: 12, unit: 8, pill: 20, rowValue: 24, name: 30, text: 80, long: 160, url: 600 } as const;

/** 타일 id. 사용자 배치가 이 id로 저장되므로 바꾸지 않는다 */
export const TILE_IDS = { ranking: 'ranking', last: 'last', session: 'session', added: 'added' } as const;

export const RANKING_ROWS = 5;
export const DETAIL_ROWS = 12;
export const ADDED_ITEMS = 8;

export interface BoardCover { src?: string; alt?: string; mono?: string }
export interface BoardRow {
  title: string;
  value?: string;
  sub?: string;
  rank?: number;
  trend?: 'up' | 'down' | 'same';
  cover?: BoardCover;
  muted?: boolean;
}
export interface BoardTile {
  id: string;
  name: string;
  tone: 'type' | 'strip';
  form?: 'list' | 'line' | 'num';
  sizes: string[];
  size: string;
  default: boolean;
  href: string;
  detail?: { title: string; rows: BoardRow[] };
  data: Record<string, unknown>;
}
export interface BoardManifest {
  version: 1;
  app: typeof BOARD_APP;
  generated_at: string;
  tiles: BoardTile[];
}

// ── 글자 ────────────────────────────────────────────────────────────────

/** 앞뒤 공백을 걷고 max자로 자른다(넘치면 끝에 …). 비면 undefined: 빈 글자는 타일째 거절되므로 필드를 뺀다 */
export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // 서로게이트 쌍 가운데를 자르지 않는다
  cut = cut.trimEnd();
  return cut ? `${cut}…` : undefined;
}

/** 첫 글자 하나 (mono는 최대 2자라 코드 포인트 하나만) */
export function firstChar(title: string): string | undefined {
  const c = Array.from(title.trim())[0];
  return c && c.length <= MAX.mono ? c : undefined;
}

/** 1234567 → "1,234,567" (로캘에 따라 달라지지 않게 직접) */
export const groupDigits = (n: number): string => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 로컬 날짜 `11/7`. 해가 now와 다르면 `2025/11/7`. 읽을 수 없으면 undefined */
export function dateLabel(iso: string | null | undefined, now: number): string | undefined {
  if (!iso) return undefined;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return undefined;
  const d = new Date(at);
  const n = new Date(now);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === n.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

// ── 표지 ────────────────────────────────────────────────────────────────

function allowedSrc(url: string | undefined): string | undefined {
  if (!url || url.length > MAX.url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && COVER_ORIGINS.includes(u.origin) ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 행 썸네일·strip 표지: 300px 안팎이면 충분하다. 앱이 고른 목록용 이미지(thumb: Spotify가 주는 320px 이하 중 가장 큰 것,
 * 보통 300×300)를 먼저 쓰고, 없으면 큰 이미지(보통 640px). 허용 출처 밖이거나 없으면 글자 칸 `{mono}`.
 */
export function trackCover(t: Pick<Track, 'name' | 'thumb' | 'image'>): BoardCover | undefined {
  const src = allowedSrc(t.thumb) ?? allowedSrc(t.image);
  if (src) return { src, alt: '' };
  const mono = firstChar(t.name);
  return mono ? { mono } : undefined;
}

// ── 공통 ────────────────────────────────────────────────────────────────

const title = (t: Track) => clip(t.name, MAX.text) ?? '(제목 없음)';
const artistNames = (t: Track) => t.artists.map(a => a.trim()).filter(Boolean).join(', ');
const artists = (t: Track) => clip(artistNames(t), MAX.text);

/** 이 앱의 기록이 하나라도 있는가 (분류한 곡이 있다). 없으면 올리지 않는다: 새 기기가 빈 목록으로 덮지 않게 */
export function hasAnyRecord(session: Pick<SessionData, 'tracks'>): boolean {
  return session.tracks.some(t => t.tier !== null);
}

function sourceLabel(s: Pick<SessionData, 'source' | 'sourceName'>): string {
  return clip(s.sourceName, 40) ?? (s.source === 'liked' ? '좋아요한 곡' : '정렬 중');
}

const tidy = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ── 타일 ────────────────────────────────────────────────────────────────

/**
 * 직전 비교 전의 순위: 마지막 비교 한 건을 뺀 기록으로 다시 계산한다(티어·사전분포는 지금 그대로).
 * 그래서 변동은 "마지막 비교 한 건이 바꾼 순위"다. 비교 기록이 없으면(v1에서 옮긴 세션 등) null.
 */
function previousRanks(session: SessionData): Map<string, number> | null {
  if (session.matches.length === 0) return null;
  const prev = recomputeRatings(session.tracks, session.matches.slice(0, -1));
  return new Map(rankTracks(prev).map((t, i) => [t.id, i + 1]));
}

function rankRow(t: Track, rank: number, prev: Map<string, number> | null, withSub: boolean): BoardRow {
  const before = prev?.get(t.id);
  let trend: BoardRow['trend'];
  let value: string | undefined;
  if (before !== undefined) {
    const d = before - rank;
    trend = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
    if (d !== 0) value = String(Math.abs(d));
  }
  return tidy({
    rank,
    title: title(t),
    value,
    trend,
    sub: withSub ? artists(t) : undefined,
    cover: trackCover(t),
  });
}

function rankingTile(session: SessionData, ranked: Track[], now: number): BoardTile | null {
  if (ranked.length === 0) return null;
  const prev = previousRanks(session);
  const day = dateLabel(session.savedAt, now);
  const foot = clip(`비교 ${groupDigits(session.compCount)}회${day ? ` · ${day}` : ''}`, MAX.text);
  return {
    id: TILE_IDS.ranking,
    name: 'ELO Sorter · 현재 순위',
    tone: 'type',
    form: 'list',
    sizes: ['1x1', '2x1', '2x2'],
    size: '2x2',
    default: true,
    href: BOARD_HREF,
    detail: {
      title: clip(`ELO Sorter · 상위 ${Math.min(DETAIL_ROWS, ranked.length)}곡`, MAX.text)!,
      rows: ranked.slice(0, DETAIL_ROWS).map((t, i) => rankRow(t, i + 1, prev, true)),
    },
    data: tidy({
      label: clip(`ELO Sorter · ${sourceLabel(session)}`, MAX.text)!,
      rows: ranked.slice(0, RANKING_ROWS).map((t, i) => rankRow(t, i + 1, prev, false)),
      foot,
    }),
  };
}

function lastTile(session: SessionData, now: number): BoardTile | null {
  const last = session.matches.at(-1);
  if (!last) return null;
  const [aId, bId, score] = last;
  const a = session.tracks.find(t => t.id === aId);
  const b = session.tracks.find(t => t.id === bId);
  if (!a || !b) return null;
  // 기록된 점수(왼쪽 곡 기준) → 말. src/phases/sort/choices.ts의 verdictOf와 같은 기준
  const winner = score === 0.5 ? null : score > 0.5 ? a : b;
  const word = score === 0.5 ? '비슷함' : Math.abs(score - 0.5) >= 0.49 ? '확실히' : '조금 더';
  const day = dateLabel(session.savedAt, now);
  return {
    id: TILE_IDS.last,
    name: 'ELO Sorter · 최근 비교',
    tone: 'type',
    form: 'line',
    sizes: ['2x1', '4x1'],
    size: '2x1',
    default: false,
    href: BOARD_HREF,
    data: tidy({
      label: day ? `ELO Sorter · 최근 비교 · ${day}` : 'ELO Sorter · 최근 비교',
      title: `${clip(a.name, 70) ?? '(제목 없음)'} vs ${clip(b.name, 70) ?? '(제목 없음)'}`,
      sub: winner ? clip(`${winner.name} 승 · ${word}`, MAX.text) : '두 곡이 비슷함',
      pill: word,
    }),
  };
}

const percent = (x: number) => (Math.round(x * 1000) / 10).toFixed(1);

function sessionTile(session: SessionData, now: number): BoardTile | null {
  const accuracy = rankingAccuracy(session.tracks);
  if (accuracy === null) return null; // 분류한 곡이 2곡 미만
  const base = tierOnlyAccuracy(session.tracks);
  const tiered = session.tracks.filter(t => t.tier !== null).length;
  const day = dateLabel(session.savedAt, now);
  const foot = [
    { k: '비교', v: clip(`${groupDigits(session.compCount)}회`, MAX.footKV) },
    { k: '분류', v: clip(`${groupDigits(tiered)}/${groupDigits(session.tracks.length)}`, MAX.footKV) },
    base === null ? null : { k: '분류만', v: `${percent(base)}%` },
  ].filter((f): f is { k: string; v: string } => !!f && !!f.v);
  return {
    id: TILE_IDS.session,
    name: 'ELO Sorter · 정렬 진행',
    tone: 'type',
    form: 'num',
    sizes: ['1x1', '2x1'],
    size: '1x1',
    default: false,
    href: BOARD_HREF,
    data: tidy({
      label: 'ELO Sorter · 예상 정확도',
      value: percent(accuracy),
      unit: '%',
      caption: day ? `${day} 기준` : undefined,
      sub: '임의의 두 곡의 앞뒤가 취향과 맞을 확률의 추정치',
      foot: foot.length ? foot : undefined,
    }),
  };
}

function addedTile(session: SessionData, now: number): BoardTile | null {
  const dated = session.tracks
    .filter(t => t.addedAt !== null && Number.isFinite(Date.parse(t.addedAt)))
    .sort((x, y) => Date.parse(y.addedAt!) - Date.parse(x.addedAt!) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, ADDED_ITEMS);
  if (dated.length === 0) return null;
  const waiting = session.tracks.filter(t => t.tier === null).length;
  return {
    id: TILE_IDS.added,
    name: 'ELO Sorter · 새로 들어온 곡',
    tone: 'strip',
    sizes: ['2x1', '4x1'],
    size: '4x1',
    default: false,
    href: BOARD_HREF,
    detail: {
      title: 'ELO Sorter · 새로 들어온 곡',
      rows: dated.map(t => tidy({
        title: title(t),
        value: t.tier === null ? '분류 대기' : `T${t.tier}`,
        sub: clip([artistNames(t), `${dateLabel(t.addedAt, now)} 추가`].filter(Boolean).join(' · '), MAX.text),
        cover: trackCover(t),
        muted: t.tier === null ? undefined : true,
      })),
    },
    data: {
      label: waiting > 0 ? `ELO Sorter · 분류 대기 ${groupDigits(waiting)}곡` : 'ELO Sorter · 새로 들어온 곡',
      square: true,
      items: dated.map(t => tidy({ title: title(t), cover: trackCover(t) })),
    },
  };
}

/**
 * 세션 → 보드 목록(manifest v1). 기록이 없으면 타일 0개(업로드 쪽이 hasAnyRecord로 올리지 않는다).
 * session.tracks의 rating은 앱 상태처럼 이미 비교 기록으로 다시 계산된 값이어야 한다.
 */
export function buildBoardTiles(session: SessionData, now: number): BoardManifest {
  const ranked = rankTracks(session.tracks);
  const tiles = ranked.length === 0
    ? []
    : [rankingTile(session, ranked, now), lastTile(session, now), sessionTile(session, now), addedTile(session, now)]
      .filter((t): t is BoardTile => t !== null);
  return { version: 1, app: BOARD_APP, generated_at: new Date(now).toISOString(), tiles };
}
