import { memo } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, LoaderCircle, Pause, Play } from 'lucide-react';
import { TIERS, type Tier, type Track } from '../../core/types';
import { TIER_STYLE } from '../../components/tiers';
import Cover from '../../components/ui/Cover';
import type { TrackPlayback } from '../../player/context';

interface Props {
  track: Track;
  rank: number;
  /** 현재 순위가 속한 티어 구간 (티어별 곡 수 기준) */
  band: Tier;
  /** 구간 막대의 가로축 범위 (모든 행이 같은 축을 쓴다) */
  axisLo: number;
  axisHi: number;
  playback: TrackPlayback;
  /** 재생할 수 없으면 null (앨범 아트가 Spotify 링크가 된다) */
  onToggle: ((uri: string) => void) | null;
  onRetier: (id: string, tier: Tier) => void;
}

/**
 * 표 열: 순위 · 곡 · 앨범 · 티어 · 레이팅 · 구간 막대 · 비교 · 링크 (RankPhase의 머리글과 같이 쓴다).
 * 행마다 따로 격자를 만들기 때문에 열 너비는 전부 고정값이나 fr이어야 한다. 예전에는 티어 열이 auto라서
 * 화살표가 붙은 행과 머리글의 열이 서로 어긋났다.
 * 좁은 화면부터 차례로: 4열 → (md) 앨범·비교·링크 추가 → (xl) 구간 막대 추가.
 */
export const RANK_COLUMNS =
  'grid-cols-[1.75rem_minmax(0,1fr)_4.75rem_3rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_5.25rem_5.5rem] md:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_5.25rem_5.5rem_3rem_2rem] xl:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,0.9fr)_5.25rem_5.5rem_11.5rem_3rem_2rem]';

const spotifyUrl = (id: string) => `https://open.spotify.com/track/${id}`;

/**
 * 티어 알약. 보이는 것은 알약이고, 그 위에 투명한 <select>를 얹어 누르면 바로 티어를 바꾼다.
 * 펼침 화살표로 "바꿀 수 있음"을 드러내고, select는 위아래로 8px씩 넓혀 터치 영역 44px을 확보한다.
 * 분류한 티어와 지금 순위 구간이 다르면 알약 안에 방향 화살표가 붙는다.
 */
function TierSelect({ track, tier, band, onRetier }: { track: Track; tier: Tier; band: Tier; onRetier: Props['onRetier'] }) {
  const style = TIER_STYLE[tier];
  const moved = band !== tier;
  const note = moved
    ? `${style.name}(Tier ${tier})로 분류했지만 지금 순위는 ${TIER_STYLE[band].name} 구간입니다`
    : undefined;
  return (
    <label
      title={note ? `${note}. 눌러서 티어를 바꿀 수 있습니다` : '눌러서 티어 바꾸기'}
      className={`relative flex h-7 items-center gap-[3px] rounded-full pr-[7px] pl-2.5 text-xs font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${style.fill} ${style.on}`}
    >
      {moved && (band < tier
        ? <ArrowUp size={12} strokeWidth={2.6} aria-hidden />
        : <ArrowDown size={12} strokeWidth={2.6} aria-hidden />)}
      <span aria-hidden>{style.name}</span>
      <ChevronDown size={12} strokeWidth={2.4} className="opacity-75" aria-hidden />
      <span className="sr-only">{track.name} 티어{note ? ` (${note})` : ''}</span>
      <select
        value={tier}
        onChange={e => onRetier(track.id, Number(e.target.value) as Tier)}
        className="absolute inset-x-0 -inset-y-2 cursor-pointer opacity-0"
      >
        {/* 펼친 목록은 알약 색을 물려받지 않도록 따로 지정한다 */}
        {TIERS.map(t => <option key={t} value={t} className="bg-card text-fg">{TIER_STYLE[t].name}</option>)}
      </select>
    </label>
  );
}

/**
 * 레이팅 ± 불확실성(사후 표준편차)을 같은 축 위의 점과 구간으로 그린다.
 * 위아래 이웃의 구간이 겹치면 그 둘의 순서는 아직 확정되지 않은 것이고, 구간이 긴 곡은 비교가 더 필요한 곡이다.
 */
function RatingRange({ rating, sigma, lo, hi }: { rating: number; sigma?: number; lo: number; hi: number }) {
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const label = sigma === undefined
    ? `${Math.round(rating)}`
    : `${Math.round(rating)} ± ${Math.round(sigma)} (${Math.round(rating - sigma)}~${Math.round(rating + sigma)})`;
  return (
    <span role="img" aria-label={label} title={label} className="relative hidden h-5 xl:block">
      <span className="absolute inset-x-0 top-[9.5px] h-px bg-line" />
      {sigma !== undefined && (
        <span
          className="absolute top-[9px] h-0.5 rounded-[1px] bg-fg-2"
          style={{ left: `${pos(rating - sigma)}%`, width: `${pos(rating + sigma) - pos(rating - sigma)}%` }}
        />
      )}
      <span className="absolute top-1.5 size-2 -translate-x-1/2 rounded-full bg-fg ring-2 ring-page" style={{ left: `${pos(rating)}%` }} />
    </span>
  );
}

function RankRow({ track, rank, band, axisLo, axisHi, playback, onToggle, onRetier }: Props) {
  const tier = track.tier!;
  const playing = playback === 'playing';
  const active = playing || playback === 'pending';

  const art = <Cover src={track.thumb ?? track.image} lazy className="size-10 rounded-md shadow-thumb pointer-coarse:size-11" />;

  return (
    <li className={`content-auto grid ${RANK_COLUMNS} items-center gap-2.5 rounded-lg px-2 py-1.5 odd:bg-row-alt hover:bg-row-hover sm:gap-3 sm:px-3`}>
      <span className={`text-right text-[13px] tabular-nums ${rank <= 3 ? 'font-bold text-fg' : 'font-medium text-fg-2'}`}>
        {playing ? (
          <span className="inline-flex h-3 items-end gap-[2px] text-accent" aria-label="재생 중">
            <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
          </span>
        ) : rank}
      </span>

      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
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

      <span className="flex justify-end md:justify-start">
        <TierSelect track={track} tier={tier} band={band} onRetier={onRetier} />
      </span>

      <span className="text-right text-[13px] leading-tight font-semibold tabular-nums">
        {Math.round(track.rating)}
        {track.sigma !== undefined && (
          <span className="block text-[11px] font-normal text-fg-2 sm:ml-1 sm:inline">±{Math.round(track.sigma)}</span>
        )}
      </span>
      <RatingRange rating={track.rating} sigma={track.sigma} lo={axisLo} hi={axisHi} />
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
