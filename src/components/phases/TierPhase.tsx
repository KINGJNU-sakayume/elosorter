import { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { loadConfig, saveState, serializeState } from '../../utils/config';
import { saveToSupabase } from '../../utils/supabase';
import type { PlayerState } from '../../utils/types';

interface Props {
  player: PlayerState & { play: (uri: string) => Promise<void>; toggle: () => void };
}

// 자동 저장: N번 배정마다 저장
const AUTOSAVE_EVERY_N = 10;

export default function TierPhase({ player }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { tracks, tierHistory } = state;
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState(0);
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

  const unsavedCount = done - lastSavedCount;
  const hasUnsaved = unsavedCount > 0;

  // 저장 함수 (중복 호출 방지용 ref)
  const savingRef = useRef(false);
 const runCloudSave = useCallback(async (reason: 'auto' | 'manual' | 'done') => {
    if (savingRef.current) return;
    if (!cfg.supabaseUrl || !cfg.anonKey) return; // supabase 미설정이면 조용히 skip
    const userId = state.user?.id;
    if (!userId) return; // 로그인 전이면 skip
    savingRef.current = true;
    setSaveStatus('saving');
    const data = serializeState(state);
    const currentDone = state.tracks.filter(t => t.tier !== null).length;
    try {
      const r = await saveToSupabase(data, cfg, userId);
      setSaveStatus(r.ok ? 'ok' : 'error');
      if (r.ok) {
        setLastSavedAt(new Date());
        setLastSavedCount(currentDone);
        if (reason === 'manual') showToast('☁️ Supabase에 저장됨');
        else if (reason === 'done') showToast('☁️ Supabase에 저장됨');
      } else if (reason === 'manual') {
        showToast('❌ 저장 실패 — 네트워크를 확인해주세요');
      }
    } finally {
      savingRef.current = false;
    }
  }, [cfg, state, showToast]);

  // Auto-play on track change
  useEffect(() => {
    if (!currentTrack) return;
    if (player.ready && !player.sdkFailed) {
      player.play(currentTrack.uri || `spotify:track:${currentTrack.id}`).catch(() => {});
    }
  }, [currentTrack?.id]);

  // 분류 완료시 한번 저장
  useEffect(() => {
    if (!allDone || !tracks.length) return;
    saveState(serializeState(state));
    runCloudSave('done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  // 자동저장: N번 배정마다 저장
  useEffect(() => {
    if (done === 0 || allDone) return;
    if (unsavedCount >= AUTOSAVE_EVERY_N) {
      runCloudSave('auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // 이탈 경고: 미저장 변경사항이 있는 상태로 탭 닫을 때
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  const assignTier = useCallback((tier: 1 | 2 | 3) => {
    if (!currentTrack) return;
    dispatch({ type: 'ASSIGN_TIER', payload: { id: currentTrack.id, tier } });
    saveState(serializeState(state));
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

  // 저장 상태 표시 헬퍼
  function SaveStatusIndicator() {
    if (!cfg.supabaseUrl) {
      return <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 로컬만 저장</span>;
    }
    if (saveStatus === 'saving') {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', color: 'var(--accent)', fontFamily: '"DM Mono", monospace' }}><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />저장 중…</span>;
    }
    if (saveStatus === 'error') {
      return <span style={{ fontSize: '0.74rem', color: 'var(--danger)', fontFamily: '"DM Mono", monospace' }}>⚠ 저장 실패</span>;
    }
    if (hasUnsaved) {
      return <span style={{ fontSize: '0.74rem', color: 'var(--warning)', fontFamily: '"DM Mono", monospace' }}>● 미저장 {unsavedCount}곡</span>;
    }
    if (lastSavedAt) {
      const mins = Math.floor((Date.now() - lastSavedAt.getTime()) / 60000);
      const label = mins < 1 ? '방금' : `${mins}분 전`;
      return <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 저장됨 · {label}</span>;
    }
    return <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 준비됨</span>;
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      {/* Progress */}
      <div style={{ background: 'var(--bg-sub)', borderRadius: 99, height: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 99, background: 'var(--accent)', width: `${progPct}%`, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ background: 'var(--bg-sub)', borderRadius: 99, height: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 99, background: 'var(--accent-border)', width: `${totalPct}%`, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <span>{done} / {tracks.length} 완료</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SaveStatusIndicator />
          {!allDone && done > 0 && cfg.supabaseUrl && (
            <button
              onClick={() => runCloudSave('manual')}
              disabled={saveStatus === 'saving' || !hasUnsaved}
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid ' + (hasUnsaved ? 'var(--accent-border)' : 'var(--border)'),
                background: 'transparent',
                color: hasUnsaved ? 'var(--accent)' : 'var(--text-tertiary)',
                cursor: (saveStatus === 'saving' || !hasUnsaved) ? 'default' : 'pointer',
                fontSize: '0.72rem', fontFamily: '"DM Mono", monospace',
                opacity: (saveStatus === 'saving' || !hasUnsaved) ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              ☁ 지금 저장
            </button>
          )}
          <span>{allDone ? '완료!' : `남은 곡: ${untiered.length}`}</span>
        </div>
      </div>

      {allDone ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }} className="animate-fade">
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>티어 분류 완료!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>최애: {c1}곡 · 선호: {c2}곡 · 보통: {c3}곡</p>

          {saveStatus === 'saving' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}><span className="spinner" />Supabase에 저장 중…</div>}
          {saveStatus === 'error' && (
            <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>☁️ 저장 실패 — 네트워크를 확인해주세요</span>
              <button onClick={() => runCloudSave('manual')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem' }}>재시도</button>
            </div>
          )}
          {saveStatus === 'ok' && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>☁️ 저장됨</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
            <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'sort' })} style={{ padding: '13px 28px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: '#000', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
              비교 정렬 시작 →
            </button>
            <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'tier' })} style={{ padding: '11px 28px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer' }}>
              티어 다시 확인하기
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'start' }}>
          {/* Cover card */}
          <div>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: 20, overflow: 'hidden', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
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
                    {currentTrack?.isNew && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', fontFamily: '"DM Mono", monospace', marginBottom: 8 }}>✦ 신규 추가</div>}
                    <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '1.15rem', lineHeight: 1.3, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3, textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>{currentTrack?.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack?.artists.join(', ')}</div>
                    <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack?.album}</div>
                  </div>
                  {!player.sdkFailed && (
                    <button onClick={player.toggle} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 18px var(--accent-border)' }}>
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
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 16 }}>티어 선택 (키보드: 1 / 2 / 3)</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { tier: 1 as const, label: '💛 Tier 1 — 최애', sub: '상위 10% · P_mid = 0.95', init: '≈1829', color: 'var(--tier-1)', border: 'var(--tier-1-border)', hover: 'var(--tier-1-soft)' },
                { tier: 2 as const, label: '👍 Tier 2 — 선호', sub: '중위 40% · P_mid = 0.70', init: '≈1605', color: 'var(--tier-2)', border: 'var(--tier-2-border)', hover: 'var(--tier-2-soft)' },
                { tier: 3 as const, label: '🎵 Tier 3 — 보통', sub: '하위 50% · P_mid = 0.25', init: '≈1365', color: 'var(--tier-3)', border: 'var(--tier-3-border)', hover: 'var(--tier-3-soft)' },
              ].map(b => (
                <button key={b.tier} onClick={() => assignTier(b.tier)}
                  style={{ ...S.tierBtn(b.color, b.border) }}
                  onMouseEnter={e => (e.currentTarget.style.background = b.hover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(128,128,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Mono", monospace', fontSize: '0.8rem', flexShrink: 0 }}>{b.tier}</div>
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
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', opacity: tierHistory.length === 0 ? 0.4 : 1 }}>
                ↩ 되돌리기 (Z)
              </button>
              {done > 0 && (
                <button onClick={() => dispatch({ type: 'BULK_ASSIGN_REMAINING', payload: { tier: 3 } })}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.8rem' }}>
                  나머지 Tier 3으로 →
                </button>
              )}
            </div>

            {/* Stats - 4개 차트 버전 */}
            <div style={{ padding: 16, background: 'var(--bg-section)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>분류 현황</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: '"DM Mono", monospace' }}>{done} / {tracks.length}</span>
              </div>

              {/* ① 상단 스택 바 — 분류된 곡 중의 상대 비율 */}
              {done > 0 ? (
                <>
                  <div style={{ position: 'relative', marginBottom: 6 }}>
                    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-sub)' }}>
                      <div style={{ width: `${(c1 / done) * 100}%`, background: 'var(--tier-1)', transition: 'width 0.3s' }} />
                      <div style={{ width: `${(c2 / done) * 100}%`, background: 'var(--tier-2)', transition: 'width 0.3s' }} />
                      <div style={{ width: `${(c3 / done) * 100}%`, background: 'var(--tier-3)', transition: 'width 0.3s' }} />
                    </div>
                    {/* 이상적 분포 경계 마커 (10%, 50%) */}
                    <div style={{ position: 'absolute', left: '10%', top: -3, bottom: -3, width: 2, background: 'var(--text-primary)', opacity: 0.55, borderRadius: 1 }} />
                    <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 2, background: 'var(--text-primary)', opacity: 0.55, borderRadius: 1 }} />
                  </div>
                  <div style={{ position: 'relative', height: 14, marginBottom: 18, fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>
                    <span style={{ position: 'absolute', left: '10%', transform: 'translateX(-50%)' }}>목표 10%</span>
                    <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>목표 50%</span>
                  </div>
                </>
              ) : (
                <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-sub)', marginBottom: 18 }} />
              )}

              {/* ②③④ 각 tier별 독립 진척 바 */}
              {[
                { label: '💛 Tier 1 최애', val: c1, ratio: 0.10, color: 'var(--tier-1)' },
                { label: '👍 Tier 2 선호', val: c2, ratio: 0.40, color: 'var(--tier-2)' },
                { label: '🎵 Tier 3 보통', val: c3, ratio: 0.50, color: 'var(--tier-3)' },
              ].map(t => {
                const target = Math.round(tracks.length * t.ratio);
                const fillPct = target > 0 ? Math.min(100, (t.val / target) * 100) : 0;
                const curPct = done > 0 ? Math.round((t.val / done) * 100) : 0;
                const targetPct = Math.round(t.ratio * 100);
                return (
                  <div key={t.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', color: t.color }}>{t.label}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: '"DM Mono", monospace' }}>
                        {t.val}곡 <span style={{ opacity: 0.55 }}>/ 목표 {target}곡</span>
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-sub)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${fillPct}%`, background: t.color, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace', marginTop: 3 }}>
                      현재 {curPct}% <span style={{ opacity: 0.5 }}>(목표 {targetPct}%)</span>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>미분류</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace', fontWeight: 500 }}>{untiered.length}곡</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
