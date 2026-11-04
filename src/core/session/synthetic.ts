// 테스트·크기 측정용 합성 세션. 실제 세션·토큰·계정 정보는 어디에도 없다.
// 필드 길이는 Spotify 응답과 비슷하게 맞췄다 (22자 base62 id, 64자 앨범 아트 URL, 한글 제목 3바이트/자).

import { recomputeRatings } from '../rating/engine';
import { createRng, type Rng } from '../rating/rng';
import type { Match, Tier, Track } from '../types';
import { SESSION_VERSION, type SessionData } from './schema';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX = '0123456789abcdef';
const HANGUL = '가나다라마바사아자차카타파하별빛바람노래사랑하늘우리여름겨울밤꿈';
const LATIN = 'abcdefghijklmnopqrstuvwxyz';

const pick = (chars: string, n: number, rng: Rng) => {
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(rng() * chars.length)];
  return s;
};

/** 절반쯤은 한글, 나머지는 영문 제목 */
function title(rng: Rng, min: number, max: number): string {
  const len = min + Math.floor(rng() * (max - min + 1));
  return rng() < 0.5 ? pick(HANGUL, len, rng) : `${pick(LATIN, len, rng)} ${pick(LATIN, 3 + Math.floor(rng() * 5), rng)}`;
}

export interface SyntheticOptions {
  tracks: number;
  /** 비교 기록 수. 앱은 4000건을 넘으면 3000건으로 압축한다 */
  matches?: number;
  seed?: number;
  /** 분류하지 않은 곡의 비율 */
  untiered?: number;
}

export function syntheticTracks(count: number, rng: Rng, untiered = 0.1): Track[] {
  const out: Track[] = [];
  for (let i = 0; i < count; i++) {
    const art = pick(HEX, 24, rng);
    const tier: Tier | null = rng() < untiered ? null : rng() < 0.1 ? 1 : rng() < 0.45 ? 2 : 3;
    const id = pick(B62, 22, rng);
    out.push({
      id,
      name: title(rng, 3, 14),
      artists: rng() < 0.2 ? [title(rng, 2, 8), title(rng, 2, 8)] : [title(rng, 2, 8)],
      album: title(rng, 3, 14),
      image: `https://i.scdn.co/image/ab67616d0000b273${art}`,
      thumb: `https://i.scdn.co/image/ab67616d00004851${art}`,
      uri: `spotify:track:${id}`,
      addedAt: new Date(Date.UTC(2020, 0, 1) + Math.floor(rng() * 5 * 365 * 86400000)).toISOString().replace('.000Z', 'Z'),
      durationMs: 120000 + Math.floor(rng() * 240000),
      tier,
      rating: 1500,
      comparisons: 0,
      isNew: false,
    });
  }
  return out;
}

/** 곡 수에 맞는 합성 세션. 비교는 티어가 있는 곡끼리 무작위로, 점수는 5단계 중 하나 */
export function syntheticSession({ tracks: n, matches: m = Math.min(n, 4000), seed = 1, untiered = 0.1 }: SyntheticOptions): SessionData {
  const rng = createRng(seed);
  let tracks = syntheticTracks(n, rng, untiered);
  const ranked = tracks.filter(t => t.tier !== null);
  const matches: Match[] = [];
  const counts = new Map<string, number>();
  const scores = [0, 0.25, 0.5, 0.75, 1];
  while (ranked.length >= 2 && matches.length < m) {
    const a = ranked[Math.floor(rng() * ranked.length)];
    const b = ranked[Math.floor(rng() * ranked.length)];
    if (a.id === b.id) continue;
    matches.push([a.id, b.id, scores[Math.floor(rng() * scores.length)]]);
    counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
  }
  tracks = tracks.map(t => ({ ...t, comparisons: counts.get(t.id) ?? 0 }));
  return {
    version: SESSION_VERSION,
    ownerId: 'synthetic-user',
    source: 'liked',
    sourceName: null,
    tracks: recomputeRatings(tracks, matches),
    matches,
    compCount: matches.length,
    legacySeen: [],
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    savedAt: '2026-01-01T00:00:00.000Z',
    syncedAt: null,
    syncVersion: null,
  };
}
