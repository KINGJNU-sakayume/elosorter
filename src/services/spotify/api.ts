import type { Source, Track } from '../../core/types';
import { auth } from './auth';
import { playlistFromItem, uniqueTracks, userFromMe } from './mapping';
import type { SpotifyPlaylist, SpotifyUser } from './types';

const API = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 401이면 토큰을 한 번 갱신, 429/5xx면 기다렸다가 재시도 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let refreshed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await auth.getToken();
    if (!token) throw new SpotifyApiError(401, 'Spotify 로그인이 필요합니다');
    const res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (res.ok) {
      return (res.status === 204 || !res.headers.get('content-type')?.includes('json')
        ? null
        : await res.json()) as T;
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      auth.invalidate();
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** attempt);
      continue;
    }
    throw new SpotifyApiError(res.status, `Spotify API 오류 (${res.status})`);
  }
  throw new SpotifyApiError(429, 'Spotify 요청이 너무 많습니다. 잠시 후 다시 시도하세요');
}

interface Page {
  items?: unknown[];
  total?: number;
  limit?: number;
}

function withOffset(path: string, offset: number): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('offset', String(offset));
  return `${base}?${params}`;
}

/**
 * 첫 페이지로 전체 개수를 알아낸 뒤 나머지 페이지를 동시에 최대 4개씩 받는다.
 * (v1은 50곡씩 순차 요청이라 2,000곡이면 40번을 차례로 기다렸다.)
 */
async function getAllPages(
  path: string,
  onProgress?: (loaded: number, total: number) => void,
  concurrency = 4,
): Promise<unknown[]> {
  const first = await request<Page>(path);
  const pages: unknown[][] = [first.items ?? []];
  const limit = first.limit || 50;
  const total = first.total ?? pages[0].length;
  let loaded = pages[0].length;
  onProgress?.(loaded, total);

  const offsets: number[] = [];
  for (let off = limit; off < total; off += limit) offsets.push(off);
  let cursor = 0;
  const worker = async () => {
    while (cursor < offsets.length) {
      const i = cursor++;
      const page = await request<Page>(withOffset(path, offsets[i]));
      pages[i + 1] = page.items ?? [];
      loaded += pages[i + 1].length;
      onProgress?.(Math.min(loaded, total), total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, offsets.length) }, worker));
  return pages.flat();
}

const PLAYLIST_FIELDS =
  'total,limit,items(added_at,is_local,track(id,name,uri,type,is_local,duration_ms,artists(name),album(name,images)))';

export function playlistIdOf(source: Source): string | null {
  return source.startsWith('playlist:') ? source.slice('playlist:'.length) : null;
}

function sourcePath(source: Source): string {
  const playlistId = playlistIdOf(source);
  return playlistId
    ? `/playlists/${playlistId}/tracks?limit=50&fields=${encodeURIComponent(PLAYLIST_FIELDS)}`
    : '/me/tracks?limit=50';
}

export async function fetchSourceTracks(
  source: Source,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Track[]> {
  return uniqueTracks(await getAllPages(sourcePath(source), onProgress));
}

export async function fetchMe(): Promise<SpotifyUser> {
  const user = userFromMe(await request('/me'));
  if (!user) throw new SpotifyApiError(500, '프로필을 읽을 수 없습니다');
  return user;
}

export async function fetchPlaylists(): Promise<SpotifyPlaylist[]> {
  const items = await getAllPages('/me/playlists?limit=50');
  return items.map(playlistFromItem).filter((p): p is SpotifyPlaylist => p !== null);
}

export async function fetchPlaylistName(id: string): Promise<string | null> {
  try {
    const p = await request<{ name?: unknown }>(`/playlists/${id}?fields=name`);
    return typeof p?.name === 'string' ? p.name : null;
  } catch {
    return null;
  }
}

/** 재생 길이가 없는 옛 곡 보강. 엔드포인트가 막혀 있으면(403/404) 조용히 중단 */
export async function fetchDurations(ids: readonly string[]): Promise<{ id: string; durationMs: number }[]> {
  const out: { id: string; durationMs: number }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const data = await request<{ tracks?: unknown[] }>(`/tracks?ids=${ids.slice(i, i + 50).join(',')}`);
      for (const t of data?.tracks ?? []) {
        const { id, duration_ms } = (t ?? {}) as { id?: unknown; duration_ms?: unknown };
        if (typeof id === 'string' && typeof duration_ms === 'number') out.push({ id, durationMs: duration_ms });
      }
    } catch (e) {
      if (e instanceof SpotifyApiError && (e.status === 403 || e.status === 404)) break;
    }
  }
  return out;
}

/** Web Playback SDK 기기에서 곡 재생. 기기가 막 준비됐을 때의 일시적 404는 한 번 재시도 */
export async function playOnDevice(deviceId: string, uri: string): Promise<void> {
  const call = () =>
    request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    });
  try {
    await call();
  } catch (e) {
    if (!(e instanceof SpotifyApiError) || e.status !== 404) throw e;
    await sleep(600);
    await call();
  }
}
