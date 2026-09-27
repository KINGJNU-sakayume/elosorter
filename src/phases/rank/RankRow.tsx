import { memo } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, LoaderCircle, Pause, Play } from 'lucide-react';
import { TIERS, type Tier, type Track } from '../../core/types';
import { TIER_STYLE } from '../../components/tiers';
import Cover from '../../components/ui/Cover';
import type { TrackPlayback } from '../../player/context';

interface Props {
  track: Track;
  rank: number;
  /** 현재 순위가 속한 티어 구간 (티어별 곡 수 기준) */
  band: Tier;
  playback: TrackPlayback;
  /** 재생할 수 없으면 null (앨범 아트가 Spotify 링크가 된다) */
  onToggle: ((uri: string) => void) | null;
  onRetier: (id: string, tier: Tier) => void;
}

/** 표 열: 순위 · 곡 · 앨범 · 티어 · 레이팅 · 비교 · 링크 (RankPhase의 머리글과 같이 쓴다) */
export const RANK_COLUMNS =
  'grid-cols-[2rem_minmax(0,1fr)_auto_3.25rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_5.75rem] md:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_auto_5.75rem_3rem_2rem]';

const spotifyUrl = (id: string) => `https://open.spotify.com/track/${id}`;

function RankRow({ track, rank, band, playback, onToggle, onRetier }: Props) {
  const tier = track.tier!;
  const style = TIER_STYLE[tier];
  const moved = band !== tier;
  const playing = playback === 'playing';
  const active = playing || playback === 'pending';

  const art = <Cover src={track.thumb ?? track.image} lazy className="size-10 rounded-md shadow-thumb" />;

  return (
    <li className={`content-auto grid ${RANK_COLUMNS} items-center gap-3 rounded-lg px-2 py-1.5 odd:bg-row-alt hover:bg-row-hover sm:px-3`}>
      <span className={`text-right text-[13px] tabular-nums ${rank <= 3 ? 'font-bold text-fg' : 'font-medium text-fg-2'}`}>
        {playing ? (
          <span className="inline-flex h-3 items-end gap-[2px] text-accent" aria-label="재생 중">
            <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
          </span>
        ) : rank}
      </span>

      <div className="flex min-w-0 items-center gap-3">
        {onToggle ? (
          <button
            type="button"
            onClick={() => onToggle(track.uri)}
            aria-label={`${track.name} ${playback === 'pending' ? '재생 취소' : playing ? '일시정지' : '재생'}`}
            className="group relative shrink-0 rounded-md"
          >
            {art}
            <span className={`absolute inset-0 flex items-center justify-center rounded-md bg-black/45 text-white transition-opacity ${
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
            }`}>
              {playback === 'pending'
                ? <LoaderCircle size={16} className="animate-spin" aria-hidden />
                : playing
                  ? <Pause size={16} fill="currentColor" strokeWidth={0} aria-hidden />
                  : <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" aria-hidden />}
            </span>
          </button>
        ) : (
          <a href={spotifyUrl(track.id)} target="_blank" rel="noopener noreferrer" aria-label={`${track.name} — Spotify에서 열기`} className="shrink-0 rounded-md">
            {art}
          </a>
        )}
        <div className="min-w-0">
          <div className={`truncate text-sm font-medium ${playing ? 'text-accent' : ''}`} title={track.name}>
            {track.isNew && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent-fill align-middle" title="새로 추가된 곡" aria-label="새 곡" />}
            {track.name}
          </div>
          <div className="truncate text-xs text-fg-2">
            {track.artists.join(', ')}
            <span className="md:hidden">{track.album ? ` · ${track.album}` : ''}</span>
          </div>
        </div>
      </div>

      <span className="hidden truncate text-[13px] text-fg-2 md:block" title={track.album}>{track.album}</span>

      <span className="flex items-center justify-end gap-1">
        {moved && (
          <span
            className={`hidden items-center text-[11px] font-semibold sm:flex ${band < tier ? 'text-accent' : 'text-fg-2'}`}
            title={`Tier ${tier}(${style.name})로 분류했지만 지금 순위는 Tier ${band}(${TIER_STYLE[band].name}) 구간입니다`}
          >
            {band < tier ? <ArrowUp size={12} strokeWidth={2.5} aria-hidden /> : <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
            <span className="sr-only">지금 순위 구간: </span>{TIER_STYLE[band].name}
          </span>
        )}
        <label>
          <span className="sr-only">{track.name} 티어</span>
          <select
            value={tier}
            onChange={e => onRetier(track.id, Number(e.target.value) as Tier)}
            className={`h-6 cursor-pointer appearance-none rounded-full px-2.5 text-center text-xs font-semibold ${style.soft} ${style.text}`}
          >
            {TIERS.map(t => <option key={t} value={t}>{TIER_STYLE[t].name}</option>)}
          </select>
        </label>
      </span>

      <span className="text-right text-[13px] font-semibold tabular-nums" title={track.sigma ? `불확실성 ±${Math.round(track.sigma)}` : undefined}>
        {Math.round(track.rating)}
        {track.sigma !== undefined && <span className="hidden text-[11px] font-normal text-fg-2 sm:inline"> ±{Math.round(track.sigma)}</span>}
      </span>
      <span className="hidden text-right text-xs text-fg-2 tabular-nums md:inline" title={`${track.comparisons}회 비교`}>
        {track.comparisons}회
      </span>
      <a
        href={spotifyUrl(track.id)}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        aria-hidden
        title="Spotify에서 열기"
        className="hidden size-8 items-center justify-center rounded-lg text-fg-3 hover:bg-sub hover:text-fg md:flex"
      >
        <ExternalLink size={15} aria-hidden />
      </a>
    </li>
  );
}

export default memo(RankRow);
