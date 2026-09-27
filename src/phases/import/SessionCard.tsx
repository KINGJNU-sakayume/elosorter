import { useMemo } from 'react';
import { ListOrdered, Play, RefreshCw, Trash2 } from 'lucide-react';
import { rankingAccuracy } from '../../core/rating/engine';
import Button from '../../components/ui/Button';
import { Mosaic } from '../../components/ui/Cover';
import ProgressBar from '../../components/ui/ProgressBar';
import { useConfirm } from '../../components/ui/confirm';
import { useLoggedIn } from '../../hooks/useAuth';
import { coverImages } from '../../lib/covers';
import { fmtCount, fmtDateTime, fmtPercent } from '../../lib/format';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { canEnter } from '../../state/reducer';
import { sourceLabel } from './sourceLabel';
import { useSync } from './useSync';

export default function SessionCard() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const toast = useToast();
  const loggedIn = useLoggedIn();
  const { sync, syncing } = useSync();

  const total = session.tracks.length;
  const tiered = session.tracks.filter(t => t.tier !== null).length;
  const accuracy = useMemo(() => rankingAccuracy(session.tracks), [session.tracks]);
  const covers = useMemo(() => coverImages(session.tracks), [session.tracks]);
  const next = tiered < total ? 'tier' : 'sort';

  const stats = [
    { label: '곡', value: fmtCount(total) },
    { label: '분류', value: <>{fmtCount(tiered)}<span className="text-sm font-normal text-fg-2"> / {fmtCount(total)}</span></> },
    { label: '비교', value: `${fmtCount(session.compCount)}회` },
    { label: '예상 정확도', value: accuracy === null ? '—' : fmtPercent(accuracy) },
  ];

  return (
    <section className="rounded-2xl bg-section p-4 sm:p-5" aria-labelledby="session-title">
      <div className="flex items-center gap-4">
        <Mosaic images={covers} className="size-16 shrink-0 rounded-lg shadow-thumb sm:size-20" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-accent">현재 세션</p>
          <h2 id="session-title" className="truncate text-xl leading-tight font-bold tracking-tight">{sourceLabel(session)}</h2>
          <p className="mt-0.5 truncate text-xs text-fg-2">
            {session.lastSyncedAt ? `마지막 동기화 ${fmtDateTime(session.lastSyncedAt)}` : '이 브라우저에 저장됨'}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2">
        {stats.map(s => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-xs text-fg-2">{s.label}</dt>
            <dd className="truncate text-[17px] font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <ProgressBar value={total ? tiered / total : 0} label="티어 분류 진행률" className="mt-3" />

      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="primary"
          icon={Play}
          className="w-full"
          disabled={!canEnter(next, session)}
          onClick={() => dispatch({ type: 'setPhase', phase: next })}
        >
          {tiered < total ? `티어 분류 이어하기 · ${fmtCount(total - tiered)}곡 남음` : '비교 정렬 이어하기'}
        </Button>
        <div className="flex gap-2">
          <Button icon={ListOrdered} className="flex-1" disabled={!canEnter('rank', session)} onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>
            랭킹
          </Button>
          {loggedIn && session.source && (
            <Button icon={RefreshCw} className="flex-1" loading={syncing} onClick={sync} title="Spotify에서 추가·삭제된 곡을 찾아 반영합니다 (기존 기록 유지)">
              동기화
            </Button>
          )}
          <Button
            variant="danger"
            icon={Trash2}
            aria-label="세션 삭제"
            title="세션 삭제"
            onClick={async () => {
              const ok = await confirm({
                title: '이 세션을 삭제할까요?',
                message: `${fmtCount(total)}곡의 티어와 비교 ${fmtCount(session.compCount)}회 기록이 이 브라우저에서 지워집니다. 클라우드 백업은 그대로 남습니다.`,
                confirmLabel: '삭제',
                tone: 'danger',
              });
              if (!ok) return;
              dispatch({ type: 'reset' });
              toast('세션을 삭제했습니다');
            }}
          />
        </div>
      </div>
    </section>
  );
}
