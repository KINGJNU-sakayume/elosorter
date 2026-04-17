import { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { computeElo, pairKey, getNextPair, computeRSI } from '../../utils/elo';
import { loadConfig, saveState } from '../../utils/config';
import { saveToSupabase } from '../../utils/supabase';
import type { PlayerState } from '../../utils/types';

interface Props {
  player: PlayerState & { play: (uri: string) => Promise<void>; toggle: () => void };
}

function KeyboardHint({ isFiveStep }: { isFiveStep: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #3a3a54', background: 'transparent', color: '#556070', fontSize: '0.75rem', fontFamily: '"DM Mono", monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="키보드 단축키 보기">?</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 28, zIndex: 50, background: '#1c1c2c', border: '1px solid #3a3a54', borderRadius: 12, padding: 12, fontSize: '0.75rem', fontFamily: '"DM Mono", monospace', color: '#8899aa', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {isFiveStep
            ? [['1', 'A 훨씬'], ['2', 'A 조금'], ['3', '비슷'], ['4', 'B 조금'], ['5', 'B 훨씬']].map(([k, v]) => (
              <div key={k}><span style={{ color: '#00e87a' }}>{k}</span> → {v}</div>
            ))
            : [['← / A / 1', 'A 선택'], ['→ / D / 2', 'B 선택']].map(([k, v]) => (
              <div key={k}><span style={{ color: '#00e87a' }}>{k}</span> → {v}</div>
            ))
          }
        </div>
      )}
    </div>
  );
}

interface CmpCardProps {
  track: { id: string; name: string; artists: string[]; image: string; uri: string; rating: number };
  onClick: () => void;
  locked: boolean;
}

