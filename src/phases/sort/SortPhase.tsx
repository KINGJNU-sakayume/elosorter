import { useCallback, useEffect, useMemo } from 'react';
import { ArrowRight, Layers, SkipForward, Trophy, Undo2 } from 'lucide-react';
import { rankingAccuracy } from '../../core/rating/engine';
import type { Focus } from '../../core/rating/pairing';
import AccuracyMeter from '../../components/AccuracyMeter';
import Button from '../../components/ui/Button';
import Kbd from '../../components/ui/Kbd';
import { useHotkeys, type HotkeyMap } from '../../hooks/useHotkeys';
import { fmtCount } from '../../lib/format';
import { usePlayer } from '../../player/context';
import { useAppDispatch, useAppState } from '../../state/context';
import { CHOICE_HOTKEYS, CHOICES } from './choices';
import CompareCard from './CompareCard';

const FOCUS_OPTIONS: { id: Focus; label: string; title: string }[] = [
  { id: 'all', label: '전체', title: '모든 곡의 순위를 고르게 다듬습니다' },
  { id: 'top', label: '상위권 집중', title: '현재 상위 15%(최소 10곡) 위주로 비교해 Top 10을 먼저 확정합니다' },
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
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Layers className="mx-auto size-10 text-fg-3" aria-hidden />
        <p className="mt-4 text-fg-2">비교하려면 티어를 2곡 이상 분류해야 합니다.</p>
        <Button className="mt-5" icon={ArrowRight} onClick={() => dispatch({ type: 'setPhase', phase: 'tier' })}>
          티어 분류로
        </Button>
      </div>
    );
  }

  const lastA = last ? byId.get(last[0]) : undefined;
  const lastB = last ? byId.get(last[1]) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">
            어느 곡이 더 좋나요? <span className="font-mono text-sm font-normal text-fg-3">#{fmtCount(session.compCount + 1)}</span>
          </h1>
          <p className="mt-0.5 hidden text-xs text-fg-3 sm:block">
            앨범 아트를 누르거나 아래 버튼·단축키로 고르세요. 모르는 곡이면 건너뛰어도 됩니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AccuracyMeter value={accuracy} className="sm:w-72" />
          <div role="radiogroup" aria-label="비교 범위" className="flex shrink-0 rounded-xl border border-line bg-card p-0.5">
            {FOCUS_OPTIONS.map(o => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={focus === o.id}
                title={o.title}
                onClick={() => dispatch({ type: 'setFocus', focus: o.id })}
                className={`h-8 flex-1 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                  focus === o.id ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:text-fg'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div key={`${a.id}|${b.id}`} className="grid grid-cols-2 gap-2.5 sm:gap-5">
        <CompareCard track={a} side="A" playKey="A" onPick={() => choose(1)} />
        <CompareCard track={b} side="B" playKey="B" onPick={() => choose(0)} />
      </div>

      <div role="group" aria-label="응답" className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {CHOICES.map(c => (
          <button
            key={c.score}
            type="button"
            onClick={() => choose(c.score)}
            aria-keyshortcuts={c.keys.join(' ')}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-card px-1 transition-colors hover:border-accent-line hover:bg-accent-soft ${
              c.score === 0.5 ? 'text-fg-2' : 'text-fg'
            }`}
          >
            <span className="text-xs font-semibold sm:text-sm">
              <span className="sm:hidden">{c.short}</span>
              <span className="hidden sm:inline">{c.label}</span>
            </span>
            <span className="hidden gap-1 sm:flex">
              {c.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
            </span>
          </button>
        ))}
      </div>

      {player.status === 'embed' && player.reason && (
        <p className="-mt-1 text-center text-xs text-fg-3">{player.reason}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={Undo2} kbd="Z" disabled={!last} onClick={undo}>되돌리기</Button>
        <Button size="sm" variant="ghost" icon={SkipForward} kbd="S" onClick={skip}>건너뛰기</Button>
        {lastA && lastB && last && (
          <p className="order-last w-full truncate text-xs text-fg-3 sm:order-none sm:w-auto sm:flex-1" title="직전 비교">
            직전: {lastA.name} <span className="font-mono text-fg-2">{verdict(last[2])}</span> {lastB.name}
          </p>
        )}
        <Button size="sm" icon={Trophy} className="ml-auto" onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>
          랭킹 보기
        </Button>
      </div>
    </div>
  );
}
