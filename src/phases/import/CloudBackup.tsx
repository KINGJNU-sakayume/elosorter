import { useState } from 'react';
import { CloudDownload, CloudUpload, Settings, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/confirm';
import { useConfig } from '../../hooks/useConfig';
import { errorMessage, fmtCount, fmtDateTime } from '../../lib/format';
import { isCloudConfigured } from '../../services/config';
import { deleteCloudSession, loadCloudSession } from '../../services/storage/cloud';
import { useAppDispatch, useAppState, useSave, useToast } from '../../state/context';

/** 클라우드(Supabase) 백업 상태와 불러오기·덮어쓰기 (백업 묶음의 한 줄) */
export default function CloudBackup({ onOpenSettings }: { onOpenSettings: () => void }) {
  const cfg = useConfig();
  const { session, user } = useAppState();
  const dispatch = useAppDispatch();
  const save = useSave();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'load' | 'delete' | null>(null);

  if (!isCloudConfigured(cfg)) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 @sm:flex-row @sm:items-center sm:px-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">클라우드 백업</h3>
          <p className="mt-0.5 text-[13px] text-fg-2">꺼져 있습니다. Supabase를 설정하면 여러 기기에서 이어서 할 수 있습니다.</p>
        </div>
        <Button size="sm" icon={Settings} className="self-start @sm:self-auto" onClick={onOpenSettings}>설정</Button>
      </div>
    );
  }

  const summary = save.cloudSummary;
  const hasLocal = session.tracks.length > 0;
  const inSync = !!summary && summary.savedAt === session.syncedAt && save.unsaved === 0;

  const loadFromCloud = async () => {
    if (!user) return;
    if (hasLocal && !inSync) {
      const ok = await confirm({
        title: '클라우드 버전으로 바꿀까요?',
        message: `이 기기의 세션(${fmtCount(session.tracks.length)}곡 · 비교 ${fmtCount(session.compCount)}회)이 클라우드 버전으로 바뀝니다.`,
        confirmLabel: '클라우드 버전 불러오기',
      });
      if (!ok) return;
    }
    setBusy('load');
    try {
      const cloud = await loadCloudSession(cfg, user.id);
      if (!cloud?.tracks.length) {
        toast('클라우드에 불러올 세션이 없습니다', 'error');
        return;
      }
      dispatch({ type: 'hydrate', session: cloud, origin: 'cloud' });
      toast(`클라우드에서 ${fmtCount(cloud.tracks.length)}곡을 불러왔습니다`, 'success');
    } catch (e) {
      toast(`클라우드 불러오기 실패: ${errorMessage(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!user) return;
    const ok = await confirm({
      title: '클라우드 백업을 삭제할까요?',
      message: '이 기기의 세션은 그대로 남습니다. 다른 기기에서 이어서 하려면 다시 백업해야 합니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteCloudSession(cfg, user.id);
      await save.refreshCloudSummary();
      toast('클라우드 백업을 삭제했습니다');
    } catch (e) {
      toast(`삭제 실패: ${errorMessage(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`px-4 py-4 sm:px-5 ${save.cloud === 'conflict' ? 'bg-warn-soft' : ''}`}>
      <h3 className="text-[15px] font-semibold">클라우드 백업</h3>
      {summary === undefined ? (
        <p className="mt-0.5 text-[13px] text-fg-2">클라우드 상태를 확인하는 중…</p>
      ) : summary === null ? (
        <div className="mt-0.5 flex flex-col items-start gap-3 @sm:flex-row @sm:items-center @sm:justify-between">
          <p className="text-[13px] text-fg-2">클라우드에 저장된 세션이 없습니다.{hasLocal && ' 변경 사항은 자동으로 백업됩니다.'}</p>
          {hasLocal && (
            <Button size="sm" icon={CloudUpload} loading={save.cloud === 'saving'} onClick={() => void save.saveNow()}>
              지금 백업
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-[13px] tabular-nums">
            {fmtCount(summary.trackCount)}곡 · 분류 {fmtCount(summary.tieredCount)} · 비교 {fmtCount(summary.compCount)}회
            <span className="text-fg-2"> · {fmtDateTime(summary.savedAt ?? summary.updatedAt)}</span>
          </p>
          <p className="mt-0.5 text-xs text-fg-2">
            {save.cloud === 'conflict'
              ? '이 기기의 세션과 다른 버전입니다(다른 기기에서 저장했거나 이전 세션). 자동 백업이 덮어쓰지 않도록 멈춰 두었습니다 — 어느 쪽을 쓸지 골라 주세요.'
              : !hasLocal
                ? '이 기기에는 세션이 없습니다. 불러와서 이어서 할 수 있습니다.'
                : inSync
                  ? '이 기기와 같은 버전입니다.'
                  : '이 기기에 더 최근 변경이 있습니다 (자동 백업 대기 중).'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={!hasLocal || save.cloud === 'conflict' ? 'primary' : 'secondary'}
              icon={CloudDownload}
              loading={busy === 'load'}
              disabled={inSync}
              onClick={loadFromCloud}
            >
              클라우드 버전 불러오기
            </Button>
            {hasLocal && (
              <Button
                size="sm"
                icon={CloudUpload}
                loading={save.cloud === 'saving'}
                disabled={save.cloud === 'blocked' || inSync}
                onClick={async () => {
                  if (save.cloud === 'conflict') {
                    const ok = await confirm({
                      title: '이 기기 버전으로 덮어쓸까요?',
                      message: '클라우드에 있는 다른 기기의 버전은 사라집니다.',
                      confirmLabel: '덮어쓰기',
                      tone: 'danger',
                    });
                    if (!ok) return;
                  }
                  if (await save.saveNow()) toast('클라우드에 저장했습니다', 'success');
                }}
              >
                {save.cloud === 'conflict' ? '이 기기 버전으로 덮어쓰기' : '지금 백업'}
              </Button>
            )}
            <Button size="sm" variant="danger" icon={Trash2} loading={busy === 'delete'} className="@sm:ml-auto" onClick={remove}>
              클라우드 삭제
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
