import type { Track } from '../../core/types';
import Cover from '../../components/ui/Cover';
import { fmtDuration } from '../../lib/format';
import { usePlayer } from '../../player/context';
import EmbedPlayer from '../../player/EmbedPlayer';
import PlayButton from '../../player/PlayButton';

interface Props {
  track: Track;
  side: 'A' | 'B';
  /** 앨범 아트를 누르면 이 곡이 확실히 우세한 것으로 기록 */
  onPick: () => void;
  playKey: string;
}

export default function CompareCard({ track, side, onPick, playKey }: Props) {
  const player = usePlayer();
  return (
    <article className="flex min-w-0 animate-pop flex-col overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex justify-center bg-sub">
        <button
          type="button"
          onClick={onPick}
          aria-label={`${side}: ${track.name} — 이 곡이 확실히 더 좋음`}
          className="group relative aspect-square w-full max-w-[min(100%,46dvh)]"
        >
          <Cover src={track.image} className="absolute inset-0" />
          <span className="absolute top-2 left-2 rounded-md bg-black/65 px-2 py-0.5 font-mono text-xs font-medium text-white">{side}</span>
          {track.isNew && (
            <span className="absolute top-2 right-2 rounded-md bg-black/65 px-2 py-0.5 font-mono text-[0.68rem] text-accent">✦ 신규</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            이 곡 선택
          </span>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
        <div className="min-w-0">
          <h2 className="font-title truncate text-base sm:text-lg" title={track.name}>{track.name}</h2>
          <p className="truncate text-xs text-fg-2 sm:text-sm" title={track.artists.join(', ')}>{track.artists.join(', ')}</p>
          <p className="truncate font-mono text-[0.7rem] text-fg-3">
            {track.album}{track.durationMs ? ` · ${fmtDuration(track.durationMs)}` : ''}
          </p>
        </div>
        <div className="mt-auto">
          {player.status === 'embed'
            ? <EmbedPlayer trackId={track.id} title={track.name} />
            : <PlayButton uri={track.uri} label={`${side} ${track.name}`} hotkey={playKey} size="sm" showStatus />}
        </div>
      </div>
    </article>
  );
}
