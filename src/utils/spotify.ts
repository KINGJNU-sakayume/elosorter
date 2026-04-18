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
 * Spotify embed 페이지에서 preview URL + duration을 함께 추출
 *
 * 2024-11 API 변경으로 공식 API의 preview_url이 null이 됨.
 * embed HTML의 __NEXT_DATA__에는 preview URL뿐 아니라 duration_ms도 들어있어
 * 한 번의 fetch로 둘 다 얻을 수 있음.
 *
 * CORS 대응: 직접 fetch → 실패시 corsproxy.io 경유.
 */
async function fetchDetailsFromEmbed(trackId: string): Promise<{ previewUrl: string | null; durationMs: number }> {
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

      // preview URL 추출
      let previewUrl: string | null = null;
      const previewPatterns = [
        /"audioPreview"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/,
        /"url"\s*:\s*"(https:\/\/p\.scdn\.co\/mp3-preview\/[^"]+)"/,
      ];
      for (const pat of previewPatterns) {
        const m = html.match(pat);
        if (m && m[1]) {
          previewUrl = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          break;
        }
      }

      // duration_ms 추출
      let durationMs = 0;
      const durationPatterns = [
        /"duration(?:_ms)?"\s*:\s*(\d+)/,
        /"durationMs"\s*:\s*(\d+)/,
      ];
      for (const pat of durationPatterns) {
        const m = html.match(pat);
        if (m && m[1]) {
          const val = parseInt(m[1], 10);
          // 곡 길이는 보통 30초 ~ 30분 범위. 이 범위 밖은 무시 (다른 숫자 필드 오매칭 방지)
          if (val >= 15000 && val <= 1800000) {
            durationMs = val;
            break;
          }
        }
      }

      // 하나라도 얻었으면 성공으로 간주
      if (previewUrl || durationMs) {
        return { previewUrl, durationMs };
      }
    } catch (e) {
      // 다음 시도
      console.warn(`[spotify] embed fetch 실패 (${url}):`, e);
    }
  }
  return { previewUrl: null, durationMs: 0 };
}

/**
 * 여러 곡의 preview URL과 duration을 가져옴.
 *
 * 1) 먼저 공식 API에서 duration 시도 (빠름, 배치 처리)
 * 2) embed 파싱으로 preview URL + 혹시 못 가져온 duration 보강
 */
export async function fetchTrackDetails(
  trackIds: string[],
  getToken: () => Promise<string | null>
): Promise<{ id: string; previewUrl: string | null; durationMs: number }[]> {
  if (!trackIds.length) return [];

  // 1) 공식 API로 duration_ms 가져오기 (50개씩) — 빠른 경로
  const durations = new Map<string, number>();
  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50);
    try {
      const data = await spotifyGet(`/tracks?ids=${chunk.join(',')}`, getToken);
      const tracks = data.tracks as ({ id: string; duration_ms: number } | null)[];
      for (const t of tracks) {
        if (t?.id && t.duration_ms) durations.set(t.id, t.duration_ms);
      }
    } catch (e) {
      console.warn('[spotify] /v1/tracks 호출 실패, embed 파싱에서 duration 시도:', e);
    }
  }

  // 2) embed 파싱 — preview URL (+ 누락된 duration 보강) — 동시 5개 병렬
  const previews = new Map<string, string | null>();
  const concurrency = 5;
  for (let i = 0; i < trackIds.length; i += concurrency) {
    const batch = trackIds.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async id => {
      const { previewUrl, durationMs } = await fetchDetailsFromEmbed(id);
      // embed에서 얻은 duration이 있고 공식 API에서 못 얻었으면 대체
      if (durationMs && !durations.get(id)) durations.set(id, durationMs);
      return { id, previewUrl };
    }));
    for (const r of results) previews.set(r.id, r.previewUrl);
  }

  return trackIds.map(id => ({
    id,
    previewUrl: previews.get(id) ?? null,
    durationMs: durations.get(id) ?? 0,
  }));
}
