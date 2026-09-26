import { Pause, Play } from 'lucide-react';
import Kbd from '../components/ui/Kbd';
import { statusText, usePlayer } from './context';

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
  const playing = player.isPlaying && player.currentUri === uri;
  const dim = size === 'sm' ? 'size-8' : 'size-10';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <button
        type="button"
        onClick={() => player.toggle(uri)}
        disabled={player.status !== 'ready'}
        aria-label={`${label} ${playing ? '일시정지' : '재생'}`}
        aria-keyshortcuts={hotkey}
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-[filter,opacity] hover:brightness-110 disabled:opacity-35 ${dim}`}
      >
        {playing ? <Pause size={size === 'sm' ? 14 : 18} fill="currentColor" aria-hidden /> : <Play size={size === 'sm' ? 14 : 18} fill="currentColor" className="translate-x-px" aria-hidden />}
      </button>
      {showStatus && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
          {playing && (
            <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
              <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
            </span>
          )}
          <span className="truncate">{statusText(player, playing)}</span>
          {hotkey && player.status === 'ready' && <span className="hidden sm:inline-flex"><Kbd>{hotkey}</Kbd></span>}
        </span>
      )}
    </div>
  );
}
