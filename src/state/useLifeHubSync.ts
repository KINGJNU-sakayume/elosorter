import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch } from 'react';
import { useLoggedIn } from '../hooks/useAuth';
import { createHubEngine, type HubHost } from '../services/lifehub/engine';
import {
  beginConnect, browserDeps, completeStoredCallback, connectAvailable, disconnect as disconnectHub, LifeHubError,
} from '../services/lifehub/remote';
import { STATE_KEY } from '../services/lifehub/state';
import { stashReplacedSession } from '../services/storage/localSession';
import { exportBackup } from '../services/download';
import type { HubInfo, ShowToast } from './context';
import type { Action, AppState } from './reducer';
import { autoSaveDelay } from './savePolicy';

interface Options {
  state: AppState;
  dispatch: Dispatch<Action>;
  flushLocal: () => string | null;
  toast: ShowToast;
}

const TOKENS_KEY = 'elo:lifehub.tokens.v1';

/**
 * Life Hub 기기 동기화. 판단은 services/lifehub/engine.ts가 하고, 여기서는 앱 상태와 이어 붙이고 시점만 정한다:
 *  - 앱 시작·탭이 다시 보일 때 서버 meta를 확인한다 (폴링 없음).
 *  - 변경 10개마다, 또는 마지막 변경 15초 뒤에 올린다. 오류로 멈췄던 것은 30초 뒤에 다시 (savePolicy.ts).
 *  - 탭이 숨겨질 때 남은 변경을 바로 올려 본다.
 */
export function useLifeHubSync({ state, dispatch, flushLocal, toast }: Options): HubInfo {
  const loggedIn = useLoggedIn();
  const userId = loggedIn ? state.user?.id ?? null : null;
  const unsaved = Math.max(0, state.revision - state.hubRevision);

  const latestRef = useRef({ state, userId, flushLocal, unsaved });
  useEffect(() => {
    latestRef.current = { state, userId, flushLocal, unsaved };
  });
  // 엔진이 부르는 시점(이벤트·타이머)에 가장 최근에 그려진 값을 읽는다
  const latest = useCallback(() => latestRef.current, []);

  // 호스트 함수(latest 등)는 엔진이 이벤트·타이머·효과에서만 부른다. 렌더 중에는 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [{ engine, deps }] = useState(() => {
    const deps = browserDeps();
    const host: HubHost = {
      session: () => latest().state.session,
      revision: () => latest().state.revision,
      unsaved: () => latest().unsaved,
      userId: () => latest().userId,
      flushLocal: () => latest().flushLocal(),
      saved: ({ version, revision }) => dispatch({ type: 'hubSaved', version, revision }),
      rebase: version => dispatch({ type: 'hubBase', version }),
      adopt: session => dispatch({ type: 'hydrate', session, origin: 'hub' }),
      // 저장하지 못하면(용량 초과) 파일로 내려받는다: 바꾸기 전 세션이 어디에도 안 남는 일은 없게 한다
      stash: session => { if (!stashReplacedSession(session)) exportBackup(session); },
      markDirty: () => dispatch({ type: 'markDirty' }),
    };
    return { deps, engine: createHubEngine({ deps, host, userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent }) };
  });
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [lastSaveAt, setLastSaveAt] = useState<Date | null>(null);
  useEffect(() => {
    if (snapshot.lastSyncAt) setLastSaveAt(new Date(snapshot.lastSyncAt));
  }, [snapshot.lastSyncAt]);

  // 연결을 마치고 돌아온 경우: 콜백 페이지가 남긴 결과로 토큰을 받는다.
  // completeStoredCallback은 결과를 읽는 즉시 지우므로 StrictMode의 이중 실행에도 한 번만 처리된다.
  // 엔진은 Provider와 수명이 같아서, 효과가 정리된 뒤에 끝나도 결과를 버리지 않는다.
  useEffect(() => {
    void completeStoredCallback(deps).then(
      done => {
        if (!done) return;
        engine.refresh();
        toast('Life Hub에 연결했습니다. 동기화는 설정에서 켜세요', 'success');
        void engine.notifyConnected();
      },
      (e: unknown) => {
        engine.refresh();
        toast(e instanceof LifeHubError ? e.message : 'Life Hub 연결에 실패했어요.', 'error');
      },
    );
  }, [deps, engine, toast]);

  // 다른 탭에서 연결·설정이 바뀌면 반영
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKENS_KEY || e.key === STATE_KEY) engine.refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [engine]);

  const ready = snapshot.enabled && snapshot.connected && !!userId;

  // 앱 시작(그리고 켜기·연결·로그인 직후): 서버 meta를 확인한다
  useEffect(() => {
    if (ready) void engine.check();
  }, [ready, engine]);

  // 탭이 다시 보이면 확인, 숨겨지면 남은 변경을 바로 올려 본다
  useEffect(() => {
    if (!ready) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void engine.check();
      else if (latest().unsaved > 0) void engine.push('auto');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ready, engine, latest]);

  // 변경 뒤 자동 업로드 (savePolicy.ts의 시점 규칙). 충돌·오류·권한 없음에서는 예약하지 않는다.
  // '너무 큼'은 예약한다: 이 기기의 문서 크기는 시도할 때마다 다시 재서(요청 없이), 곡을 줄여 한도 아래가 되면 저절로 풀린다.
  // (서버가 413을 준 경우는 엔진이 건너뛴다: 수동 "지금 동기화"로만 푼다.)
  const status = snapshot.status;
  const hasTracks = state.session.tracks.length > 0;
  useEffect(() => {
    const delay = autoSaveDelay({
      canSave: ready && hasTracks && (status === 'idle' || status === 'retry' || status === 'too_large'),
      unsaved,
      failed: status === 'retry',
    });
    if (delay === null) return;
    const timer = setTimeout(() => { void engine.push('auto'); }, delay);
    return () => clearTimeout(timer);
  }, [ready, hasTracks, status, unsaved, engine]);

  const connect = useCallback(async () => {
    if (!connectAvailable(window.location)) return;
    window.location.assign(await beginConnect(deps));
  }, [deps]);

  const disconnect = useCallback(() => {
    void engine.setEnabled(false);
    disconnectHub(deps);
    engine.refresh();
  }, [deps, engine]);

  const loadCloud = useCallback(() => engine.loadCloud(), [engine]);
  const overwrite = useCallback(() => engine.overwrite(), [engine]);
  const syncNow = useCallback(async () => { await engine.syncNow(); }, [engine]);

  return {
    snapshot,
    engine,
    connectAvailable: typeof window !== 'undefined' && connectAvailable(window.location),
    unsaved,
    lastSaveAt,
    connect,
    disconnect,
    loadCloud,
    overwrite,
    syncNow,
  };
}

