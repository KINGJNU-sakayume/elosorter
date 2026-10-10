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
 * 비교할 한 곡: 정사각형 아트 + 아래 곡 정보·재생. 폭은 부모 격자(sort-fit)가 정한다.
 * 이 화면에서 가장 큰 글자는 곡 제목이다. 로그인 전에는 재생 줄을 그리지 않는다
 * (안내는 화면 위쪽에 한 번만 나온다).
 */
export default function CompareCard({ track, side, onPick, playKey }: Props) {
  const player = usePlayer();
  const artists = track.artists.join(', ');
  const albumLine = `${track.album}${track.durationMs ? ` · ${fmtDuration(track.durationMs)}` : ''}`;
  return (
    <article className="flex min-w-0 animate-pop flex-col" aria-label={`${side}: ${track.name}`}>
      <button
        type="button"
        onClick={onPick}
        aria-label={`${side}: ${track.name} — 이 곡이 확실히 더 좋음`}
        className="group relative aspect-square w-full shrink-0 overflow-hidden rounded-xl shadow-art transition-transform active:scale-[0.99] lg:rounded-2xl"
      >
        <Cover src={track.image} className="absolute inset-0" />
        <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-[13px] font-bold text-white backdrop-blur-md lg:top-2.5 lg:left-2.5 lg:size-[30px] lg:text-sm">
          {side}
        </span>
        {track.isNew && (
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-md">새 곡</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[15px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          이 곡 선택
        </span>
      </button>
      <div className="mt-2.5 min-w-0 lg:mt-3.5">
        {/* 좁은 화면은 칸이 좁아 두 줄까지 허용 (터치 기기에서는 title 툴팁을 볼 수 없다) */}
        <h2 className="line-clamp-2 text-[17px] leading-tight font-bold tracking-tight lg:line-clamp-1 lg:text-[22px]" title={track.name}>
          {track.name}
        </h2>
        <p className="truncate text-[13px] text-fg-2 lg:text-[15px]" title={`${artists} · ${albumLine}`}>
          {artists}<span className="max-lg:hidden"> · {albumLine}</span>
        </p>
        <p className="truncate text-xs text-fg-3 lg:hidden">{albumLine}</p>
      </div>
      {player.status !== 'off' && (
        <div className="mt-2">
          {player.status === 'embed'
            ? <EmbedPlayer trackId={track.id} title={track.name} />
            : <PlayButton uri={track.uri} label={`${side} ${track.name}`} hotkey={playKey} size="sm" showStatus />}
        </div>
      )}
    </article>
  );
}
