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
 * Spotify embed 페이지에서 preview URL을 추출
 *
 * 2024-11 API 변경으로 공식 API의 preview_url이 모두 null이 됨.
 * 우회책: open.spotify.com/embed/track/{id}의 HTML 안에 있는
 * audioPreview.url (mp3 URL)을 파싱.
 *
 * CORS 문제 때문에 다음 순서로 시도:
 *   1) 직접 fetch
 *   2) 공용 CORS 프록시(corsproxy.io) 경유
 *   3) 둘 다 실패하면 null
 */
async function fetchPreviewFromEmbed(trackId: string): Promise<string | null> {
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  const attempts = [
    embedUrl,
    `https://corsproxy.io/?${encodeURIComponent(embedUrl)}`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) continue;
      const html = await res.text();
      // 임베드 HTML에는 __NEXT_DATA__ JSON에 audioPreview.url이 들어있음
      // 다양한 형식을 커버하기 위해 여러 정규식을 시도
      const patterns = [
        /"audioPreview"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/,
        /"url"\s*:\s*"(https:\/\/p\.scdn\.co\/mp3-preview\/[^"]+)"/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m && m[1]) {
          // 이스케이프 해제
          return m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        }
      }
    } catch {
      // 다음 시도
    }
  }
  return null;
}

/**
 * 여러 곡의 preview URL과 duration_ms를 가져옴
 *
 * duration은 여전히 공식 API(/v1/tracks)에서 정상적으로 받을 수 있음.
 * preview URL은 embed 파싱 방식으로 대체 (최대 동시 5개).
 */
export async function fetchTrackDetails(
  trackIds: string[],
  getToken: () => Promise<string | null>
): Promise<{ id: string; previewUrl: string | null; durationMs: number }[]> {
  if (!trackIds.length) return [];

  // 1) 공식 API로 duration_ms 가져오기 (50개씩)
  const durations = new Map<string, number>();
  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50);
    try {
      const data = await spotifyGet(`/tracks?ids=${chunk.join(',')}`, getToken);
      const tracks = data.tracks as ({ id: string; duration_ms: number } | null)[];
      for (const t of tracks) {
        if (t?.id) durations.set(t.id, t.duration_ms);
      }
    } catch {
      // 실패해도 preview는 계속 시도
    }
  }

  // 2) preview URL은 embed 파싱 — 동시 5개까지 병렬
  const previews = new Map<string, string | null>();
  const concurrency = 5;
  for (let i = 0; i < trackIds.length; i += concurrency) {
    const batch = trackIds.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async id => {
      const url = await fetchPreviewFromEmbed(id);
      return { id, url };
    }));
    for (const r of results) previews.set(r.id, r.url);
  }

  return trackIds.map(id => ({
    id,
    previewUrl: previews.get(id) ?? null,
    durationMs: durations.get(id) ?? 0,
  }));
}
