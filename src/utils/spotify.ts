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
    previewUrl: (t.preview_url as string | null) ?? null,
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
 * 여러 곡의 preview_url과 duration_ms를 한 번에 가져옴
 * Spotify /tracks endpoint는 한 번에 최대 50개 ID를 받음
 * 이미 저장된 트랙들에 preview 정보가 없을 때 보강용
 */
export async function fetchTrackDetails(
  trackIds: string[],
  getToken: () => Promise<string | null>
): Promise<{ id: string; previewUrl: string | null; durationMs: number }[]> {
  const results: { id: string; previewUrl: string | null; durationMs: number }[] = [];
  // 50개씩 청크
  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50);
    const data = await spotifyGet(`/tracks?ids=${chunk.join(',')}`, getToken);
    const tracks = data.tracks as ({ id: string; preview_url: string | null; duration_ms: number } | null)[];
    for (const t of tracks) {
      if (t?.id) {
        results.push({ id: t.id, previewUrl: t.preview_url, durationMs: t.duration_ms });
      }
    }
  }
  return results;
}
