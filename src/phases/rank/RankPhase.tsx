import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Download, Layers, Search, Swords } from 'lucide-react';
import { countTiers, rankTracks, rankingAccuracy } from '../../core/rating/engine';
import { TIERS, type Tier } from '../../core/types';
import AccuracyMeter from '../../components/AccuracyMeter';
import { TIER_STYLE } from '../../components/tiers';
import Button from '../../components/ui/Button';
import { fmtCount } from '../../lib/format';
import { usePlayer } from '../../player/context';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { exportRankingCsv } from './exportRanking';
import RankRow from './RankRow';

type Filter = Tier | 'all';

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
    toast(`Tier ${tier}로 바꿨습니다. 레이팅을 다시 계산했습니다`);
  }, [dispatch, toast]);

  const chip = (active: boolean) =>
    `h-8 rounded-lg border px-3 text-xs font-semibold transition-colors ${
      active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-sub'
    }`;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">랭킹</h1>
          <p className="mt-1 text-sm text-fg-2">
            {fmtCount(ranked.length)}곡 · 비교 {fmtCount(session.compCount)}회 ·{' '}
            {TIERS.map(t => `${TIER_STYLE[t].name} ${fmtCount(counts[t])}`).join(' / ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={Download} onClick={() => exportRankingCsv(ranked)} disabled={!ranked.length}>CSV</Button>
          <Button size="sm" variant="primary" icon={Swords} disabled={ranked.length < 2} onClick={() => dispatch({ type: 'setPhase', phase: 'sort' })}>
            계속 비교하기
          </Button>
        </div>
      </div>

      <AccuracyMeter value={accuracy} className="mt-4" />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden />
          <span className="sr-only">곡 검색</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="곡·아티스트·앨범 검색"
            className="h-9 w-full rounded-lg border border-line bg-card pr-3 pl-9 text-sm placeholder:text-fg-3 focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex gap-1.5" role="radiogroup" aria-label="티어 필터">
          {(['all', ...TIERS] as Filter[]).map(f => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={chip(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? '전체' : `T${f}`}
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <ol className="mt-4 space-y-1.5" aria-label="순위">
          {rows.map(r => (
            <RankRow key={r.track.id} track={r.track} rank={r.rank} band={r.band} canPlay={player.status === 'ready'} onRetier={onRetier} />
          ))}
        </ol>
      ) : (
        <p className="mt-10 text-center text-sm text-fg-2">조건에 맞는 곡이 없습니다</p>
      )}

      {untiered > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-fg-2">
          <p>아직 분류하지 않은 {fmtCount(untiered)}곡은 순위에서 빠져 있습니다.</p>
          <Button size="sm" icon={Layers} onClick={() => dispatch({ type: 'setPhase', phase: 'tier' })}>분류하러 가기</Button>
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-fg-3">
        레이팅 옆 ±는 불확실성입니다(작을수록 확실). ↑↓ 표시는 분류한 티어와 지금 순위 구간이 다른 곡입니다.
      </p>
    </div>
  );
}
