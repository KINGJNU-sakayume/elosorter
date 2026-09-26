import type { Track } from '../../core/types';
import { exportCsv, today } from '../../services/download';

export function exportRankingCsv(ranked: readonly Track[]): void {
  exportCsv(`elo-ranking-${today()}.csv`, [
    ['rank', 'title', 'artists', 'album', 'tier', 'rating', 'uncertainty', 'comparisons', 'spotify_url'],
    ...ranked.map((t, i) => [
      i + 1,
      t.name,
      t.artists.join(', '),
      t.album,
      t.tier ?? '',
      Math.round(t.rating),
      t.sigma === undefined ? '' : Math.round(t.sigma),
      t.comparisons,
      `https://open.spotify.com/track/${t.id}`,
    ]),
  ]);
}
