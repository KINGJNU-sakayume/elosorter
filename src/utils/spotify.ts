import type { Track, SpotifyPlaylist } from './types';

export function trackFromItem(item: Record<string, unknown>): Track | null {
  const t = (item.track as Record<string, unknown>) || item;
  // 필수 필드 가드: id 없거나 로컬 파일/제거된 트랙일 경우 스킵
  if (!t || typeof t.id !== 'string' || !t.id) return null;

  const rawArtists = t.artists;
  const artists = Array.isArray(rawArtists)
    ? rawArtists
        .map((a) => (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string'
          ? (a as { name: string }).name
          : ''))
        .filter(Boolean)
    : [];

  const rawAlbum = (t.album && typeof t.album === 'object') ? t.album as Record<string, unknown> : null;
  const albumName = typeof rawAlbum?.name === 'string' ? rawAlbum.name : '';
  const albumImages = Array.isArray(rawAlbum?.images) ? rawAlbum.images as { url?: unknown }[] : [];
  const image = typeof albumImages[0]?.url === 'string' ? albumImages[0].url : '';

  return {
    id: t.id,
    name: typeof t.name === 'string' ? t.name : '(제목 없음)',
    artists,
    image,
    album: albumName,
    uri: typeof t.uri === 'string' ? t.uri : `spotify:track:${t.id}`,
    addedAt: typeof item.added_at === 'string' ? item.added_at : null,
    tier: null,
    rating: 1500,
    comparisons: 0,
    isNew: false,
    durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
  };
}

export async function spotifyGet(
  path: string,
  getToken: () => Promise<string | null>
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 3; i++) {
    const token = await getToken();
    if (!token) throw new Error('로그인 필요');
    const res = await fetch('https://api.spotify.com/v1' + path, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '2', 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error('Spotify API 오류: ' + res.status);
    return res.json();
  }
  throw new Error('Spotify API 재시도 초과');
}

export async function fetchAllTracks(
  endpoint: string,
  getToken: () => Promise<string | null>,
  onProgress?: (n: number, total: number) => void
): Promise<Track[]> {
  const results: Track[] = [];
  let next: string | null = endpoint;
  while (next) {
    const data = await spotifyGet(next.replace('https://api.spotify.com/v1', ''), getToken);
    const items = (data.items as Record<string, unknown>[]).map(trackFromItem).filter(Boolean) as Track[];
    results.push(...items);
    if (onProgress) onProgress(results.length, data.total as number);
    next = data.next ? (data.next as string).replace('https://api.spotify.com/v1', '') : null;
  }
  return results;
}

export async function fetchNewTracks(
  endpoint: string,
  knownIds: Set<string>,
  lastSyncedAt: string | null,
  getToken: () => Promise<string | null>
): Promise<Track[]> {
  const newTracks: Track[] = [];
  let next: string | null = endpoint;
  while (next) {
    const data = await spotifyGet(next.replace('https://api.spotify.com/v1', ''), getToken);
    let stop = false;
    for (const item of data.items as Record<string, unknown>[]) {
      if (lastSyncedAt && item.added_at && (item.added_at as string) <= lastSyncedAt) {
        stop = true;
        break;
      }
      const t = trackFromItem(item);
      if (t && !knownIds.has(t.id)) newTracks.push(t);
    }
    next = stop ? null : data.next ? (data.next as string).replace('https://api.spotify.com/v1', '') : null;
  }
  return newTracks;
}

export async function fetchPlaylists(getToken: () => Promise<string | null>): Promise<SpotifyPlaylist[]> {
  const results: SpotifyPlaylist[] = [];
  let next: string | null = '/me/playlists?limit=50';
  while (next) {
    const data = await spotifyGet(next, getToken);
    const items = (data.items as (SpotifyPlaylist | null)[])
      .filter((p): p is SpotifyPlaylist => !!(p && p.id && p.name));
    results.push(...items);
    next = data.next ? (data.next as string).replace('https://api.spotify.com/v1', '') : null;
  }
  return results;
}

/**
 * 여러 곡의 duration_ms를 공식 /v1/tracks 엔드포인트에서 일괄 조회 (50개씩 배치).
 *
 * 참고: 2024-11 이후 Spotify는 공식 API의 preview_url을 막았고,
 * embed 페이지 파싱은 CORS·서드파티 프록시 의존 문제로 제거함.
 * duration_ms는 여전히 공식 API로 안정적으로 얻을 수 있음.
 */
export async function fetchTrackDurations(
  trackIds: string[],
  getToken: () => Promise<string | null>
): Promise<{ id: string; durationMs: number }[]> {
  if (!trackIds.length) return [];
  const result: { id: string; durationMs: number }[] = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50);
    try {
      const data = await spotifyGet(`/tracks?ids=${chunk.join(',')}`, getToken);
      const rawTracks = data.tracks;
      if (!Array.isArray(rawTracks)) continue;
      for (const raw of rawTracks) {
        if (!raw || typeof raw !== 'object') continue;
        const t = raw as { id?: unknown; duration_ms?: unknown };
        if (typeof t.id === 'string' && typeof t.duration_ms === 'number') {
          result.push({ id: t.id, durationMs: t.duration_ms });
        }
      }
    } catch (e) {
      console.warn('[spotify] /v1/tracks 호출 실패:', e);
    }
  }
  return result;
}
