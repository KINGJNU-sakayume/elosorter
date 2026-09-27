import { useCallback, useEffect, useMemo } from 'react';
import { ArrowRight, CircleCheck, ListOrdered, Undo2 } from 'lucide-react';
import { countTiers } from '../../core/rating/engine';
import { TARGET_SHARE, type TierCounts } from '../../core/rating/priors';
import { TIERS, type Tier } from '../../core/types';
import { TIER_STYLE } from '../../components/tiers';
import Button from '../../components/ui/Button';
import Cover from '../../components/ui/Cover';
import ProgressBar from '../../components/ui/ProgressBar';
import { useConfirm } from '../../components/ui/confirm';
import { useHotkeys } from '../../hooks/useHotkeys';
import { fmtCount, fmtDuration, fmtPercent } from '../../lib/format';
import { usePlayer } from '../../player/context';
import EmbedPlayer from '../../player/EmbedPlayer';
import PlayButton from '../../player/PlayButton';
import { useAppDispatch, useAppState } from '../../state/context';

const RATIO_NOTE = '권장 비율은 가이드일 뿐입니다. 실제로 나눈 비율에 맞춰 티어별 시작 점수가 자동으로 조정되니 억지로 맞출 필요는 없습니다.';

export default function TierPhase() {
  const { session, tierHistory } = useAppState();
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const player = usePlayer();

  const untiered = useMemo(() => session.tracks.filter(t => t.tier === null), [session.tracks]);
  const counts = useMemo(() => countTiers(session.tracks), [session.tracks]);
  const total = session.tracks.length;
  const done = total - untiered.length;
  const current = untiered[0] ?? null;

  // 곡이 바뀌면 앞 곡을 멈추고, 그 곡에 잠시(1초) 머물면 자동 재생한다.
  // 빠르게 넘기는 동안에는 재생 요청을 보내지 않는다 (useSpotifyPlayer의 cue)
  const { cue, pause, status } = player;
  const uri = current?.uri;
  useEffect(() => {
    if (!uri || status !== 'ready') return;
    return cue(uri);
  }, [uri, status, cue]);
  useEffect(() => pause, [pause]);

  const assign = useCallback((tier: Tier) => {
    if (current) dispatch({ type: 'assignTier', id: current.id, tier });
  }, [current, dispatch]);
  const undo = useCallback(() => dispatch({ type: 'undoTier' }), [dispatch]);

  useHotkeys({
    '1': () => assign(1),
    '2': () => assign(2),
    '3': () => assign(3),
    z: undo,
    Space: () => { if (current) player.toggle(current.uri); },
  });

  const bulkAssign = async () => {
    const ok = await confirm({
      title: `남은 ${fmtCount(untiered.length)}곡을 모두 보통(Tier 3)으로 둘까요?`,
      message: '되돌리기(Z)로 한 번에 취소할 수 있고, 나중에 랭킹 화면에서 곡별로 바꿀 수도 있습니다.',
      confirmLabel: '보통으로 분류',
    });
    if (ok) dispatch({ type: 'assignRemaining', tier: 3 });
  };

  if (!current) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-6 py-10">
        <div className="m-auto flex flex-col items-center text-center">
          <CircleCheck className="size-14 text-accent" strokeWidth={1.6} aria-hidden />
          <h1 className="mt-4 text-[28px] font-bold tracking-tight">티어 분류 완료</h1>
          <p className="mt-2 max-w-md text-[15px] text-fg-2">
            이제 두 곡씩 비교해 순위를 다듬습니다. 티어는 랭킹 화면에서 언제든 바꿀 수 있습니다.
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {TIERS.map(tier => (
              <li key={tier} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${TIER_STYLE[tier].soft} ${TIER_STYLE[tier].text}`}>
                {TIER_STYLE[tier].name} <span className="tabular-nums">{fmtCount(counts[tier])}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row">
            <Button variant="primary" size="lg" icon={ArrowRight} onClick={() => dispatch({ type: 'setPhase', phase: 'sort' })}>
              비교 정렬 시작
            </Button>
            <Button size="lg" icon={ListOrdered} onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>랭킹 보기</Button>
          </div>
          {tierHistory.length > 0 && (
            <Button variant="ghost" size="sm" icon={Undo2} kbd="Z" className="mt-3" onClick={undo}>마지막 분류 되돌리기</Button>
          )}
        </div>
      </div>
    );
  }

  const next = untiered.slice(1, 4);
  const embed = player.status === 'embed';

  // 한 화면에 맞춘다: 앨범 아트는 남는 공간(가로·세로 중 작은 쪽)만큼 커지고 나머지는 제 크기.
  // 좁은 화면: 진행률 → 앨범 아트 → 곡 정보 → 티어 버튼(3열). 넓은 화면: 왼쪽 아트, 오른쪽 정보·버튼.
  // 창이 너무 낮아 최소 크기도 안 들어가면 잘리는 대신 스크롤된다.
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 sm:px-6 lg:gap-6 lg:px-10 lg:pt-8 lg:pb-10">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <div className="hidden lg:block">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">티어 분류</h1>
          <p className="mt-1 text-sm text-fg-2">직감으로 빠르게 고르세요. 정확한 순서는 다음 단계의 1:1 비교가 잡아 줍니다.</p>
        </div>
        <h1 className="sr-only lg:hidden">티어 분류</h1>
        <div className="w-full lg:w-80 xl:w-96">
          <div className="mb-1.5 flex justify-between text-xs text-fg-2 tabular-nums">
            <span><span className="font-semibold text-fg">{fmtCount(done)}</span> / {fmtCount(total)}곡</span>
            <span>{fmtCount(untiered.length)}곡 남음</span>
          </div>
          <ProgressBar value={total ? done / total : 0} label="티어 분류 진행률" />
        </div>
      </header>

      <div className="grid flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,27rem)] lg:grid-rows-1 lg:gap-12">
        <div className="fit-box flex min-h-32 items-center justify-center lg:min-h-72 lg:justify-end">
          <div
            key={current.id}
            className="aspect-square w-[min(100cqw,100cqh)] shrink-0 animate-pop overflow-hidden rounded-xl shadow-art lg:rounded-2xl"
          >
            <Cover src={current.image} className="h-full w-full" />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col justify-center gap-3 lg:gap-6">
          <div className="min-w-0 text-center lg:text-left">
            {current.isNew && <p className="mb-0.5 text-xs font-semibold text-accent">새로 추가된 곡</p>}
            <h2 className="truncate text-xl leading-tight font-bold tracking-tight lg:text-[30px]" title={current.name}>
              {current.name}
            </h2>
            <p className="mt-0.5 truncate text-[15px] text-accent lg:mt-1 lg:text-lg">{current.artists.join(', ')}</p>
            <p className="truncate text-[13px] text-fg-2">
              {current.album}{current.durationMs ? ` · ${fmtDuration(current.durationMs)}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-center lg:items-start">
            {embed
              ? <EmbedPlayer trackId={current.id} title={current.name} />
              : <PlayButton uri={current.uri} label={current.name} hotkey="Space" size="lg" showStatus />}
            {/* 곡마다 같은 안내라 세로가 짧은 휴대폰에서는 생략 */}
            {embed && player.reason && <p className="mt-1.5 hidden text-xs text-fg-3 tall:block lg:block">{player.reason}</p>}
          </div>

          <div role="group" aria-label="티어 선택" className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
            {TIERS.map(tier => (
              <TierButton key={tier} tier={tier} counts={counts} onClick={() => assign(tier)} />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <Button size="sm" icon={Undo2} kbd="Z" disabled={!tierHistory.length} onClick={undo}>되돌리기</Button>
            {done > 0 && (
              <Button size="sm" variant="ghost" onClick={bulkAssign}>
                남은 {fmtCount(untiered.length)}곡 모두 보통으로
              </Button>
            )}
          </div>

          {next.length > 0 && (
            <div className="hidden lg:tall:block">
              <h3 className="mb-2 text-xs font-semibold text-fg-3">다음 곡</h3>
              <ul className="space-y-2">
                {next.map(t => (
                  <li key={t.id} className="flex items-center gap-3 text-[13px]">
                    <Cover src={t.thumb ?? t.image} lazy className="size-9 shrink-0 rounded-md shadow-thumb" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block truncate text-xs text-fg-2">{t.artists.join(', ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 티어 버튼. 좁은 화면은 3열 카드, 넓은 화면은 설명·비율이 붙은 한 줄. 지금까지의 비율을 권장 비율과 함께 보여 준다 */
function TierButton({ tier, counts, onClick }: { tier: Tier; counts: TierCounts; onClick: () => void }) {
  const style = TIER_STYLE[tier];
  const done = counts[1] + counts[2] + counts[3];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts={String(tier)}
      title={RATIO_NOTE}
      className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-section px-2 py-2.5 transition-[background-color,transform] hover:bg-sub-strong active:scale-[0.98] lg:flex-row lg:gap-4 lg:px-4 lg:py-3"
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white ${style.fill}`} aria-hidden>
        {tier}
      </span>
      <span className="min-w-0 text-center lg:flex-1 lg:text-left">
        <span className="block text-[13px] font-semibold lg:text-[15px]">
          {style.name}<span className="sr-only"> (Tier {tier})</span>
        </span>
        <span className="hidden truncate text-xs text-fg-2 lg:block">
          {style.hint} · 권장 {fmtPercent(TARGET_SHARE[tier], 0)}
        </span>
      </span>
      <span className="text-[11px] text-fg-2 tabular-nums lg:text-right lg:text-xs">
        <span className="lg:block lg:text-[15px] lg:font-semibold lg:text-fg">{fmtCount(counts[tier])}곡</span>
        <span className="hidden lg:inline">{done ? fmtPercent(counts[tier] / done, 0) : '—'}</span>
      </span>
    </button>
  );
}
