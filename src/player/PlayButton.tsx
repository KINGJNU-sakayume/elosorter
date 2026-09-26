import { LoaderCircle, Pause, Play } from 'lucide-react';
import Kbd from '../components/ui/Kbd';
import { statusText, trackPlayback, usePlayer } from './context';

interface Props {
  uri: string;
  /** 스크린리더용 곡 이름 */
  label: string;
  hotkey?: string;
  size?: 'sm' | 'md';
  /** 옆에 상태 문구 표시 */
  showStatus?: boolean;
}

export default function PlayButton({ uri, label, hotkey, size = 'md', showStatus = false }: Props) {
  const player = usePlayer();
  const playback = trackPlayback(player, uri);
  const playing = playback === 'playing';
  const icon = size === 'sm' ? 14 : 18;
  const action = playback === 'pending' ? '재생 취소' : playing ? '일시정지' : '재생';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <button
        type="button"
        onClick={() => player.toggle(uri)}
        disabled={player.status !== 'ready'}
        aria-label={`${label} ${action}`}
        aria-keyshortcuts={hotkey}
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-[filter,opacity] hover:brightness-110 disabled:opacity-35 ${size === 'sm' ? 'size-8' : 'size-10'}`}
      >
        {playback === 'pending'
          ? <LoaderCircle size={icon} className="animate-spin" aria-hidden />
          : playing
            ? <Pause size={icon} fill="currentColor" aria-hidden />
            : <Play size={icon} fill="currentColor" className="translate-x-px" aria-hidden />}
      </button>
      {showStatus && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
          {playing && (
            <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
              <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
            </span>
          )}
          <span className="truncate">{statusText(player, playback)}</span>
          {hotkey && player.status === 'ready' && <span className="hidden sm:inline-flex"><Kbd>{hotkey}</Kbd></span>}
        </span>
      )}
    </div>
  );
}
