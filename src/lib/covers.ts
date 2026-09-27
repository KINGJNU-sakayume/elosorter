import type { Track } from '../core/types';

/**
 * 세션을 대표하는 앨범 아트 몇 장: 순위가 높은 곡부터(분류한 곡이 모자라면 목록 앞에서부터).
 * 같은 이미지는 한 번만 쓴다 (같은 앨범의 곡이 모자이크를 채우지 않게).
 */
export function coverImages(tracks: readonly Track[], { count = 4, large = false } = {}): string[] {
  const tiered = tracks.filter(t => t.tier !== null);
  const pool = tiered.length >= count ? [...tiered].sort((a, b) => b.rating - a.rating) : tracks;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of pool) {
    const img = large ? t.image || t.thumb : t.thumb ?? t.image;
    if (!img || seen.has(img)) continue;
    seen.add(img);
    out.push(img);
    if (out.length === count) break;
  }
  return out;
}
