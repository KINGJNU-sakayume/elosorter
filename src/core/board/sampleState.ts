// 보드 예시 출력(board/sample.json)과 테스트에 쓰는 지어낸 세션. 실제 기록·개인 데이터·토큰은 없다.
// 곡 이름·아티스트·이미지 주소는 모두 지어낸 값이다(이미지 주소는 형식만 Spotify와 같고 실제로는 없다).

import { recomputeRatings } from '../rating/engine';
import { SESSION_VERSION, type SessionData } from '../session/schema';
import type { Match, Tier, Track } from '../types';

/** 예시 출력의 기준 시각 (2026-11-07 21:00 KST) */
export const SAMPLE_NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

const fakeImage = (n: number, size: '300' | '640') =>
  `https://i.scdn.co/image/ab67616d0000${size === '300' ? '1e02' : 'b273'}${String(n).padStart(24, '0')}`;

function track(n: number, name: string, artist: string, tier: Tier | null, addedAt: string, cover = true): Track {
  return {
    id: `sample${String(n).padStart(2, '0')}`,
    name,
    artists: [artist],
    album: `${name} (싱글)`,
    image: cover ? fakeImage(n, '640') : '',
    ...(cover ? { thumb: fakeImage(n, '300') } : {}),
    uri: `spotify:track:sample${n}`,
    addedAt,
    tier,
    rating: 1500,
    comparisons: 0,
    isNew: false,
  };
}

const TRACKS: Track[] = [
  track(1, '새벽의 항해', '물결 악단', 1, '2026-09-02T10:00:00Z'),
  track(2, '유리 정원', '낮달', 1, '2026-08-14T10:00:00Z'),
  track(3, '낮은 파도', '물결 악단', 1, '2026-07-30T10:00:00Z'),
  track(4, '긴 오후', '종이비행', 2, '2026-10-01T10:00:00Z'),
  track(5, '먼 불빛', '낮달', 2, '2026-10-12T10:00:00Z'),
  track(6, '골목의 끝', '종이비행', 2, '2026-06-20T10:00:00Z', false),
  track(7, '겨울 정거장', '소금빵', 3, '2026-05-05T10:00:00Z'),
  track(8, '오래된 지도', '소금빵', 3, '2026-04-18T10:00:00Z'),
  track(9, '첫눈 예보', '물결 악단', null, '2026-11-06T10:00:00Z'),
  track(10, '늦은 답장', '낮달', null, '2026-11-05T10:00:00Z'),
];

const MATCHES: Match[] = [
  ['sample01', 'sample02', 0.75],
  ['sample02', 'sample03', 1],
  ['sample04', 'sample05', 0.5],
  ['sample01', 'sample03', 1],
  ['sample05', 'sample06', 0.75],
  ['sample07', 'sample08', 0.25],
  ['sample03', 'sample02', 0.75],
  ['sample04', 'sample05', 1],
];

export function sampleSession(): SessionData {
  return {
    version: SESSION_VERSION,
    ownerId: null,
    source: 'liked',
    sourceName: null,
    tracks: recomputeRatings(TRACKS, MATCHES),
    matches: MATCHES,
    compCount: 214,
    legacySeen: [],
    lastSyncedAt: '2026-11-07T09:00:00Z',
    savedAt: '2026-11-07T11:30:00Z',
    syncVersion: null,
  };
}
