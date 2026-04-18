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
  pause?: () => void;
  toggle: () => void;
  ready: boolean;
  sdkFailed: boolean;
}

interface Props {
  track: Track;
  mode: PlayMode;
  onModeChange: (m: PlayMode) => void;
  fullPlayer: FullPlayer;
  fullIsCurrent: boolean;
}

export default function AudioPlayer({ track, mode, onModeChange, fullPlayer, fullIsCurrent }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const hasPreview = !!track.previewUrl;
  const effectiveMode: PlayMode = (mode === 'preview' && !hasPreview) ? 'full' : mode;

  // 트랙이 바뀌면 프리뷰 정지 + 처음부터 재설정
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPreviewPlaying(false);
    setPreviewCurrent(0);
  }, [track.id]);

  // 언마운트시에도 정지
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) { a.pause(); a.currentTime = 0; }
    };
  }, []);

  function changeMode(m: PlayMode) {
    if (m === 'preview' && !hasPreview) return;
    const a = audioRef.current;
    if (a) { a.pause(); a.currentTime = 0; setPreviewPlaying(false); setPreviewCurrent(0); }
    onModeChange(m);
    savePlayMode(m);
  }

  function togglePreview() {
    const a = audioRef.current;
    if (!a || !track.previewUrl) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function toggleFull() {
    if (fullIsCurrent) fullPlayer.toggle();
    else fullPlayer.play(track.uri || `spotify:track:${track.id}`);
  }

  function seekPreview(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(a.duration, a.duration * ratio));
  }

  const isPlaying = effectiveMode === 'preview' ? previewPlaying : (fullIsCurrent && fullPlayer.isPlaying);
  const toggle = effectiveMode === 'preview' ? togglePreview : toggleFull;

  const dur = audioRef.current?.duration || 30;
  const previewProgressPct = (previewCurrent / dur) * 100;
  const previewTimeLabel = `${fmtTime(previewCurrent * 1000)} / ${fmtTime(dur * 1000)}`;
  const trackTotalLabel = fmtTime(track.durationMs ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 숨겨진 audio 요소 — key로 트랙마다 새 DOM 요소를 만들어 재생 누수 방지 */}
      {hasPreview && (
        <audio
          key={track.id}
          ref={audioRef}
          src={track.previewUrl ?? undefined}
          preload="none"
          onPlay={() => setPreviewPlaying(true)}
          onPause={() => setPreviewPlaying(false)}
          onEnded={() => { setPreviewPlaying(false); setPreviewCurrent(0); }}
          onTimeUpdate={e => setPreviewCurrent(e.currentTarget.currentTime)}
        />
      )}

      {/* 재생 컨트롤 + 진행바/상태 */}
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

        {effectiveMode === 'preview' ? (
          <>
            <div
              onClick={seekPreview}
              style={{
                flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-sub)',
                cursor: 'pointer', overflow: 'hidden',
              }}
            >
              <div style={{ height: '100%', width: `${previewProgressPct}%`, background: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: '"DM Mono", monospace', color: 'var(--text-tertiary)', minWidth: 82, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {previewTimeLabel}
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: '"DM Sans", sans-serif' }}>
              {fullPlayer.sdkFailed
                ? '전곡 재생 불가'
                : !fullPlayer.ready
                  ? 'Spotify 플레이어 준비 중…'
                  : (isPlaying ? '재생 중' : '일시정지됨')}
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: '"DM Mono", monospace', color: 'var(--text-tertiary)', minWidth: 44, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {trackTotalLabel}
            </div>
          </>
        )}
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
