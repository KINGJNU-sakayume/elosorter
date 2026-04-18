import { useEffect, useRef, useState } from 'react';
import type { Track } from '../utils/types';

type PlayMode = 'preview' | 'full';

const MODE_KEY = 'playMode';

export function loadPlayMode(): PlayMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'full' ? 'full' : 'preview';
  } catch { return 'preview'; }
}

function savePlayMode(m: PlayMode) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
}

function fmtTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

interface FullPlayer {
  isPlaying: boolean;
  currentUri: string | null;
  play: (uri: string) => Promise<void>;
  toggle: () => void;
  ready: boolean;
  sdkFailed: boolean;
}

interface Props {
  track: Track;
  mode: PlayMode;
  onModeChange: (m: PlayMode) => void;
  fullPlayer: FullPlayer;
  // 현재 이 플레이어가 전곡 모드에서 이 트랙을 재생 중인지 (부모가 판단해서 전달)
  fullIsCurrent: boolean;
}

export default function AudioPlayer({ track, mode, onModeChange, fullPlayer, fullIsCurrent }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const hasPreview = !!track.previewUrl;
  const effectiveMode: PlayMode = (mode === 'preview' && !hasPreview) ? 'full' : mode;

  // 트랙이 바뀌면 프리뷰 자동 정지
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPreviewPlaying(false);
    setPreviewCurrent(0);
  }, [track.id]);

  // 모드 변경시 저장
  function changeMode(m: PlayMode) {
    if (m === 'preview' && !hasPreview) return;  // 프리뷰 없는 곡은 이 모드 금지
    // 전환시 둘 다 정지
    const a = audioRef.current;
    if (a) { a.pause(); a.currentTime = 0; setPreviewPlaying(false); setPreviewCurrent(0); }
    onModeChange(m);
    savePlayMode(m);
  }

  // 프리뷰 재생 토글
  function togglePreview() {
    const a = audioRef.current;
    if (!a || !track.previewUrl) return;
    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  // 전곡 재생 토글
  function toggleFull() {
    if (fullIsCurrent) {
      fullPlayer.toggle();
    } else {
      fullPlayer.play(track.uri || `spotify:track:${track.id}`);
    }
  }

  // 진행바 탐색 (프리뷰만 — SDK는 외부 제어 어려움)
  function seekPreview(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(a.duration, a.duration * ratio));
  }

  const isPlaying = effectiveMode === 'preview' ? previewPlaying : (fullIsCurrent && fullPlayer.isPlaying);
  const toggle = effectiveMode === 'preview' ? togglePreview : toggleFull;

  // 진행 표시 값
  let progressPct = 0;
  let timeLabel = '0:00';
  let totalLabel = '';
  if (effectiveMode === 'preview') {
    const dur = audioRef.current?.duration || 30;
    progressPct = (previewCurrent / dur) * 100;
    timeLabel = fmtTime(previewCurrent * 1000);
    totalLabel = fmtTime(dur * 1000);
  } else {
    // 전곡 모드: 진행도는 SDK에서 안 받으므로 간단히 재생 상태만 표시
    progressPct = isPlaying ? 50 : 0;  // 애니메이션 대체로 불확정 표시
    timeLabel = '';
    totalLabel = fmtTime(track.durationMs ?? 0);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 숨겨진 audio 요소 (프리뷰 재생) */}
      {hasPreview && (
        <audio
          ref={audioRef}
          src={track.previewUrl ?? undefined}
          preload="none"
          onPlay={() => setPreviewPlaying(true)}
          onPause={() => setPreviewPlaying(false)}
          onEnded={() => { setPreviewPlaying(false); setPreviewCurrent(0); }}
          onTimeUpdate={e => setPreviewCurrent(e.currentTarget.currentTime)}
        />
      )}

      {/* 재생 컨트롤 + 진행바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={toggle}
          disabled={effectiveMode === 'full' && (fullPlayer.sdkFailed || !fullPlayer.ready)}
          aria-label={isPlaying ? '일시정지' : '재생'}
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            border: 'none', background: 'var(--accent)', color: '#000',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (effectiveMode === 'full' && (fullPlayer.sdkFailed || !fullPlayer.ready)) ? 0.4 : 1,
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            {isPlaying
              ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
              : <path d="M8 5v14l11-7z"/>}
          </svg>
        </button>

        {/* 진행바 */}
        <div
          onClick={effectiveMode === 'preview' ? seekPreview : undefined}
          style={{
            flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-sub)',
            cursor: effectiveMode === 'preview' ? 'pointer' : 'default', overflow: 'hidden', position: 'relative',
          }}
        >
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: 'var(--accent)',
            transition: effectiveMode === 'preview' ? 'none' : 'width 0.2s',
          }} />
        </div>

        {/* 시간 표시 */}
        <div style={{ fontSize: '0.72rem', fontFamily: '"DM Mono", monospace', color: 'var(--text-tertiary)', minWidth: 72, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {effectiveMode === 'preview' ? `${timeLabel} / ${totalLabel}` : totalLabel}
        </div>
      </div>

      {/* 모드 토글 */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => changeMode('preview')}
          disabled={!hasPreview}
          title={!hasPreview ? '이 곡은 미리듣기를 제공하지 않습니다' : ''}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            border: '1px solid ' + (effectiveMode === 'preview' ? 'var(--accent-border)' : 'var(--border)'),
            background: effectiveMode === 'preview' ? 'var(--accent-soft)' : 'transparent',
            color: !hasPreview ? 'var(--text-tertiary)' : (effectiveMode === 'preview' ? 'var(--accent)' : 'var(--text-secondary)'),
            cursor: !hasPreview ? 'not-allowed' : 'pointer',
            fontSize: '0.72rem', fontFamily: '"DM Sans", sans-serif', fontWeight: 500,
            opacity: !hasPreview ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          미리듣기
        </button>
        <button
          onClick={() => changeMode('full')}
          disabled={fullPlayer.sdkFailed}
          title={fullPlayer.sdkFailed ? '전곡 재생을 사용할 수 없습니다' : ''}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            border: '1px solid ' + (effectiveMode === 'full' ? 'var(--accent-border)' : 'var(--border)'),
            background: effectiveMode === 'full' ? 'var(--accent-soft)' : 'transparent',
            color: fullPlayer.sdkFailed ? 'var(--text-tertiary)' : (effectiveMode === 'full' ? 'var(--accent)' : 'var(--text-secondary)'),
            cursor: fullPlayer.sdkFailed ? 'not-allowed' : 'pointer',
            fontSize: '0.72rem', fontFamily: '"DM Sans", sans-serif', fontWeight: 500,
            opacity: fullPlayer.sdkFailed ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          전곡 재생
        </button>
      </div>
    </div>
  );
}
