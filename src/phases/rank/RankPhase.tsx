import { Fragment, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Download, Layers, Scale } from 'lucide-react';
import { countTiers, rankTracks, rankingAccuracy, tierOnlyAccuracy } from '../../core/rating/engine';
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

/** 구간 막대의 가로축 눈금 단위 */
const AXIS_STEP = 50;

/**
 * 랭킹: 이 화면만 세로로 스크롤한다 (Apple Music 플레이리스트처럼 머리 + 곡 목록).
 * 머리 영역은 낮게 두어 첫 화면에 순위가 최대한 많이 보이게 한다.
 */
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
  const baseline = useMemo(() => tierOnlyAccuracy(session.tracks), [session.tracks]);
  const covers = useMemo(() => coverImages(ranked, { large: true }), [ranked]);
  const untiered = session.tracks.length - ranked.length;

  // 모든 행이 함께 쓰는 가로축: 레이팅 ± 불확실성이 전부 들어가는 범위를 눈금 단위로 넓힌다
  const [axisLo, axisHi] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of ranked) {
      lo = Math.min(lo, t.rating - (t.sigma ?? 0));
      hi = Math.max(hi, t.rating + (t.sigma ?? 0));
    }
    if (!Number.isFinite(lo)) return [1000, 2000];
    lo = Math.floor(lo / AXIS_STEP) * AXIS_STEP;
    hi = Math.ceil(hi / AXIS_STEP) * AXIS_STEP;
    return hi > lo ? [lo, hi] : [lo - AXIS_STEP, hi + AXIS_STEP];
  }, [ranked]);

  // 티어별 곡 수만큼 위에서부터 자른 구간: 최애 1~c1위, 선호 c1+1~c1+c2위, 보통 나머지
  const bands = useMemo(() => {
    const c1 = counts[1];
    const c2 = counts[2];
    const range = (from: number, to: number) => (from === to ? `${fmtCount(from)}위` : `${fmtCount(from)}–${fmtCount(to)}위`);
    return {
      of: (index: number): Tier => (index < c1 ? 1 : index < c1 + c2 ? 2 : 3),
      range: { 1: range(1, c1), 2: range(c1 + 1, c1 + c2), 3: range(c1 + c2 + 1, c1 + c2 + counts[3]) } as Record<Tier, string>,
    };
  }, [counts]);

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return ranked
      .map((track, i) => ({ track, rank: i + 1, band: bands.of(i) }))
      .filter(({ track }) =>
        (filter === 'all' || track.tier === filter) &&
        (!q || `${track.name} ${track.artists.join(' ')} ${track.album}`.toLowerCase().includes(q)));
  }, [ranked, bands, filter, deferredQuery]);

  const onRetier = useCallback((id: string, tier: Tier) => {
    dispatch({ type: 'retier', id, tier });
    toast(`${TIER_STYLE[tier].name}(Tier ${tier})로 바꿨습니다. 레이팅을 다시 계산했습니다`);
  }, [dispatch, toast]);

  const onToggle = player.status === 'ready' ? player.toggle : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-10 sm:px-6 lg:px-10 lg:pt-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-6">
            <Mosaic images={covers} className="size-16 shrink-0 rounded-[10px] shadow-thumb sm:size-24 sm:rounded-xl sm:shadow-art lg:size-28" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight lg:text-[28px]">{sourceLabel(session)}</h1>
              <p className="mt-0.5 text-[13px] text-fg-2 tabular-nums lg:text-sm">
                {fmtCount(ranked.length)}곡 순위 · 비교 {fmtCount(session.compCount)}회
              </p>
              <AccuracyMeter value={accuracy} baseline={baseline} className="mt-2.5 max-w-xs max-sm:hidden" />
            </div>
          </div>
          <AccuracyMeter value={accuracy} baseline={baseline} className="sm:hidden" />
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" icon={Scale} className="max-sm:flex-1" disabled={ranked.length < 2} onClick={() => dispatch({ type: 'setPhase', phase: 'sort' })}>
              계속 비교하기
            </Button>
            <Button icon={Download} onClick={() => exportRankingCsv(ranked)} disabled={!ranked.length}>
              <span>CSV<span className="max-sm:sr-only"> 내보내기</span></span>
            </Button>
          </div>
        </header>

        <div className="sticky top-0 z-10 -mx-4 mt-5 bg-page/90 px-4 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:mt-6 lg:px-10">
          <div className="flex flex-wrap items-center gap-2 pb-2 sm:gap-3">
            <SearchField value={query} onChange={setQuery} label="곡 검색" placeholder="곡·아티스트·앨범 검색" className="min-w-0 flex-1 sm:max-w-xs" />
            <Segmented label="티어 필터" options={FILTERS} value={filter} onChange={setFilter} className="max-sm:w-full" />
          </div>
          <div aria-hidden className={`hidden ${RANK_COLUMNS} items-end gap-3 border-b border-line px-3 pb-1.5 text-xs font-medium text-fg-2 md:grid`}>
            <span className="text-right">#</span>
            <span>곡</span>
            <span>앨범</span>
            <span>티어</span>
            <span className="text-right">레이팅</span>
            <span className="hidden justify-between text-[11px] font-normal text-fg-3 tabular-nums xl:flex">
              <span>{axisLo}</span><span>± 불확실성</span><span>{axisHi}</span>
            </span>
            <span className="text-right">비교</span>
            <span />
          </div>
        </div>

        {rows.length ? (
          <ol className="mt-1" aria-label="순위">
            {rows.map((r, i) => (
              <Fragment key={r.track.id}>
                {/* 구간이 바뀌는 자리에 구분선을 넣는다. 구간과 다른 티어인 곡은 알약 색과 화살표로 드러난다 */}
                {(i === 0 || rows[i - 1].band !== r.band) && (
                  <li
                    className="flex h-8 items-center gap-2.5 px-2 text-xs text-fg-2 sm:px-3"
                    title="티어별로 분류한 곡 수만큼 위에서부터 자른 구간입니다"
                  >
                    <span className="font-semibold text-fg">{TIER_STYLE[r.band].name} 구간</span>
                    <span className="tabular-nums">{bands.range[r.band]}</span>
                    <span className="h-px flex-1 bg-line" aria-hidden />
                  </li>
                )}
                <RankRow
                  track={r.track}
                  rank={r.rank}
                  band={r.band}
                  axisLo={axisLo}
                  axisHi={axisHi}
                  playback={trackPlayback(player, r.track.uri)}
                  onToggle={onToggle}
                  onRetier={onRetier}
                />
              </Fragment>
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

        <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-fg-3">
          레이팅 옆 ±는 불확실성입니다(작을수록 확실). <span className="max-xl:hidden">구간 막대가 위아래로 겹치는 곡끼리는 아직 순서가 확정되지 않았습니다. </span>
          알약의 화살표는 분류한 티어와 지금 순위 구간이 다른 곡입니다.
        </p>
      </div>
    </div>
  );
}
