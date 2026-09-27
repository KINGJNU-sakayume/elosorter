import { useCallback, useEffect, useMemo } from 'react';
import { ArrowRight, Layers, ListOrdered, SkipForward, Undo2 } from 'lucide-react';
import { rankingAccuracy } from '../../core/rating/engine';
import type { Focus } from '../../core/rating/pairing';
import AccuracyMeter from '../../components/AccuracyMeter';
import Button from '../../components/ui/Button';
import Kbd from '../../components/ui/Kbd';
import Segmented from '../../components/ui/Segmented';
import { useHotkeys, type HotkeyMap } from '../../hooks/useHotkeys';
import { fmtCount } from '../../lib/format';
import { usePlayer } from '../../player/context';
import { useAppDispatch, useAppState } from '../../state/context';
import { CHOICE_HOTKEYS, CHOICES } from './choices';
import CompareCard from './CompareCard';

const FOCUS_OPTIONS: { value: Focus; label: string; title: string }[] = [
  { value: 'all', label: '전체', title: '모든 곡의 순위를 고르게 다듬습니다' },
  { value: 'top', label: '상위권 집중', title: '현재 상위 15%(최소 10곡) 위주로 비교해 Top 10을 먼저 확정합니다' },
];

function verdict(score: number): string {
  if (score >= 0.99) return '≫';
  if (score > 0.5) return '>';
  if (score === 0.5) return '≈';
  if (score > 0.01) return '<';
  return '≪';
}

export default function SortPhase() {
  const { session, curPair, focus } = useAppState();
  const dispatch = useAppDispatch();
  const player = usePlayer();

  const byId = useMemo(() => new Map(session.tracks.map(t => [t.id, t])), [session.tracks]);
  const accuracy = useMemo(() => rankingAccuracy(session.tracks), [session.tracks]);
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

  const lastA = last ? byId.get(last[0]) : undefined;
  const lastB = last ? byId.get(last[1]) : undefined;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3 sm:px-6 lg:gap-6 lg:px-10 lg:pt-8 lg:pb-8">
      <header className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-full md:basis-auto">
          <h1 className="text-lg leading-tight font-bold tracking-tight lg:text-[28px]">
            어느 곡이 더 좋나요? <span className="font-semibold text-fg-3 tabular-nums">#{fmtCount(session.compCount + 1)}</span>
          </h1>
          <p className="mt-1 hidden text-sm text-fg-2 lg:block">
            앨범 아트를 누르거나 아래 버튼·단축키로 고르세요. 모르는 곡이면 건너뛰어도 됩니다.
          </p>
        </div>
        <AccuracyMeter value={accuracy} className="min-w-0 flex-1 md:w-64 md:flex-none" />
        <Segmented
          label="비교 범위"
          options={FOCUS_OPTIONS}
          value={focus}
          onChange={f => dispatch({ type: 'setFocus', focus: f })}
        />
      </header>

      <div key={`${a.id}|${b.id}`} className="grid min-h-64 flex-1 grid-cols-2 gap-3 sm:gap-6 lg:min-h-80 lg:gap-12">
        <CompareCard track={a} side="A" playKey="A" onPick={() => choose(1)} />
        <CompareCard track={b} side="B" playKey="B" onPick={() => choose(0)} />
      </div>

      <div role="group" aria-label="응답" className="mx-auto grid w-full max-w-4xl shrink-0 grid-cols-5 gap-1.5 sm:gap-2 2xl:max-w-6xl">
        {CHOICES.map(c => (
          <button
            key={c.score}
            type="button"
            onClick={() => choose(c.score)}
            aria-keyshortcuts={c.keys.join(' ')}
            className={`flex h-12 flex-col items-center justify-center gap-1 rounded-xl bg-section px-1 transition-[background-color,transform] hover:bg-sub-strong active:scale-[0.97] sm:h-14 ${
              c.score === 0.5 ? 'text-fg-2' : 'text-fg'
            }`}
          >
            <span className="text-[13px] font-semibold sm:text-sm">
              <span className="sm:hidden">{c.short}</span>
              <span className="hidden sm:inline">{c.label}</span>
            </span>
            <span className="hidden gap-1 pointer-fine:flex">
              {c.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
            </span>
          </button>
        ))}
      </div>

      {player.status === 'embed' && player.reason && (
        <p className="-mt-1 hidden shrink-0 text-center text-xs text-fg-3 tall:block lg:block">{player.reason}</p>
      )}

      <footer className="mx-auto flex w-full max-w-4xl shrink-0 flex-wrap items-center gap-2 2xl:max-w-6xl">
        <Button size="sm" icon={Undo2} kbd="Z" disabled={!last} onClick={undo}>되돌리기</Button>
        <Button size="sm" icon={SkipForward} kbd="S" onClick={skip}>건너뛰기</Button>
        {lastA && lastB && last && (
          <p className="order-last w-full truncate text-xs text-fg-2 sm:order-none sm:w-auto sm:flex-1 sm:px-2" title="직전 비교">
            직전: {lastA.name} <span className="font-semibold text-fg">{verdict(last[2])}</span> {lastB.name}
          </p>
        )}
        <Button size="sm" variant="ghost" icon={ListOrdered} className="ml-auto" onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>
          랭킹 보기
        </Button>
      </footer>
    </div>
  );
}
