import { CircleMinus, CirclePlus } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useAppDispatch, useAppState } from '../../state/context';

function preview(names: string[]): string {
  const head = names.slice(0, 3).join(' / ');
  return names.length > 3 ? `${head} 외 ${names.length - 3}곡` : head;
}

const banner = 'flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center';

export default function SyncBanners() {
  const { session, pendingNew, pendingRemovedIds } = useAppState();
  const dispatch = useAppDispatch();
  if (!pendingNew.length && !pendingRemovedIds.length) return null;
  const removed = new Set(pendingRemovedIds);
  const removedNames = session.tracks.filter(t => removed.has(t.id)).map(t => `${t.name} — ${t.artists[0] ?? ''}`);

  return (
    <div className="space-y-3">
      {pendingNew.length > 0 && (
        <div className={`${banner} bg-accent-soft`}>
          <CirclePlus className="hidden shrink-0 text-accent sm:block" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <strong>새 곡 {pendingNew.length}곡</strong>이 Spotify에 추가됐습니다
            <p className="mt-0.5 truncate text-xs text-fg-2">{preview(pendingNew.map(t => `${t.name} — ${t.artists[0] ?? ''}`))}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => dispatch({ type: 'dismissNew' })}>나중에</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                dispatch({ type: 'absorbNew' });
                dispatch({ type: 'setPhase', phase: 'tier' });
              }}
            >
              추가하고 분류하기
            </Button>
          </div>
        </div>
      )}
      {pendingRemovedIds.length > 0 && (
        <div className={`${banner} bg-danger-soft`}>
          <CircleMinus className="hidden shrink-0 text-danger sm:block" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <strong>{pendingRemovedIds.length}곡</strong>이 Spotify에서 빠졌습니다
            <p className="mt-0.5 truncate text-xs text-fg-2">{preview(removedNames)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => dispatch({ type: 'dismissRemoval' })}>랭킹에 유지</Button>
            <Button size="sm" variant="danger" onClick={() => dispatch({ type: 'applyRemoval' })}>
              랭킹에서도 삭제
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
