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

/**
 * 비교할 한 곡. 칸(가로·세로) 안에 들어가는 가장 큰 정사각형 아트 + 아래 곡 정보·재생.
 * 아트 아래 영역의 높이만큼 빼고 크기를 정해 한 화면에 맞춘다.
 */
export default function CompareCard({ track, side, onPick, playKey }: Props) {
  const player = usePlayer();
  const embed = player.status === 'embed';
  const below = embed ? '11rem' : '7.5rem';
  return (
    // 세로 공간이 모자라 아트가 칸보다 좁아지면 두 곡을 가운데 쪽으로 붙인다 (A는 오른쪽, B는 왼쪽 정렬)
    <article
      className={`fit-box flex min-h-0 min-w-0 items-center ${side === 'A' ? 'justify-end' : 'justify-start'}`}
      aria-label={`${side}: ${track.name}`}
    >
      <div className="flex animate-pop flex-col" style={{ width: `min(100cqw, calc(100cqh - ${below}))` }}>
        <button
          type="button"
          onClick={onPick}
          aria-label={`${side}: ${track.name} — 이 곡이 확실히 더 좋음`}
          className="group relative aspect-square w-full shrink-0 overflow-hidden rounded-xl shadow-art transition-transform active:scale-[0.99] lg:rounded-2xl"
        >
          <Cover src={track.image} className="absolute inset-0" />
          <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-[13px] font-bold text-white backdrop-blur-md">
            {side}
          </span>
          {track.isNew && (
            <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-md">새 곡</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[15px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            이 곡 선택
          </span>
        </button>
        <div className="mt-2.5 min-w-0 lg:mt-3">
          <h2 className="truncate text-[15px] leading-snug font-semibold lg:text-lg" title={track.name}>{track.name}</h2>
          <p className="truncate text-[13px] text-accent lg:text-[15px]" title={track.artists.join(', ')}>{track.artists.join(', ')}</p>
          <p className="truncate text-xs text-fg-2">
            {track.album}{track.durationMs ? ` · ${fmtDuration(track.durationMs)}` : ''}
          </p>
        </div>
        <div className="mt-2">
          {embed
            ? <EmbedPlayer trackId={track.id} title={track.name} />
            : <PlayButton uri={track.uri} label={`${side} ${track.name}`} hotkey={playKey} size="sm" showStatus />}
        </div>
      </div>
    </article>
  );
}
