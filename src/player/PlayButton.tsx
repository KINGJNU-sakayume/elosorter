import { LoaderCircle, Pause, Play } from 'lucide-react';
import Kbd from '../components/ui/Kbd';
import { statusText, trackPlayback, usePlayer } from './context';

interface Props {
  uri: string;
  /** 스크린리더용 곡 이름 */
  label: string;
  hotkey?: string;
  size?: 'sm' | 'md' | 'lg';
  /** 옆에 상태 문구 표시 */
  showStatus?: boolean;
}

const DIM = { sm: 'size-8', md: 'size-10', lg: 'size-12' };
const ICON = { sm: 14, md: 17, lg: 20 };

export default function PlayButton({ uri, label, hotkey, size = 'md', showStatus = false }: Props) {
  const player = usePlayer();
  const playback = trackPlayback(player, uri);
  const playing = playback === 'playing';
  const action = playback === 'pending' ? '재생 취소' : playing ? '일시정지' : '재생';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={() => player.toggle(uri)}
        disabled={player.status !== 'ready'}
        aria-label={`${label} ${action}`}
        aria-keyshortcuts={hotkey}
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent-fill text-accent-fg transition-[filter,opacity,transform] enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-35 ${DIM[size]}`}
      >
        {playback === 'pending'
          ? <LoaderCircle size={ICON[size]} className="animate-spin" aria-hidden />
          : playing
            ? <Pause size={ICON[size]} fill="currentColor" strokeWidth={0} aria-hidden />
            : <Play size={ICON[size]} fill="currentColor" strokeWidth={0} className="translate-x-[1.5px]" aria-hidden />}
      </button>
      {showStatus && (
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-fg-2">
          {playing && (
            <span className="flex h-3 items-end gap-[2px] text-accent" aria-hidden>
              <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
            </span>
          )}
          <span className="truncate">{statusText(player, playback)}</span>
          {hotkey && player.status === 'ready' && <Kbd fineOnly>{hotkey}</Kbd>}
        </span>
      )}
    </div>
  );
}
