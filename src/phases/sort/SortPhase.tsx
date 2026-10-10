import { useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { ArrowRight, Layers, ListOrdered, SkipForward, Undo2 } from 'lucide-react';
import { rankingAccuracy, tierOnlyAccuracy } from '../../core/rating/engine';
import type { Focus } from '../../core/rating/pairing';
import type { Match, Track } from '../../core/types';
import AccuracyMeter from '../../components/AccuracyMeter';
import Button from '../../components/ui/Button';
import Cover from '../../components/ui/Cover';
import Segmented from '../../components/ui/Segmented';
import { useHotkeys, type HotkeyMap } from '../../hooks/useHotkeys';
import { fmtCount } from '../../lib/format';
import { usePlayer, type PlayerStatus } from '../../player/context';
import LoginHint from '../../player/LoginHint';
import { useAppDispatch, useAppState } from '../../state/context';
import { CHOICE_HOTKEYS, verdictOf } from './choices';
import ChoiceScale from './ChoiceScale';
import CompareCard from './CompareCard';

const FOCUS_OPTIONS: { value: Focus; label: string; title: string }[] = [
  { value: 'all', label: '전체', title: '모든 곡의 순위를 고르게 다듬습니다' },
  { value: 'top', label: '상위권 집중', title: '현재 상위 15%(최소 10곡) 위주로 비교해 Top 10을 먼저 확정합니다' },
];

/** 곡 정보 아래 재생 줄이 차지하는 높이 (index.css의 sort-stage가 아트 크기를 정할 때 뺀다) */
const PLAYER_SPACE: Record<PlayerStatus, string> = {
  off: '0rem',
  loading: '2.5rem',
  ready: '2.5rem',
  embed: '5.5rem',
};

/**
 * 직전 비교. 고르는 순간 다음 쌍으로 바뀌므로, 방금 무엇을 기록했는지 확인할 수 있는 유일한 자리다.
 * 예전의 기호(≫ > ≈ < ≪) 대신 이긴 곡을 굵게, 세기를 말로 적는다.
 */
function LastMatch({ match, byId, className = '' }: { match: Match; byId: Map<string, Track>; className?: string }) {
  const a = byId.get(match[0]);
  const b = byId.get(match[1]);
  if (!a || !b) return null;
  const { winner, word } = verdictOf(match[2]);
  const [first, second] = winner === 'b' ? [b, a] : [a, b];
  const thumb = (t: Track, dim: boolean) => (
    <Cover src={t.thumb ?? t.image} lazy className={`size-[18px] shrink-0 rounded-[4px] sm:size-[22px] ${dim ? 'opacity-70' : ''}`} />
  );
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-xs text-fg-2 sm:gap-2 sm:text-[13px] ${className}`}>
      <span className="shrink-0">직전</span>
      {thumb(first, false)}
      <span className={`min-w-0 shrink truncate ${winner ? 'font-semibold text-fg' : 'text-fg'}`}>{first.name}</span>
      <span className="shrink-0">{winner ? `${word} >` : `${word} ≈`}</span>
      {thumb(second, winner !== null)}
      <span className={`min-w-0 shrink truncate ${winner ? '' : 'text-fg'}`}>{second.name}</span>
    </p>
  );
}

export default function SortPhase() {
  const { session, curPair, focus } = useAppState();
  const dispatch = useAppDispatch();
  const player = usePlayer();

  const byId = useMemo(() => new Map(session.tracks.map(t => [t.id, t])), [session.tracks]);
  const accuracy = useMemo(() => rankingAccuracy(session.tracks), [session.tracks]);
  const baseline = useMemo(() => tierOnlyAccuracy(session.tracks), [session.tracks]);
  const a = curPair ? byId.get(curPair[0]) : undefined;
  const b = curPair ? byId.get(curPair[1]) : undefined;
  const last = session.matches.at(-1);

  const { pause } = player;
  useEffect(() => pause, [pause]);

  const choose = useCallback((score: number) => {
    if (!curPair) return;
    pause();
    dispatch({ type: 'choose', pair: curPair, score });
  }, [curPair, dispatch, pause]);

  const undo = useCallback(() => {
    pause();
    dispatch({ type: 'undoChoose' });
  }, [dispatch, pause]);

  const skip = useCallback(() => {
    pause();
    dispatch({ type: 'skip' });
  }, [dispatch, pause]);

  const hotkeys: HotkeyMap = {
    z: undo,
    s: skip,
    a: () => { if (a) player.toggle(a.uri); },
    b: () => { if (b) player.toggle(b.uri); },
    Space: () => { if (player.currentUri) player.toggle(player.currentUri); },
  };
  for (const [key, score] of Object.entries(CHOICE_HOTKEYS)) hotkeys[key] = () => choose(score);
  useHotkeys(hotkeys);

  if (!a || !b) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-6 py-10">
        <div className="m-auto flex flex-col items-center text-center">
          <Layers className="size-12 text-fg-3" strokeWidth={1.6} aria-hidden />
          <h1 className="mt-4 text-xl font-bold">비교할 곡이 없습니다</h1>
          <p className="mt-1.5 text-[15px] text-fg-2">비교하려면 티어를 2곡 이상 분류해야 합니다.</p>
          <Button className="mt-5" icon={ArrowRight} onClick={() => dispatch({ type: 'setPhase', phase: 'tier' })}>
            티어 분류로
          </Button>
        </div>
      </div>
    );
  }

  // 한 화면에 맞춘다: 위쪽 도구 줄은 제 크기, 나머지 공간(sort-stage)에 아트 두 장·저울·아래 버튼 줄을
  // 한 폭(sort-fit)으로 묶어 가운데 둔다. 창이 낮아 최소 크기도 안 들어가면 잘리는 대신 스크롤된다.
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3 sm:px-6 lg:gap-5 lg:px-10 lg:pt-7 lg:pb-7">
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 lg:min-h-10">
        {/* 좁은 화면에서는 상단 바가 "비교 정렬 #N"을 보여 준다 */}
        <h1 className="sr-only text-[17px] font-bold tracking-tight lg:not-sr-only">
          비교 <span className="font-semibold text-fg-3 tabular-nums">#{fmtCount(session.compCount + 1)}</span>
        </h1>
        {player.status === 'off' && <LoginHint doing="비교" className="order-last w-full lg:order-none lg:w-auto" />}
        {player.status === 'embed' && player.reason && (
          <p className="order-last hidden w-full truncate text-xs text-fg-3 tall:block lg:order-none lg:block lg:w-auto lg:min-w-0 lg:flex-1">{player.reason}</p>
        )}
        <AccuracyMeter value={accuracy} baseline={baseline} className="min-w-0 flex-1 lg:ml-auto lg:w-72 lg:flex-none" />
        <Segmented
          label="비교 범위"
          options={FOCUS_OPTIONS}
          value={focus}
          onChange={f => dispatch({ type: 'setFocus', focus: f })}
        />
      </header>

      <div
        className="sort-stage flex flex-1 items-center justify-center"
        style={{ '--player': PLAYER_SPACE[player.status] } as CSSProperties}
      >
        <div className="sort-fit flex flex-col gap-4 sm:gap-5 lg:gap-6">
          <div key={`${a.id}|${b.id}`} className="grid grid-cols-2 gap-(--gap)">
            <CompareCard track={a} side="A" playKey="A" onPick={() => choose(1)} />
            <CompareCard track={b} side="B" playKey="B" onPick={() => choose(0)} />
          </div>

          <ChoiceScale onChoose={choose} />

          <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:-mt-0.5 lg:-mt-1">
            <Button size="sm" icon={Undo2} kbd="Z" disabled={!last} onClick={undo} className="max-sm:flex-1">되돌리기</Button>
            {last
              ? <LastMatch match={last} byId={byId} className="max-sm:order-first max-sm:w-full sm:flex-1" />
              : <span className="max-sm:hidden sm:flex-1" />}
            <Button size="sm" icon={SkipForward} kbd="S" onClick={skip} className="max-sm:flex-1">건너뛰기</Button>
            {/* 좁은 화면에서는 아래 탭 바에 랭킹이 있다 */}
            <Button size="sm" variant="ghost" icon={ListOrdered} className="max-lg:hidden" onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>
              랭킹 보기
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
