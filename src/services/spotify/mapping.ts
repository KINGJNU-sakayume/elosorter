// Spotify API 응답 → 도메인 객체. 응답 모양을 신뢰하지 않고 필드마다 검사한다.

import type { Track } from '../../core/types';
import type { SpotifyPlaylist, SpotifyUser } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

interface Image { url: string; width: number | null }

function images(v: unknown): Image[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map(i => ({ url: str(i.url), width: typeof i.width === 'number' ? i.width : null }))
    .filter(i => i.url);
}

/** 목록용 작은 이미지: 320px 이하 중 가장 큰 것 (보통 300px). 레티나에서도 44px 썸네일에 충분하다 */
function pickThumb(list: Image[]): string | undefined {
  const small = list
    .filter(i => i.width !== null && i.width <= 320)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return small[0]?.url ?? list[list.length - 1]?.url;
}

/**
 * /me/tracks, /playlists/{id}/tracks 의 item 또는 /tracks 의 track 객체.
 * 로컬 파일, 삭제된 곡, 팟캐스트 에피소드는 건너뛴다.
 */
export function trackFromItem(item: unknown): Track | null {
  if (!isObj(item)) return null;
  const t = isObj(item.track) ? item.track : item.track === null ? null : item;
  if (!t || typeof t.id !== 'string' || !t.id) return null;
  if (t.is_local === true || item.is_local === true) return null;
  if (typeof t.type === 'string' && t.type !== 'track') return null;

  const album = isObj(t.album) ? t.album : {};
  const art = images(album.images);
  const image = art[0]?.url ?? '';
  const thumb = pickThumb(art);
  const track: Track = {
    id: t.id,
    name: str(t.name) || '(제목 없음)',
    artists: Array.isArray(t.artists)
      ? t.artists.filter(isObj).map(a => str(a.name)).filter(Boolean)
      : [],
    album: str(album.name),
    image,
    uri: str(t.uri) || `spotify:track:${t.id}`,
    addedAt: typeof item.added_at === 'string' ? item.added_at : null,
    tier: null,
    rating: 1500,
    comparisons: 0,
    isNew: false,
  };
  if (thumb && thumb !== image) track.thumb = thumb;
  if (typeof t.duration_ms === 'number' && t.duration_ms > 0) track.durationMs = t.duration_ms;
  return track;
}

/** 플레이리스트에 같은 곡이 두 번 들어 있으면 첫 번째만 남긴다 */
export function uniqueTracks(items: readonly unknown[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const item of items) {
    const t = trackFromItem(item);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

export function userFromMe(me: unknown): SpotifyUser | null {
  if (!isObj(me) || typeof me.id !== 'string') return null;
  const avatar = images(me.images);
  return {
    id: me.id,
    displayName: str(me.display_name) || me.id,
    imageUrl: pickThumb(avatar) ?? '',
  };
}

export function playlistFromItem(p: unknown): SpotifyPlaylist | null {
  if (!isObj(p) || typeof p.id !== 'string' || !p.id) return null;
  // 2024-11 이후 응답에서 tracks 대신 items 로 개수를 주는 경우도 있어 둘 다 확인
  const counter = isObj(p.tracks) ? p.tracks : isObj(p.items) ? p.items : {};
  return {
    id: p.id,
    name: str(p.name) || '(이름 없음)',
    imageUrl: pickThumb(images(p.images)) ?? '',
    trackCount: typeof counter.total === 'number' ? counter.total : 0,
    owner: isObj(p.owner) ? str(p.owner.display_name) || str(p.owner.id) : '',
  };
}
