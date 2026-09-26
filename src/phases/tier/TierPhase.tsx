import { useCallback, useEffect, useMemo } from 'react';
import { ArrowRight, PartyPopper, Trophy, Undo2 } from 'lucide-react';
import { countTiers } from '../../core/rating/engine';
import { TIERS, type Tier } from '../../core/types';
import { TIER_STYLE } from '../../components/tiers';
import Button from '../../components/ui/Button';
import Cover from '../../components/ui/Cover';
import Kbd from '../../components/ui/Kbd';
import ProgressBar from '../../components/ui/ProgressBar';
import { useConfirm } from '../../components/ui/confirm';
import { useHotkeys } from '../../hooks/useHotkeys';
import { fmtCount, fmtDuration } from '../../lib/format';
import { usePlayer } from '../../player/context';
import EmbedPlayer from '../../player/EmbedPlayer';
import PlayButton from '../../player/PlayButton';
import { useAppDispatch, useAppState } from '../../state/context';
import TierDistribution from './TierDistribution';

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

  // 곡이 바뀌면 자동 재생. 빠르게 연달아 분류할 때 API를 두드리지 않도록 잠깐 기다린다
  const { play, pause, status } = player;
  const uri = current?.uri;
  useEffect(() => {
    if (!uri || status !== 'ready') return;
    const timer = setTimeout(() => play(uri), 250);
    return () => clearTimeout(timer);
  }, [uri, status, play]);
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
      title: `남은 ${fmtCount(untiered.length)}곡을 모두 Tier 3으로 둘까요?`,
      message: '되돌리기(Z)로 한 번에 취소할 수 있고, 나중에 랭킹 화면에서 곡별로 바꿀 수도 있습니다.',
      confirmLabel: 'Tier 3으로 분류',
    });
    if (ok) dispatch({ type: 'assignRemaining', tier: 3 });
  };

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12 text-center">
        <PartyPopper className="mx-auto size-12 text-accent" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">티어 분류 완료</h1>
        <div className="mt-4 flex justify-center gap-2">
          {TIERS.map(tier => (
            <span key={tier} className={`rounded-full border px-3 py-1 text-sm ${TIER_STYLE[tier].line} ${TIER_STYLE[tier].soft} ${TIER_STYLE[tier].text}`}>
              {TIER_STYLE[tier].name} {fmtCount(counts[tier])}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-fg-2">
          이제 두 곡씩 비교해 순위를 다듬습니다. 티어는 랭킹 화면에서 언제든 바꿀 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button variant="primary" size="lg" icon={ArrowRight} onClick={() => dispatch({ type: 'setPhase', phase: 'sort' })}>
            비교 정렬 시작
          </Button>
          <Button size="lg" icon={Trophy} onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>랭킹 보기</Button>
        </div>
        {tierHistory.length > 0 && (
          <Button variant="ghost" size="sm" icon={Undo2} kbd="Z" className="mt-4" onClick={undo}>마지막 분류 되돌리기</Button>
        )}
      </div>
    );
  }

  const next = untiered.slice(1, 4);

  // 휴대폰: 제목·진행률 → 앨범 아트 → 티어 버튼 순서로 쌓아 버튼이 스크롤 없이 보이게 한다.
  // 데스크톱: 왼쪽 열에 앨범 아트, 오른쪽 열에 나머지.
  return (
    <div className="mx-auto grid w-full max-w-5xl content-start gap-4 px-4 py-4 sm:gap-5 md:grid-cols-[minmax(0,22rem)_1fr] md:grid-rows-[auto_auto_1fr] md:gap-x-10 md:py-10">
      <div className="md:col-start-2">
        <h1 className="text-lg font-bold">티어 분류</h1>
        <p className="mt-1 hidden text-sm text-fg-2 sm:block">직감으로 빠르게 고르세요. 정확한 순서는 다음 단계의 1:1 비교가 잡아 줍니다.</p>
        <ProgressBar value={total ? done / total : 0} label="티어 분류 진행률" className="mt-3" />
        <p className="mt-1.5 flex justify-between font-mono text-xs text-fg-3">
          <span>{fmtCount(done)} / {fmtCount(total)}</span>
          <span>{fmtCount(untiered.length)}곡 남음</span>
        </p>
      </div>

      {/* 지금 곡 */}
      <div className="min-w-0 md:col-start-1 md:row-span-3 md:row-start-1">
        <div
          key={current.id}
          className="relative mx-auto aspect-square w-full max-w-[min(100%,34dvh)] animate-pop overflow-hidden rounded-3xl shadow-card md:max-w-none"
        >
          <Cover src={current.image} className="absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/95 via-black/70 to-transparent px-4 pt-16 pb-4 text-white">
            {current.isNew && (
              <span className="mb-2 inline-block rounded-md border border-accent-line bg-black/40 px-2 py-0.5 font-mono text-[0.7rem] text-accent">
                ✦ 새로 추가됨
              </span>
            )}
            <h2 className="font-title truncate text-xl" title={current.name}>{current.name}</h2>
            <p className="truncate text-sm text-white/75">{current.artists.join(', ')}</p>
            <p className="truncate text-xs text-white/50">
              {current.album}{current.durationMs ? ` · ${fmtDuration(current.durationMs)}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-3">
          {player.status === 'embed'
            ? <EmbedPlayer trackId={current.id} title={current.name} />
            : <PlayButton uri={current.uri} label={current.name} hotkey="Space" showStatus />}
          {player.status === 'embed' && player.reason && <p className="mt-1.5 text-xs text-fg-3">{player.reason}</p>}
        </div>
        {next.length > 0 && (
          <div className="mt-5 hidden md:block">
            <h3 className="mb-2 text-xs text-fg-3">다음 곡</h3>
            <ul className="space-y-1.5">
              {next.map(t => (
                <li key={t.id} className="flex items-center gap-2.5 text-sm text-fg-2">
                  <Cover src={t.thumb ?? t.image} lazy className="size-8 shrink-0 rounded" />
                  <span className="truncate">{t.name} <span className="text-fg-3">— {t.artists[0]}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 분류 */}
      <div className="min-w-0 space-y-3 md:col-start-2">
        <div className="space-y-2 sm:space-y-2.5" role="group" aria-label="티어 선택">
          {TIERS.map(tier => {
            const style = TIER_STYLE[tier];
            return (
              <button
                key={tier}
                type="button"
                onClick={() => assign(tier)}
                aria-keyshortcuts={String(tier)}
                className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors sm:py-3.5 ${style.line} ${style.text} ${style.hoverSoft}`}
              >
                <Kbd className="size-7 shrink-0 text-sm">{tier}</Kbd>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Tier {tier} — {style.name}</span>
                  <span className="block text-xs opacity-70">{style.hint}</span>
                </span>
                <span className="font-mono text-xs opacity-70">{fmtCount(counts[tier])}곡</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Undo2} kbd="Z" disabled={!tierHistory.length} onClick={undo}>되돌리기</Button>
          {done > 0 && (
            <Button size="sm" variant="ghost" onClick={bulkAssign}>
              남은 {fmtCount(untiered.length)}곡 모두 Tier 3
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0 md:col-start-2">
        <TierDistribution counts={counts} />
      </div>
    </div>
  );
}
