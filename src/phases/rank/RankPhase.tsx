import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Download, Layers, Scale } from 'lucide-react';
import { countTiers, rankTracks, rankingAccuracy } from '../../core/rating/engine';
import { TIERS, type Tier } from '../../core/types';
import AccuracyMeter from '../../components/AccuracyMeter';
import { TIER_STYLE } from '../../components/tiers';
import Button from '../../components/ui/Button';
import { Mosaic } from '../../components/ui/Cover';
import SearchField from '../../components/ui/SearchField';
import Segmented from '../../components/ui/Segmented';
import { coverImages } from '../../lib/covers';
import { fmtCount } from '../../lib/format';
import { trackPlayback, usePlayer } from '../../player/context';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { sourceLabel } from '../import/sourceLabel';
import { exportRankingCsv } from './exportRanking';
import RankRow, { RANK_COLUMNS } from './RankRow';

type Filter = Tier | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  ...TIERS.map(t => ({ value: t, label: TIER_STYLE[t].name })),
];

/** 랭킹: 이 화면만 세로로 스크롤한다 (Apple Music 플레이리스트처럼 머리 + 곡 목록) */
export default function RankPhase() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const player = usePlayer();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const deferredQuery = useDeferredValue(query);

  const ranked = useMemo(() => rankTracks(session.tracks), [session.tracks]);
  const counts = useMemo(() => countTiers(session.tracks), [session.tracks]);
  const accuracy = useMemo(() => rankingAccuracy(session.tracks), [session.tracks]);
  const covers = useMemo(() => coverImages(ranked, { large: true }), [ranked]);
  const untiered = session.tracks.length - ranked.length;

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return ranked
      .map((track, i) => ({
        track,
        rank: i + 1,
        // 티어별 곡 수만큼 위에서부터 잘랐을 때 이 순위가 속하는 구간
        band: (i < counts[1] ? 1 : i < counts[1] + counts[2] ? 2 : 3) as Tier,
      }))
      .filter(({ track }) =>
        (filter === 'all' || track.tier === filter) &&
        (!q || `${track.name} ${track.artists.join(' ')} ${track.album}`.toLowerCase().includes(q)));
  }, [ranked, counts, filter, deferredQuery]);

  const onRetier = useCallback((id: string, tier: Tier) => {
    dispatch({ type: 'retier', id, tier });
    toast(`${TIER_STYLE[tier].name}(Tier ${tier})로 바꿨습니다. 레이팅을 다시 계산했습니다`);
  }, [dispatch, toast]);

  const onToggle = player.status === 'ready' ? player.toggle : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-10 sm:px-6 lg:px-10 lg:pt-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end lg:gap-8">
          <Mosaic images={covers} className="size-36 shrink-0 rounded-xl shadow-art sm:size-44 lg:size-56" />
          <div className="min-w-0 flex-1">
            <h1 className="min-w-0">
              <span className="block text-[13px] font-semibold text-accent">랭킹</span>
              <span className="mt-0.5 block truncate text-[28px] leading-tight font-bold tracking-tight lg:text-[34px]">{sourceLabel(session)}</span>
            </h1>
            <p className="mt-1.5 text-sm text-fg-2 tabular-nums">
              {fmtCount(ranked.length)}곡 · 비교 {fmtCount(session.compCount)}회 ·{' '}
              {TIERS.map(t => `${TIER_STYLE[t].name} ${fmtCount(counts[t])}`).join(' · ')}
            </p>
            <AccuracyMeter value={accuracy} className="mt-3 max-w-md" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" icon={Scale} disabled={ranked.length < 2} onClick={() => dispatch({ type: 'setPhase', phase: 'sort' })}>
                계속 비교하기
              </Button>
              <Button icon={Download} onClick={() => exportRankingCsv(ranked)} disabled={!ranked.length}>CSV 내보내기</Button>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-10 -mx-4 mt-8 bg-page/90 px-4 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="flex flex-wrap items-center gap-2 pb-2 sm:gap-3">
            <SearchField value={query} onChange={setQuery} label="곡 검색" placeholder="곡·아티스트·앨범 검색" className="min-w-0 flex-1 sm:max-w-xs" />
            <Segmented label="티어 필터" options={FILTERS} value={filter} onChange={setFilter} className="max-sm:w-full" />
          </div>
          <div aria-hidden className={`hidden ${RANK_COLUMNS} gap-3 border-b border-line px-3 pb-1.5 text-xs font-medium text-fg-2 md:grid`}>
            <span className="text-right">#</span>
            <span>곡</span>
            <span>앨범</span>
            <span className="text-right">티어</span>
            <span className="text-right">레이팅</span>
            <span className="text-right">비교</span>
            <span />
          </div>
        </div>

        {rows.length ? (
          <ol className="mt-1.5" aria-label="순위">
            {rows.map(r => (
              <RankRow
                key={r.track.id}
                track={r.track}
                rank={r.rank}
                band={r.band}
                playback={trackPlayback(player, r.track.uri)}
                onToggle={onToggle}
                onRetier={onRetier}
              />
            ))}
          </ol>
        ) : (
          <p className="mt-12 text-center text-sm text-fg-2">조건에 맞는 곡이 없습니다</p>
        )}

        {untiered > 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center text-sm text-fg-2">
            <p>아직 분류하지 않은 {fmtCount(untiered)}곡은 순위에서 빠져 있습니다.</p>
            <Button size="sm" icon={Layers} onClick={() => dispatch({ type: 'setPhase', phase: 'tier' })}>분류하러 가기</Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
          레이팅 옆 ±는 불확실성입니다(작을수록 확실). 화살표는 분류한 티어와 지금 순위 구간이 다른 곡입니다.
        </p>
      </div>
    </div>
  );
}
