import type { Track, SpotifyPlaylist } from './types';

export function trackFromItem(item: Record<string, unknown>): Track | null {
  const t = (item.track as Record<string, unknown>) || item;
  if (!t?.id) return null;
  const artists = t.artists as { name: string }[];
  const album = t.album as { name: string; images: { url: string }[] };
  return {
    id: t.id as string,
    name: t.name as string,
    artists: artists.map((a) => a.name),
    image: album.images?.[0]?.url || '',
    album: album.name || '',
    uri: t.uri as string,
    addedAt: (item.added_at as string) || null,
    tier: null,
    rating: 1500,
    comparisons: 0,
    isNew: false,
    durationMs: (t.duration_ms as number) ?? 0,
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
      const tracks = data.tracks as ({ id: string; duration_ms: number } | null)[];
      for (const t of tracks) {
        if (t?.id) result.push({ id: t.id, durationMs: t.duration_ms ?? 0 });
      }
    } catch (e) {
      console.warn('[spotify] /v1/tracks 호출 실패:', e);
    }
  }
  return result;
}
