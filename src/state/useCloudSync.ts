import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { summarize, type SessionData } from '../core/session/schema';
import { useLoggedIn } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { isCloudConfigured } from '../services/config';
import { fetchCloudSummary, saveCloudSession, type CloudSummary } from '../services/storage/cloud';
import type { CloudStatus, SupabaseInfo } from './context';
import type { Action, AppState } from './reducer';
import { autoSaveDelay } from './savePolicy';

function sameProgress(summary: CloudSummary, session: SessionData): boolean {
  return (
    summary.trackCount === session.tracks.length &&
    summary.tieredCount === session.tracks.filter(t => t.tier !== null).length &&
    summary.compCount === session.compCount
  );
}

interface Options {
  /** false면 Supabase에 쓰지 않는다 (Life Hub 동기화가 켜져 있고 쓰기가 성공한 뒤). 읽기는 그대로 한다 */
  writesAllowed: boolean;
  state: AppState;
  dispatch: Dispatch<Action>;
  flushLocal: () => string | null;
  localSavedAt: string | null;
  localError: boolean;
}

/**
 * Supabase 자동 백업. (5단계에서 정리 예정 — 그때까지 읽기와 롤백 경로로 남겨 둔다)
 * - writesAllowed가 false이면 쓰지 않는다. 요약 읽기는 한다.
 * - 다른 계정의 세션이면 올리지 않는다 ('blocked').
 * - 이 세션이 마지막으로 맞춘 클라우드 버전(session.syncedAt)과 지금 클라우드 버전이 다르면
 *   다른 기기에서 저장한 것이므로, 사용자가 고르기 전까지 덮어쓰지 않는다 ('conflict').
 */
export function useCloudSync({ writesAllowed, state, dispatch, flushLocal, localSavedAt, localError }: Options): SupabaseInfo {
  const cfg = useConfig();
  const loggedIn = useLoggedIn();
  const userId = loggedIn ? state.user?.id ?? null : null;
  const enabled = isCloudConfigured(cfg) && !!userId;
  /** 쓰기까지 해도 되는가 */
  const canWrite = enabled && writesAllowed;
  const { session } = state;
  const blocked = !!(userId && session.ownerId && session.ownerId !== userId);
  const unsaved = Math.max(0, state.revision - state.cloudRevision);

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveAt, setLastSaveAt] = useState<Date | null>(null);
  const [summary, setSummary] = useState<CloudSummary | null | undefined>(undefined);
  const busy = useRef(false);
  const latest = useRef({ session, revision: state.revision });
  useEffect(() => {
    latest.current = { session, revision: state.revision };
  });

  const conflict = !!(
    summary &&
    session.tracks.length &&
    summary.savedAt !== session.syncedAt &&
    !sameProgress(summary, session)
  );

  const upload = useCallback(async (): Promise<boolean> => {
    if (!canWrite || !userId || blocked || busy.current) return false;
    // 로컬과 클라우드에 같은 저장 시각을 남겨 두 사본이 같은 버전임을 표시
    const savedAt = flushLocal() ?? new Date().toISOString();
    const { session: s, revision } = latest.current;
    if (!s.tracks.length) return false;
    busy.current = true;
    setStatus('saving');
    try {
      await saveCloudSession(cfg, userId, { ...s, savedAt });
      dispatch({ type: 'cloudSaved', revision, savedAt });
      setSummary({ ...summarize({ ...s, savedAt }), updatedAt: new Date().toISOString() });
      setLastSaveAt(new Date());
      setStatus('saved');
      return true;
    } catch (e) {
      console.warn('[cloud] 저장 실패', e);
      setStatus('error');
      return false;
    } finally {
      busy.current = false;
    }
  }, [canWrite, userId, blocked, cfg, dispatch, flushLocal]);

  // 자동 업로드
  const hasTracks = session.tracks.length > 0;
  useEffect(() => {
    const delay = autoSaveDelay({
      canSave: canWrite && !blocked && !conflict && hasTracks && status !== 'saving',
      unsaved,
      failed: status === 'error',
    });
    if (delay === null) return;
    const timer = setTimeout(() => { void upload(); }, delay);
    return () => clearTimeout(timer);
  }, [canWrite, blocked, conflict, hasTracks, unsaved, status, upload]);

  const refreshCloudSummary = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      setSummary(await fetchCloudSummary(cfg, userId));
    } catch (e) {
      console.warn('[cloud] 요약 조회 실패', e);
    }
  }, [enabled, userId, cfg]);

  // 로그인 직후 한 번(그리고 Life Hub 동기화를 끄고 Supabase 백업으로 돌아올 때):
  // 클라우드 상태 확인 → 같은 버전이면 기준점 기록, 로컬만 앞서 있으면 업로드 예약
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    fetchCloudSummary(cfg, userId)
      .then(cloud => {
        if (cancelled) return;
        setSummary(cloud);
        const { session: s, revision } = latest.current;
        if (!s.tracks.length) return;
        if (!writesAllowed) return; // 읽기만: 요약만 보여 주고 기준점·업로드 예약은 건드리지 않는다
        if (cloud?.savedAt && cloud.savedAt !== s.syncedAt && sameProgress(cloud, s)) {
          dispatch({ type: 'cloudSaved', revision, savedAt: cloud.savedAt });
        } else if (!cloud || cloud.savedAt === s.syncedAt) {
          const localAhead = !s.syncedAt || (s.savedAt ?? '') > s.syncedAt;
          if (localAhead) dispatch({ type: 'markDirty' });
        }
      })
      .catch(e => console.warn('[cloud] 요약 조회 실패', e));
    return () => { cancelled = true; };
  }, [enabled, userId, cfg, dispatch, writesAllowed]);

  // 탭을 떠날 때 남은 변경을 바로 올려 본다. 로컬은 이미 저장돼 있고, 못 올린 변경은
  // 다음 방문 때 다시 올라가므로 "나가시겠습니까?" 확인창은 띄우지 않는다.
  useEffect(() => {
    if (!canWrite || blocked || conflict || unsaved === 0) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void upload();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [canWrite, blocked, conflict, unsaved, upload]);

  // 쓰기를 멈춘 동안(Life Hub 사용 중)에는 충돌·저장 상태를 Supabase 쪽에서 내세우지 않는다
  const cloud: CloudStatus = !canWrite
    ? 'off'
    : blocked
      ? 'blocked'
      : conflict
        ? 'conflict'
        : status;

  return {
    cloud,
    unsaved,
    lastCloudSaveAt: lastSaveAt,
    localSavedAt,
    localError,
    cloudSummary: enabled ? summary : undefined,
    writesStopped: enabled && !writesAllowed,
    saveNow: upload,
    refreshCloudSummary,
  };
}
