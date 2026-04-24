import type { Track } from '../utils/types';
import { fmtDuration } from '../utils/format';

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
  fullPlayer: FullPlayer;
  fullIsCurrent: boolean;
}

export default function AudioPlayer({ track, fullPlayer, fullIsCurrent }: Props) {
  const isPlaying = fullIsCurrent && fullPlayer.isPlaying;
  const hasDuration = !!(track.durationMs && track.durationMs > 0);
  const disabled = fullPlayer.sdkFailed || !fullPlayer.ready;

  function toggle() {
    if (disabled) return;
    if (fullIsCurrent) fullPlayer.toggle();
    else fullPlayer.play(track.uri || `spotify:track:${track.id}`);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={toggle}
        disabled={disabled}
        aria-label={isPlaying ? '일시정지' : '재생'}
        style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          border: 'none', background: 'var(--accent)', color: '#000',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          {isPlaying
            ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
            : <path d="M8 5v14l11-7z"/>}
        </svg>
      </button>
      <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: '"DM Sans", sans-serif' }}>
        {fullPlayer.sdkFailed
          ? '전곡 재생 불가'
          : !fullPlayer.ready
            ? 'Spotify 플레이어 준비 중…'
            : (isPlaying ? '재생 중' : '일시정지됨')}
      </div>
      {hasDuration && (
        <div style={{ fontSize: '0.72rem', fontFamily: '"DM Mono", monospace', color: 'var(--text-tertiary)', minWidth: 44, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {fmtDuration(track.durationMs!)}
        </div>
      )}
    </div>
  );
}
