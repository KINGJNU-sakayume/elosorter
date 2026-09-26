import { useMemo } from 'react';
import { ArrowRight, RefreshCw, Trash2, Trophy } from 'lucide-react';
import { rankingAccuracy } from '../../core/rating/engine';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ProgressBar from '../../components/ui/ProgressBar';
import { useConfirm } from '../../components/ui/confirm';
import { useLoggedIn } from '../../hooks/useAuth';
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
  const next = tiered < total ? 'tier' : 'sort';

  const stats = [
    { label: '곡', value: fmtCount(total) },
    { label: '분류', value: `${fmtCount(tiered)} / ${fmtCount(total)}` },
    { label: '비교', value: `${fmtCount(session.compCount)}회` },
    { label: '예상 정확도', value: accuracy === null ? '—' : fmtPercent(accuracy) },
  ];

  return (
    <Card title="현재 세션" tone="accent" aside={<span className="truncate text-xs text-fg-3">{sourceLabel(session)}</span>}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl bg-section px-3 py-2.5">
            <dt className="text-xs text-fg-3">{s.label}</dt>
            <dd className="mt-0.5 font-mono text-base">{s.value}</dd>
          </div>
        ))}
      </dl>
      <ProgressBar value={total ? tiered / total : 0} label="티어 분류 진행률" className="mt-4" />
      {session.lastSyncedAt && (
        <p className="mt-2 text-xs text-fg-3">마지막 동기화: {fmtDateTime(session.lastSyncedAt)}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={ArrowRight}
          disabled={!canEnter(next, session)}
          onClick={() => dispatch({ type: 'setPhase', phase: next })}
        >
          {tiered < total ? `티어 분류 이어하기 (${fmtCount(total - tiered)}곡 남음)` : '비교 정렬 이어하기'}
        </Button>
        <Button icon={Trophy} disabled={!canEnter('rank', session)} onClick={() => dispatch({ type: 'setPhase', phase: 'rank' })}>
          랭킹
        </Button>
        {loggedIn && session.source && (
          <Button icon={RefreshCw} loading={syncing} onClick={sync} title="Spotify에서 추가·삭제된 곡을 찾아 반영합니다 (기존 기록 유지)">
            Spotify와 동기화
          </Button>
        )}
        <Button
          variant="ghost"
          icon={Trash2}
          className="sm:ml-auto"
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
        >
          세션 삭제
        </Button>
      </div>
    </Card>
  );
}
