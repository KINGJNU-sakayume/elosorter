import { memo } from 'react';
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react';
import { TIERS, type Tier, type Track } from '../../core/types';
import { TIER_STYLE } from '../../components/tiers';
import Cover from '../../components/ui/Cover';
import PlayButton from '../../player/PlayButton';

interface Props {
  track: Track;
  rank: number;
  /** 현재 순위가 속한 티어 구간 (티어별 곡 수 기준) */
  band: Tier;
  canPlay: boolean;
  onRetier: (id: string, tier: Tier) => void;
}

const RANK_COLOR = ['text-rank-1', 'text-rank-2', 'text-rank-3'];

function RankRow({ track, rank, band, canPlay, onRetier }: Props) {
  const tier = track.tier!;
  const style = TIER_STYLE[tier];
  const moved = band !== tier;
  return (
    <li className="content-auto flex items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-2 transition-colors hover:border-line-strong sm:gap-3 sm:px-3.5">
      <span className={`w-9 shrink-0 text-right font-mono text-sm sm:w-11 ${RANK_COLOR[rank - 1] ?? 'text-fg-3'}`}>
        {rank}
      </span>
      <a
        href={`https://open.spotify.com/track/${track.id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${track.name} — Spotify에서 열기`}
        className="shrink-0 rounded-md"
      >
        <Cover src={track.thumb ?? track.image} lazy className="size-11 rounded-md" />
      </a>
      <div className="min-w-0 flex-1">
        <div className="font-title truncate text-[0.95rem]" title={track.name}>
          {track.isNew && <span className="mr-1 font-sans text-xs text-accent not-italic" title="새로 추가된 곡">✦</span>}
          {track.name}
        </div>
        <div className="truncate text-xs text-fg-2">
          {track.artists.join(', ')}
          <span className="hidden sm:inline">{track.album ? ` · ${track.album}` : ''}</span>
        </div>
      </div>

      {moved && (
        <span
          className={`hidden shrink-0 items-center font-mono text-[0.68rem] sm:flex ${band < tier ? 'text-accent' : 'text-fg-3'}`}
          title={`Tier ${tier}로 분류했지만 지금 순위는 Tier ${band} 구간입니다`}
        >
          {band < tier ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}T{band}
        </span>
      )}

      <label className="shrink-0">
        <span className="sr-only">{track.name} 티어</span>
        <select
          value={tier}
          onChange={e => onRetier(track.id, Number(e.target.value) as Tier)}
          className={`h-7 cursor-pointer appearance-none rounded-full border px-2.5 text-center font-mono text-xs font-semibold ${style.line} ${style.soft} ${style.text}`}
        >
          {TIERS.map(t => <option key={t} value={t}>T{t}</option>)}
        </select>
      </label>

      <span className="w-12 shrink-0 text-right font-mono text-sm text-accent sm:w-20" title={track.sigma ? `불확실성 ±${Math.round(track.sigma)}` : undefined}>
        {Math.round(track.rating)}
        {track.sigma !== undefined && <span className="hidden text-[0.68rem] text-fg-3 sm:inline"> ±{Math.round(track.sigma)}</span>}
      </span>
      <span className="hidden w-8 shrink-0 text-right font-mono text-xs text-fg-3 md:inline" title={`${track.comparisons}회 비교`}>
        {track.comparisons}×
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {canPlay && <PlayButton uri={track.uri} label={track.name} size="sm" />}
        <a
          href={`https://open.spotify.com/track/${track.id}`}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden
          className="hidden size-8 items-center justify-center rounded-lg text-fg-3 hover:bg-sub hover:text-fg sm:flex"
        >
          <ExternalLink size={15} aria-hidden />
        </a>
      </div>
    </li>
  );
}

export default memo(RankRow);
