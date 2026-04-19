import { useApp } from '../../context/AppContext';
import type { Track } from '../../utils/types';

export default function RankPhase() {
  const { state, dispatch } = useApp();
  const { tracks, compCount } = state;

  const sorted = [...tracks].sort((a, b) => a.tier !== b.tier ? (a.tier ?? 99) - (b.tier ?? 99) : b.rating - a.rating);
  const allSorted = [...tracks].sort((a, b) => b.rating - a.rating);
  const globalRank: Record<string, number> = {};
  allSorted.forEach((t, i) => { globalRank[t.id] = i + 1; });

  const c1 = tracks.filter(t => t.tier === 1).length;
  const c2 = tracks.filter(t => t.tier === 2).length;
  const c3 = tracks.filter(t => t.tier === 3).length;

  const tierColors: Record<number, string> = { 1: 'var(--tier-1)', 2: 'var(--tier-2)', 3: 'var(--tier-3)' };
  const tierBgColors: Record<number, string> = { 1: 'var(--tier-1-soft)', 2: 'var(--tier-2-soft)', 3: 'var(--tier-3-soft)' };
  const tierLabels: Record<number, string> = { 1: '💛 Tier 1 — 최애', 2: '👍 Tier 2 — 선호', 3: '🎵 Tier 3 — 보통' };

  const numColor = (r: number) => r === 1 ? 'var(--tier-1)' : r === 2 ? 'var(--rank-2)' : r === 3 ? 'var(--rank-3)' : 'var(--text-tertiary)';
  const numSize = (r: number) => r <= 3 ? '0.9rem' : '0.85rem';

  let curTier: number | null = null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>🏆 랭킹</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {tracks.length}곡 · 비교 {compCount}회 · 최애: {c1}곡 / 선호: {c2}곡 / 보통: {c3}곡
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'sort' })}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>
            ⚔️ 계속 정렬
          </button>
        </div>
      </div>

      {sorted.map((track: Track) => {
        const grank = globalRank[track.id];
        const isNewTier = track.tier !== curTier;
        if (isNewTier) curTier = track.tier;

        return (
          <div key={track.id}>
            {isNewTier && track.tier && (
              <div style={{ padding: '8px 14px', borderRadius: 8, background: tierBgColors[track.tier], color: tierColors[track.tier], fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>
                {tierLabels[track.tier]}  ({track.tier === 1 ? c1 : track.tier === 2 ? c2 : c3}곡)
              </div>
            )}
            <a
              href={`https://open.spotify.com/track/${track.id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, transition: 'all 0.15s', textDecoration: 'none', color: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-sub)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
              aria-label={`${track.name} — Spotify에서 열기`}
            >
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: numSize(grank), color: numColor(grank), minWidth: 36, textAlign: 'right' }}>#{grank}</div>
              <img src={track.image} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.isNew && '✦ '}{track.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.artists.join(', ')}{track.album ? ' · ' + track.album : ''}
                </div>
              </div>
              {track.tier && (
                <div style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, fontFamily: '"DM Mono", monospace', flexShrink: 0, background: tierBgColors[track.tier], color: tierColors[track.tier] }}>T{track.tier}</div>
              )}
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.88rem', color: 'var(--accent)', minWidth: 52, textAlign: 'right' }}>{Math.round(track.rating)}</div>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: 32, textAlign: 'right' }} title={`${track.comparisons}회 비교`}>{track.comparisons}x</div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