function CmpCard({ track, onClick, locked }: CmpCardProps) {
  return (
    <div onClick={() => !locked && onClick()}
      style={{ background: '#14141f', border: '1.5px solid #2a2a3e', borderRadius: 18, overflow: 'hidden', cursor: locked ? 'default' : 'pointer', transition: 'all 0.18s', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={e => { if (!locked) { e.currentTarget.style.borderColor = '#00e87a'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 0 0 1px #00e87a, 0 8px 32px rgba(0,232,122,0.1)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', overflow: 'hidden' }}>
        <img src={track.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ padding: 16, flex: 1 }}>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.3, marginBottom: 4 }}>{track.name}</div>
        <div style={{ fontSize: '0.8rem', color: '#8899aa', marginBottom: 8 }}>{track.artists.join(', ')}</div>
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.78rem', color: '#556070', display: 'flex', justifyContent: 'space-between' }}>
          <span>ELO</span>
          <span style={{ color: '#00e87a', fontSize: '0.85rem' }}>{Math.round(track.rating)}</span>
        </div>
      </div>
    </div>
  );
}

export default function SortPhase({ player }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { tracks, curPair, isChoosing, compCount, rsiDeltas, seenPairs, currentSource } = state;
  const cfg = loadConfig();

  const tiered = tracks.filter(t => t.tier !== null);
  const rsi = computeRSI(rsiDeltas);
  const A = curPair?.[0];
  const B = curPair?.[1];
  const isFiveStep = A && B ? Math.abs(A.rating - B.rating) < 150 : false;

  const handleChoose = useCallback(async (scoreA: number) => {
    if (isChoosing || !curPair) return;
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
    dispatch({ type: 'CHOOSE_DONE', payload: { updatedA, updatedB, rsiDelta: avgDelta, newPairKey: key, nextPair, newSeenPairs: newSeen } });
    saveState({ tracks: newTracks, compCount: compCount + 1, rsiDeltas: [...rsiDeltas, avgDelta].slice(-100), currentSource });
  }, [isChoosing, curPair, dispatch, seenPairs, tracks, compCount, rsiDeltas, currentSource]);

  async function handleSaveAndExit() {
    const data = { tracks, compCount, rsiDeltas, currentSource };
    await saveToSupabase(data, cfg);
    saveState(data);
    showToast('☁️ 저장됨');
    dispatch({ type: 'SET_PHASE', payload: 'import' });
  }

  useKeyboard({ phase: 'sort', isFiveStep, isChoosing, onChoose: handleChoose, onAssignTier: () => {}, onUndo: () => {} });

  const rsiFill = rsi !== null ? Math.max(0, Math.min(100, (1 - rsi / 50) * 100)) : 0;
  const rsiColor = rsi !== null ? (rsi < 10 ? '#00e87a' : rsi < 25 ? '#ffa94d' : '#ff6b6b') : '#ff6b6b';

  const fiveStepBtns = [
    { label: 'A가 훨씬 좋다', key: '1', score: 1.0, side: 'left' },
    { label: 'A가 조금 좋다', key: '2', score: 0.7, side: 'left' },
    { label: '비슷하다',       key: '3', score: 0.5, side: 'center' },
    { label: 'B가 조금 좋다', key: '4', score: 0.3, side: 'right' },
    { label: 'B가 훨씬 좋다', key: '5', score: 0.0, side: 'right' },
  ];

  if (!A || !B) {
    return (
      <div style={{ maxWidth: '60%', margin: '0 auto', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ textAlign: 'center', color: '#8899aa' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <p>티어 분류를 먼저 완료해주세요</p>
          <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'tier' })} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer' }}>티어 분류로 →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '60%', margin: '0 auto', height: 'calc(100vh - 56px)', padding: 24, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>비교 정렬</div>
          <div style={{ fontSize: '0.82rem', color: '#8899aa', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>⚔️ 비교 횟수: <strong>{compCount}</strong>회</span>
            <span>📊 티어 분류: <strong>{tiered.length}</strong>곡</span>
            {rsi !== null && rsi < 10 && <span>✅ 수렴 달성</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <KeyboardHint isFiveStep={isFiveStep} />
          <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, fontFamily: '"DM Mono", monospace', ...(isFiveStep ? { background: 'rgba(0,232,122,0.12)', color: '#00e87a', border: '1px solid rgba(0,232,122,0.3)' } : { background: 'rgba(255,107,107,0.15)', color: '#ff9999', border: '1px solid rgba(255,107,107,0.3)' }) }}>
            {isFiveStep ? '5단계 선택' : '이진 선택'}
          </div>
          <button onClick={handleSaveAndExit} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #2a2a3e', background: 'transparent', color: '#556070', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            저장 후 나가기
          </button>
        </div>
      </div>

      {/* RSI bar */}
      <div style={{ background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: '0.8rem', color: '#8899aa', whiteSpace: 'nowrap' }}>수렴 (RSI)</span>
        <div style={{ flex: 1, background: '#0f0f1a', height: 6, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: rsiColor, width: `${rsiFill}%`, transition: 'width 0.6s ease, background 0.6s' }} />
        </div>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.82rem', minWidth: 60, textAlign: 'right', color: rsiColor }}>{rsi !== null ? rsi.toFixed(1) + ' pt' : '—'}</span>
        <span style={{ fontSize: '0.75rem', color: '#556070', whiteSpace: 'nowrap' }}>목표: &lt;10점</span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, minHeight: 0, marginBottom: 16 }}>
        {!isFiveStep ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: '100%' }}>
            <CmpCard track={A} onClick={() => handleChoose(1.0)} locked={isChoosing} />
            <CmpCard track={B} onClick={() => handleChoose(0.0)} locked={isChoosing} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24, alignItems: 'stretch', height: '100%' }}>
            <CmpCard track={A} onClick={() => {}} locked={true} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.75rem', color: '#556070', textAlign: 'center', marginBottom: 4, letterSpacing: '0.1em' }}>A &nbsp; VS &nbsp; B</div>
              {fiveStepBtns.map(b => (
                <button key={b.score} onClick={() => handleChoose(b.score)} disabled={isChoosing}
                  style={{ width: 168, padding: '10px 14px', borderRadius: 10, border: '1px solid ' + (b.side === 'left' ? 'rgba(255,214,10,0.3)' : b.side === 'right' ? 'rgba(76,201,240,0.3)' : '#2a2a3e'), background: '#1c1c2c', color: '#f0f0f8', fontFamily: '"DM Sans", sans-serif', fontSize: '0.82rem', fontWeight: 500, cursor: isChoosing ? 'not-allowed' : 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...(b.side === 'left' ? { borderLeft: '3px solid #ffd60a' } : b.side === 'right' ? { borderRight: '3px solid #4cc9f0', borderLeft: 'none' } : {}), opacity: isChoosing ? 0.5 : 1 }}
                >
                  <span>{b.label}</span>
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.7rem', color: '#556070' }}>{b.key}</span>
                </button>
              ))}
            </div>
            <CmpCard track={B} onClick={() => {}} locked={true} />
          </div>
        )}
      </div>

      {/* Hint */}
      {!isFiveStep && <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#556070', marginBottom: 16, flexShrink: 0 }}>클릭하거나 <kbd style={{ fontFamily: '"DM Mono", monospace', background: '#242436', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem' }}>←</kbd> / <kbd style={{ fontFamily: '"DM Mono", monospace', background: '#242436', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem' }}>→</kbd> 키로 선택</div>}

      {/* Spotify embeds + SDK play buttons */}
      <div style={{ flexShrink: 0, marginBottom: 20 }}>
        {!player.sdkFailed && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button onClick={() => player.play(A.uri)} style={{ padding: '8px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ▶ A 재생 (전곡)
            </button>
            <button onClick={() => player.play(B.uri)} style={{ padding: '8px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ▶ B 재생 (전곡)
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <iframe src={`https://open.spotify.com/embed/track/${A.id}?utm_source=generator&theme=0`} width="100%" height="80" style={{ border: 'none', borderRadius: 10, display: 'block' }} allow="autoplay; clipboard-write; encrypted-media" loading="lazy" />
          <iframe src={`https://open.spotify.com/embed/track/${B.id}?utm_source=generator&theme=0`} width="100%" height="80" style={{ border: 'none', borderRadius: 10, display: 'block' }} allow="autoplay; clipboard-write; encrypted-media" loading="lazy" />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'rank' })} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem' }}>🏆 현재 랭킹 보기</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => { await saveToSupabase({ tracks, compCount, rsiDeltas, currentSource }, cfg); showToast('☁️ 저장됨'); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.8rem' }}>☁️ 저장</button>
          <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'rank' })} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#00e87a', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>완료 →</button>
        </div>
      </div>
    </div>
  );
}
