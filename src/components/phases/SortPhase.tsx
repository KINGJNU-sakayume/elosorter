import { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { computeElo, pairKey, getNextPair, computeRSI } from '../../utils/elo';
import { loadConfig, saveState } from '../../utils/config';
import { saveToSupabase } from '../../utils/supabase';
import { fetchTrackDetails } from '../../utils/spotify';
import { useSpotifyAuth } from '../../hooks/useSpotifyAuth';
import AudioPlayer, { loadPlayMode } from '../AudioPlayer';
import type { PlayerState, Track } from '../../utils/types';

interface Props {
  player: PlayerState & { play: (uri: string) => Promise<void>; toggle: () => void };
}

const FINE_MODE_THRESHOLD = 150;
const AUTOSAVE_EVERY_N = 10;   // 🆕 티어 분류와 통일

function fmtDuration(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

interface CmpCardProps {
  track: Track;
  onClick: () => void;
  locked: boolean;
  coverClickable: boolean;        // 🆕 빠른 비교 모드에서만 앨범 클릭 허용
  playMode: 'preview' | 'full';
  onPlayModeChange: (m: 'preview' | 'full') => void;
  fullPlayer: PlayerState & { play: (uri: string) => Promise<void>; toggle: () => void };
}

function CmpCard({ track, onClick, locked, coverClickable, playMode, onPlayModeChange, fullPlayer }: CmpCardProps) {
  const fullIsCurrent = fullPlayer.currentUri === (track.uri || `spotify:track:${track.id}`);
  const canClickCover = coverClickable && !locked;
  return (
    <div
      style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18,
        overflow: 'hidden', transition: 'all 0.18s',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}
    >
      <div
        onClick={() => canClickCover && onClick()}
        style={{
          position: 'relative', width: '100%', aspectRatio: '1/1', overflow: 'hidden',
          cursor: canClickCover ? 'pointer' : 'default', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}
        onMouseEnter={e => { if (canClickCover) e.currentTarget.style.opacity = '0.92'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        {track.image && <img src={track.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '1.05rem', lineHeight: 1.25, marginBottom: 3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={track.name}
          >
            {track.name}
          </div>
          <div
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={track.artists.join(', ')}
          >
            {track.artists.join(', ')}
          </div>
          <div
            style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: '"DM Mono", monospace' }}
            title={`${track.album}${track.durationMs ? ' · ' + fmtDuration(track.durationMs) : ''}`}
          >
            {track.album}{track.durationMs ? ` · ${fmtDuration(track.durationMs)}` : ''}
          </div>
        </div>

        <AudioPlayer
          track={track}
          mode={playMode}
          onModeChange={onPlayModeChange}
          fullPlayer={{ ...fullPlayer }}
          fullIsCurrent={fullIsCurrent}
        />
      </div>
    </div>
  );
}

export default function SortPhase({ player }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { tracks, curPair, isChoosing, compCount, rsiDeltas, seenPairs, currentSource, sortHistory } = state;
  const { getToken } = useSpotifyAuth();
  const cfg = loadConfig();

  const rsi = computeRSI(rsiDeltas);
  const A = curPair?.[0];
  const B = curPair?.[1];
  const isFineMode = A && B ? Math.abs(A.rating - B.rating) < FINE_MODE_THRESHOLD : false;

  const [playMode, setPlayMode] = useState<'preview' | 'full'>(loadPlayMode());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState(compCount);

  const unsavedCount = compCount - lastSavedCount;
  const hasUnsaved = unsavedCount > 0;

  const stopAllPlayback = useCallback(() => {
    if (player.isPlaying) {
      player.toggle();
    }
    document.querySelectorAll('audio').forEach(a => {
      try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
    });
  }, [player]);

  // 현재 쌍에 대한 preview_url / duration_ms 보강
  // previewUrl이 undefined이거나 durationMs가 없거나 0이면 보강
  const enrichedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!A || !B) return;
    const needsEnrich = (t: Track) => {
      if (enrichedRef.current.has(t.id)) return false;
      const noPreview = t.previewUrl === undefined;
      const noDuration = !t.durationMs;
      return noPreview || noDuration;
    };
    const need: string[] = [];
    if (needsEnrich(A)) need.push(A.id);
    if (needsEnrich(B)) need.push(B.id);
    if (!need.length) return;
    need.forEach(id => enrichedRef.current.add(id));
    fetchTrackDetails(need, getToken)
      .then(details => { if (details.length) dispatch({ type: 'ENRICH_TRACKS', payload: details }); })
      .catch(e => { console.warn('[SortPhase] 트랙 보강 실패:', e); });
  }, [A?.id, B?.id, A?.durationMs, B?.durationMs, getToken, dispatch]);

  // 저장
  const savingRef = useRef(false);
  const runCloudSave = useCallback(async (reason: 'auto' | 'manual') => {
    if (savingRef.current) return;
    if (!cfg.supabaseUrl || !cfg.anonKey) return;
    const userId = state.user?.id;
    if (!userId) return;  // 로그인 전이면 클라우드 저장 skip (로컬 저장은 유지됨)
    savingRef.current = true;
    setSaveStatus('saving');
    const data = { tracks: state.tracks, compCount: state.compCount, rsiDeltas: state.rsiDeltas, currentSource: state.currentSource };
    const curCompCount = state.compCount;
    try {
      const r = await saveToSupabase(data, cfg, userId);
      setSaveStatus(r.ok ? 'ok' : 'error');
      if (r.ok) {
        setLastSavedAt(new Date());
        setLastSavedCount(curCompCount);
        if (reason === 'manual') showToast('☁️ Supabase에 저장됨');
      } else if (reason === 'manual') {
        showToast('❌ 저장 실패');
      }
    } finally {
      savingRef.current = false;
    }
  }, [cfg, state, showToast]);

  // 🆕 자동저장: 10회 비교마다
  useEffect(() => {
    if (compCount === 0) return;
    if (unsavedCount >= AUTOSAVE_EVERY_N) { runCloudSave('auto'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compCount]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  useEffect(() => {
    return () => { stopAllPlayback(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChoose = useCallback(async (scoreA: number) => {
    if (isChoosing || !curPair) return;
    stopAllPlayback();
    dispatch({ type: 'CHOOSE_START' });
    const [a, b] = curPair;
    const { newRatingA, newRatingB, avgDelta } = computeElo(a, b, scoreA);
    const updatedA = { ...a, rating: newRatingA, comparisons: a.comparisons + 1 };
    const updatedB = { ...b, rating: newRatingB, comparisons: b.comparisons + 1 };
    const key = pairKey(a.id, b.id);
    const newSeen = new Set(seenPairs);
    newSeen.add(key);
    const newTracks = tracks.map(t => t.id === a.id ? updatedA : t.id === b.id ? updatedB : t);
    const nextPair = getNextPair(newTracks, newSeen, key);
    dispatch({
      type: 'CHOOSE_DONE',
      payload: {
        updatedA, updatedB, rsiDelta: avgDelta,
        newPairKey: key, nextPair, newSeenPairs: newSeen,
        prevA: a, prevB: b,
        prevCurPair: curPair,
        prevLastPairKey: state.lastPairKey,
      },
    });
    saveState({ tracks: newTracks, compCount: compCount + 1, rsiDeltas: [...rsiDeltas, avgDelta].slice(-100), currentSource });
  }, [isChoosing, curPair, dispatch, seenPairs, tracks, compCount, rsiDeltas, currentSource, state.lastPairKey, stopAllPlayback]);

  const handleUndo = useCallback(() => {
    if (!sortHistory.length) return;
    stopAllPlayback();
    dispatch({ type: 'UNDO_CHOOSE' });
  }, [dispatch, sortHistory.length, stopAllPlayback]);

  useKeyboard({
    phase: 'sort',
    isFiveStep: isFineMode,
    isChoosing,
    onChoose: handleChoose,
    onAssignTier: () => {},
    onUndo: handleUndo,
  });

  const stability = rsi !== null ? Math.max(0, Math.min(100, Math.round((1 - rsi / 50) * 100))) : 0;
  const stabilityColor = rsi === null ? 'var(--text-tertiary)'
    : stability >= 80 ? 'var(--accent)'
    : stability >= 50 ? 'var(--warning)'
    : 'var(--danger)';
  const isConverged = rsi !== null && rsi < 10;

  const fineBtns = [
    { label: 'A 훨씬 좋다', key: '1', score: 1.0 },
    { label: 'A 약간',      key: '2', score: 0.7 },
    { label: '비슷하다',    key: '3', score: 0.5 },
    { label: 'B 약간',      key: '4', score: 0.3 },
    { label: 'B 훨씬 좋다', key: '5', score: 0.0 },
  ];
  const fastBtns = [
    { label: 'A 선택',    key: '1', score: 1.0 },
    { label: '비슷하다',  key: '2', score: 0.5 },
    { label: 'B 선택',    key: '3', score: 0.0 },
  ];
  const activeBtns = isFineMode ? fineBtns : fastBtns;

  function SaveIndicator() {
    if (!cfg.supabaseUrl) return <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 로컬만 저장</span>;
    if (saveStatus === 'saving') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--accent)', fontFamily: '"DM Mono", monospace' }}><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />저장 중…</span>;
    if (saveStatus === 'error') return <span style={{ fontSize: '0.72rem', color: 'var(--danger)', fontFamily: '"DM Mono", monospace' }}>⚠ 저장 실패</span>;
    if (hasUnsaved) return <span style={{ fontSize: '0.72rem', color: 'var(--warning)', fontFamily: '"DM Mono", monospace' }}>● 미저장 {unsavedCount}회</span>;
    if (lastSavedAt) {
      const mins = Math.floor((Date.now() - lastSavedAt.getTime()) / 60000);
      return <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 저장됨 · {mins < 1 ? '방금' : `${mins}분 전`}</span>;
    }
    return <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: '"DM Mono", monospace' }}>☁ 준비됨</span>;
  }

  if (!A || !B) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>티어 분류를 먼저 완료해주세요</p>
          <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'tier' })} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>티어 분류로 →</button>
        </div>
      </div>
    );
  }

  const modeHint = isFineMode
    ? '두 곡의 점수가 비슷해 세밀한 비교를 요청합니다 — 아래 버튼으로 선택하세요'
    : '점수 차이가 커서 빠른 판단만 요청합니다 — 앨범을 클릭하거나 아래 버튼으로 선택하세요';

  return (
    <div style={{
      maxWidth: 1100, margin: '0 auto',
      height: 'calc(100vh - 56px)',
      padding: '16px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
      overflow: 'hidden',
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            비교 정렬 · <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 500 }}>{compCount + 1}번째 비교</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{isFineMode ? '세밀 비교' : '빠른 비교'}</strong> — {modeHint}
          </div>
        </div>
        <SaveIndicator />
        {cfg.supabaseUrl && (
          <button
            onClick={() => runCloudSave('manual')}
            disabled={saveStatus === 'saving' || !hasUnsaved}
            style={{
              padding: '5px 12px', borderRadius: 6,
              border: '1px solid ' + (hasUnsaved ? 'var(--accent-border)' : 'var(--border)'),
              background: 'transparent',
              color: hasUnsaved ? 'var(--accent)' : 'var(--text-tertiary)',
              cursor: (saveStatus === 'saving' || !hasUnsaved) ? 'default' : 'pointer',
              fontSize: '0.75rem', fontFamily: '"DM Mono", monospace',
              opacity: (saveStatus === 'saving' || !hasUnsaved) ? 0.5 : 1,
            }}
          >☁ 저장</button>
        )}
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}
        title="최근 비교들의 평균 점수 변동. 100%에 가까울수록 순위가 확정됩니다"
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>정렬 안정도</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-sub)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, background: stabilityColor,
            width: `${stability}%`, transition: 'width 0.6s ease, background 0.6s',
          }} />
        </div>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.78rem', minWidth: 50, textAlign: 'right', color: stabilityColor }}>
          {rsi === null ? '—' : `${stability}%`}
        </span>
        {isConverged && (
          <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontFamily: '"DM Mono", monospace', whiteSpace: 'nowrap' }}>
            ✓ 충분히 비교됨
          </span>
        )}
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
      }}>
        <CmpCard
          track={A}
          onClick={() => handleChoose(1.0)}
          locked={isChoosing}
          coverClickable={!isFineMode}
          playMode={playMode}
          onPlayModeChange={setPlayMode}
          fullPlayer={player}
        />
        <CmpCard
          track={B}
          onClick={() => handleChoose(0.0)}
          locked={isChoosing}
          coverClickable={!isFineMode}
          playMode={playMode}
          onPlayModeChange={setPlayMode}
          fullPlayer={player}
        />
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `repeat(${activeBtns.length}, 1fr)`, gap: 8 }}>
        {activeBtns.map(b => (
          <button
            key={b.key}
            onClick={() => handleChoose(b.score)}
            disabled={isChoosing}
            style={{
              padding: '14px 10px', borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.88rem', fontWeight: 500,
              cursor: isChoosing ? 'not-allowed' : 'pointer',
              opacity: isChoosing ? 0.5 : 1,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              position: 'relative',
            }}
            onMouseEnter={e => { if (!isChoosing) { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.background = 'var(--accent-soft)'; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
          >
            <span>{b.label}</span>
            <kbd style={{
              fontFamily: '"DM Mono", monospace', fontSize: '0.7rem',
              padding: '1px 6px', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--bg-sub)', color: 'var(--text-tertiary)',
            }}>{b.key}</kbd>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <button
          onClick={handleUndo}
          disabled={!sortHistory.length}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: sortHistory.length ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            cursor: sortHistory.length ? 'pointer' : 'not-allowed',
            fontSize: '0.8rem',
            opacity: sortHistory.length ? 1 : 0.4,
          }}
        >
          ↩ 되돌리기 <kbd style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.7rem', marginLeft: 4, color: 'var(--text-tertiary)' }}>Z</kbd>
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'rank' })}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid ' + (isConverged ? 'var(--accent-border)' : 'var(--border)'),
            background: isConverged ? 'var(--accent-soft)' : 'transparent',
            color: isConverged ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          랭킹 보기 →
        </button>
      </div>

    </div>
  );
}
