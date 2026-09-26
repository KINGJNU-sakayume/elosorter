import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { summarize, type SessionData } from '../core/session/schema';
import { useLoggedIn } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { isCloudConfigured } from '../services/config';
import { fetchCloudSummary, saveCloudSession, type CloudSummary } from '../services/storage/cloud';
import type { CloudStatus, SaveInfo } from './context';
import type { Action, AppState } from './reducer';

/** 이만큼 변경이 쌓이면 바로 업로드, 아니면 마지막 변경 후 IDLE_MS 뒤에 업로드 */
const SAVE_EVERY = 10;
const IDLE_MS = 15_000;
const RETRY_MS = 30_000;

function sameProgress(summary: CloudSummary, session: SessionData): boolean {
  return (
    summary.trackCount === session.tracks.length &&
    summary.tieredCount === session.tracks.filter(t => t.tier !== null).length &&
    summary.compCount === session.compCount
  );
}

interface Options {
  state: AppState;
  dispatch: Dispatch<Action>;
  flushLocal: () => string | null;
  localSavedAt: string | null;
  localError: boolean;
}

/**
 * Supabase 자동 백업.
 * - 다른 계정의 세션이면 올리지 않는다 ('blocked').
 * - 이 세션이 마지막으로 맞춘 클라우드 버전(session.syncedAt)과 지금 클라우드 버전이 다르면
 *   다른 기기에서 저장한 것이므로, 사용자가 고르기 전까지 덮어쓰지 않는다 ('conflict').
 */
export function useCloudSync({ state, dispatch, flushLocal, localSavedAt, localError }: Options): SaveInfo {
  const cfg = useConfig();
  const loggedIn = useLoggedIn();
  const userId = loggedIn ? state.user?.id ?? null : null;
  const enabled = isCloudConfigured(cfg) && !!userId;
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
    if (!enabled || !userId || blocked || busy.current) return false;
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
  }, [enabled, userId, blocked, cfg, dispatch, flushLocal]);

  // 자동 업로드
  const hasTracks = session.tracks.length > 0;
  useEffect(() => {
    if (!enabled || blocked || conflict || !hasTracks || unsaved === 0 || status === 'saving') return;
    const delay = status === 'error' ? RETRY_MS : unsaved >= SAVE_EVERY ? 0 : IDLE_MS;
    const timer = setTimeout(() => { void upload(); }, delay);
    return () => clearTimeout(timer);
  }, [enabled, blocked, conflict, hasTracks, unsaved, status, upload]);

  const refreshCloudSummary = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      setSummary(await fetchCloudSummary(cfg, userId));
    } catch (e) {
      console.warn('[cloud] 요약 조회 실패', e);
    }
  }, [enabled, userId, cfg]);

  // 로그인 직후 한 번: 클라우드 상태 확인 → 같은 버전이면 기준점 기록, 로컬만 앞서 있으면 업로드 예약
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    fetchCloudSummary(cfg, userId)
      .then(cloud => {
        if (cancelled) return;
        setSummary(cloud);
        const { session: s, revision } = latest.current;
        if (!s.tracks.length) return;
        if (cloud?.savedAt && cloud.savedAt !== s.syncedAt && sameProgress(cloud, s)) {
          dispatch({ type: 'cloudSaved', revision, savedAt: cloud.savedAt });
        } else if (!cloud || cloud.savedAt === s.syncedAt) {
          const localAhead = !s.syncedAt || (s.savedAt ?? '') > s.syncedAt;
          if (localAhead) dispatch({ type: 'markDirty' });
        }
      })
      .catch(e => console.warn('[cloud] 요약 조회 실패', e));
    return () => { cancelled = true; };
  }, [enabled, userId, cfg, dispatch]);

  // 탭을 떠날 때 남은 변경을 바로 올려 본다. 로컬은 이미 저장돼 있고, 못 올린 변경은
  // 다음 방문 때 다시 올라가므로 "나가시겠습니까?" 확인창은 띄우지 않는다.
  useEffect(() => {
    if (!enabled || blocked || conflict || unsaved === 0) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void upload();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [enabled, blocked, conflict, unsaved, upload]);

  const cloud: CloudStatus = !enabled
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
    saveNow: upload,
    refreshCloudSummary,
  };
}
