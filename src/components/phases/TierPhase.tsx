import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { loadConfig, saveState } from '../../utils/config';
import { saveToSupabase } from '../../utils/supabase';
import type { PlayerState } from '../../utils/types';

interface Props {
  player: PlayerState & { play: (uri: string) => Promise<void>; toggle: () => void };
}

export default function TierPhase({ player }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { tracks, tierHistory } = state;
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const cfg = loadConfig();

  const untiered = tracks.filter(t => t.tier === null);
  const done = tracks.length - untiered.length;
  const allDone = untiered.length === 0 && tracks.length > 0;
  const currentTrack = !allDone && untiered.length > 0 ? untiered[0] : null;

  const SESSION_SIZE = 50;
  const sd = done % SESSION_SIZE === 0 && done > 0 ? SESSION_SIZE : done % SESSION_SIZE;
  const progPct = Math.round((sd / SESSION_SIZE) * 100);
  const totalPct = tracks.length > 0 ? Math.round((done / tracks.length) * 100) : 0;

  const c1 = tracks.filter(t => t.tier === 1).length;
  const c2 = tracks.filter(t => t.tier === 2).length;
  const c3 = tracks.filter(t => t.tier === 3).length;

  // Auto-play on track change
  useEffect(() => {
    if (!currentTrack) return;
    if (player.ready && !player.sdkFailed) {
      player.play(currentTrack.uri || `spotify:track:${currentTrack.id}`).catch(() => {});
    }
  }, [currentTrack?.id]);

  // Auto-save when tier done
  useEffect(() => {
    if (!allDone || !tracks.length) return;
    setSaveStatus('saving');
    const data = { tracks: state.tracks, compCount: state.compCount, rsiDeltas: state.rsiDeltas, currentSource: state.currentSource };
    saveState(data);
    saveToSupabase(data, cfg).then(r => {
      setSaveStatus(r.ok ? 'ok' : 'error');
      if (r.ok) showToast('☁️ Supabase에 저장됨');
    });
  }, [allDone]);

  const assignTier = useCallback((tier: 1 | 2 | 3) => {
    if (!currentTrack) return;
    dispatch({ type: 'ASSIGN_TIER', payload: { id: currentTrack.id, tier } });
    saveState({ tracks: state.tracks, compCount: state.compCount, rsiDeltas: state.rsiDeltas, currentSource: state.currentSource });
  }, [currentTrack, dispatch, state]);

  const undoTier = useCallback(() => {
    dispatch({ type: 'UNDO_TIER' });
  }, [dispatch]);

  useKeyboard({
    phase: 'tier',
    isFiveStep: false,
    isChoosing: false,
    onChoose: () => {},
    onAssignTier: assignTier,
    onUndo: undoTier,
  });

  const S = {
    tierBtn: (color: string, borderColor: string) => ({
      width: '100%', padding: '16px 20px', borderRadius: 12,
      border: `1.5px solid ${borderColor}`, background: 'transparent',
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: '"DM Sans", sans-serif', textAlign: 'left' as const,
      color,
    }),
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      {/* Progress */}
      <div style={{ background: '#1c1c2c', borderRadius: 99, height: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 99, background: '#00e87a', width: `${progPct}%`, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ background: '#1c1c2c', borderRadius: 99, height: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 99, background: 'rgba(0,232,122,0.28)', width: `${totalPct}%`, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#8899aa', marginBottom: 24 }}>
        <span>{done} / {tracks.length} 완료</span>
        <span>{allDone ? '완료!' : `남은 곡: ${untiered.length}`}</span>
      </div>

      {allDone ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }} className="animate-fade">
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>티어 분류 완료!</h2>
          <p style={{ color: '#8899aa', marginBottom: 24 }}>최애: {c1}곡 · 선호: {c2}곡 · 보통: {c3}곡</p>

          {saveStatus === 'saving' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8899aa', fontSize: '0.88rem', marginBottom: 16 }}><span className="spinner" />Supabase에 저장 중…</div>}
          {saveStatus === 'error' && (
            <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.4)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#ff6b6b', fontSize: '0.88rem' }}>☁️ 저장 실패 — 네트워크를 확인해주세요</span>
              <button onClick={() => { setSaveStatus('saving'); saveToSupabase({ tracks: state.tracks, compCount: state.compCount, rsiDeltas: state.rsiDeltas, currentSource: state.currentSource }, cfg).then(r => setSaveStatus(r.ok ? 'ok' : 'error')); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,107,107,0.5)', background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem' }}>재시도</button>
            </div>
          )}
          {saveStatus === 'ok' && <div style={{ fontSize: '0.82rem', color: '#8899aa', marginBottom: 16 }}>☁️ 저장됨</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
            <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'sort' })} style={{ padding: '13px 28px', borderRadius: 999, border: 'none', background: '#00e87a', color: '#000', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
              비교 정렬 시작 →
            </button>
            <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'tier' })} style={{ padding: '11px 28px', borderRadius: 999, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', fontSize: '0.9rem', cursor: 'pointer' }}>
              티어 다시 확인하기
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'start' }}>
          {/* Cover card */}
          <div>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: 20, overflow: 'hidden', background: '#14141f', boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }}>
              {currentTrack?.image && <img src={currentTrack.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '56px 18px 18px', background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 45%, transparent 100%)', zIndex: 2 }}>
                {/* EQ bars */}
                {player.isPlaying && player.currentUri === (currentTrack?.uri || `spotify:track:${currentTrack?.id}`) && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 16, marginBottom: 8 }}>
                    {[0,1,2,3,4].map(i => <span key={i} className="eq-bar" />)}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {currentTrack?.isNew && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.4)', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, color: '#00e87a', fontFamily: '"DM Mono", monospace', marginBottom: 8 }}>✦ 신규 추가</div>}
                    <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '1.15rem', lineHeight: 1.3, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3, textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>{currentTrack?.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack?.artists.join(', ')}</div>
                    <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack?.album}</div>
                  </div>
                  {!player.sdkFailed && (
                    <button onClick={player.toggle} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: '#00e87a', color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 18px rgba(0,232,122,0.45)' }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        {player.isPlaying ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></> : <path d="M8 5v14l11-7z"/>}
                      </svg>
                    </button>
                  )}
                </div>
                {/* Mobile embed fallback */}
                {player.sdkFailed && currentTrack && (
                  <iframe src={`https://open.spotify.com/embed/track/${currentTrack.id}?theme=0`} width="100%" height="80" style={{ border: 'none', borderRadius: 10, marginTop: 10 }} allow="autoplay; clipboard-write; encrypted-media" loading="lazy" />
                )}
              </div>
            </div>
          </div>

          {/* Right side */}
          <div>
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#556070', marginBottom: 16 }}>티어 선택 (키보드: 1 / 2 / 3)</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { tier: 1 as const, label: '💛 Tier 1 — 최애', sub: '상위 10% · P_mid = 0.95', init: '≈1829', color: '#ffd60a', border: 'rgba(255,214,10,0.35)', hover: 'rgba(255,214,10,0.12)' },
                { tier: 2 as const, label: '👍 Tier 2 — 선호', sub: '중위 40% · P_mid = 0.70', init: '≈1605', color: '#4cc9f0', border: 'rgba(76,201,240,0.35)', hover: 'rgba(76,201,240,0.12)' },
                { tier: 3 as const, label: '🎵 Tier 3 — 보통', sub: '하위 50% · P_mid = 0.25', init: '≈1365', color: '#7c8fa6', border: 'rgba(124,143,166,0.3)', hover: 'rgba(124,143,166,0.1)' },
              ].map(b => (
                <button key={b.tier} onClick={() => assignTier(b.tier)}
                  style={{ ...S.tierBtn(b.color, b.border) }}
                  onMouseEnter={e => (e.currentTarget.style.background = b.hover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Mono", monospace', fontSize: '0.8rem', flexShrink: 0 }}>{b.tier}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{b.label}</div>
                    <div style={{ fontSize: '0.78rem', opacity: 0.65, marginTop: 2 }}>{b.sub}</div>
                  </div>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.8rem', opacity: 0.5 }}>{b.init}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <button disabled={tierHistory.length === 0} onClick={undoTier}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem', opacity: tierHistory.length === 0 ? 0.4 : 1 }}>
                ↩ 되돌리기 (Z)
              </button>
              {done > 0 && (
                <button onClick={() => { tracks.filter(t => t.tier === null).forEach(t => dispatch({ type: 'ASSIGN_TIER', payload: { id: t.id, tier: 3 } })); }}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: '#556070', cursor: 'pointer', fontSize: '0.8rem' }}>
                  나머지 Tier 3으로 →
                </button>
              )}
            </div>

            {/* Stats */}
            <div style={{ padding: 16, background: '#0f0f1a', borderRadius: 12, border: '1px solid #2a2a3e' }}>
              <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#556070', marginBottom: 12 }}>분류 현황</h4>
              {[{ label: '💛 Tier 1 최애', val: c1, color: '#ffd60a' }, { label: '👍 Tier 2 선호', val: c2, color: '#4cc9f0' }, { label: '🎵 Tier 3 보통', val: c3, color: '#7c8fa6' }, { label: '미분류', val: untiered.length, color: '#556070' }].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.82rem', color: s.color }}>{s.label}</div>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.85rem', fontWeight: 500 }}>{s.val}곡</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
