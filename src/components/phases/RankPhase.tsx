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

  const tierColors: Record<number, string> = { 1: '#ffd60a', 2: '#4cc9f0', 3: '#7c8fa6' };
  const tierBgColors: Record<number, string> = { 1: 'rgba(255,214,10,0.12)', 2: 'rgba(76,201,240,0.12)', 3: 'rgba(124,143,166,0.1)' };
  const tierLabels: Record<number, string> = { 1: '💛 Tier 1 — 최애', 2: '👍 Tier 2 — 선호', 3: '🎵 Tier 3 — 보통' };

  const numColor = (r: number) => r === 1 ? '#ffd60a' : r === 2 ? '#b0bec5' : r === 3 ? '#ff8a65' : '#556070';
  const numSize = (r: number) => r <= 3 ? '0.9rem' : '0.85rem';

  let curTier: number | null = null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>🏆 랭킹</div>
          <div style={{ fontSize: '0.82rem', color: '#8899aa' }}>
            {tracks.length}곡 · 비교 {compCount}회 · 최애: {c1}곡 / 선호: {c2}곡 / 보통: {c3}곡
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'sort' })}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem' }}>
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
                {tierLabels[track.tier]}  ({sorted.filter(t => t.tier === track.tier).length}곡)
              </div>
            )}
            <a
              href={`https://open.spotify.com/track/${track.id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, transition: 'all 0.15s', textDecoration: 'none', color: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#3a3a54'; e.currentTarget.style.background = '#1c1c2c'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.background = '#14141f'; }}
              aria-label={`${track.name} — Spotify에서 열기`}
            >
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: numSize(grank), color: numColor(grank), minWidth: 36, textAlign: 'right' }}>#{grank}</div>
              <img src={track.image} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.isNew && '✦ '}{track.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#8899aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.artists.join(', ')}{track.album ? ' · ' + track.album : ''}
                </div>
              </div>
              {track.tier && (
                <div style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, fontFamily: '"DM Mono", monospace', flexShrink: 0, background: tierBgColors[track.tier], color: tierColors[track.tier] }}>T{track.tier}</div>
              )}
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.88rem', color: '#00e87a', minWidth: 52, textAlign: 'right' }}>{Math.round(track.rating)}</div>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.75rem', color: '#556070', minWidth: 32, textAlign: 'right' }} title={`${track.comparisons}회 비교`}>{track.comparisons}x</div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
