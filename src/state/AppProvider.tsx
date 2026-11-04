import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react';
import { newSeed } from '../core/rating/rng';
import { loadLocalSession, loadUiPrefs, saveUiPrefs } from '../services/storage/localSession';
import Toast, { type ToastMessage } from '../components/Toast';
import {
  AppDispatchContext, AppStateContext, SaveContext, ToastContext, type SaveInfo, type ToastTone,
} from './context';
import { createInitialState, reducer } from './reducer';
import { useLoggedIn } from '../hooks/useAuth';
import { primaryStatus } from './saveStatus';
import { useLifeHubSync } from './useLifeHubSync';
import { useLocalPersistence } from './useLocalPersistence';

function init() {
  return createInitialState(newSeed(), loadLocalSession(), loadUiPrefs());
}

let toastId = 0;

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: ++toastId, message, tone });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const local = useLocalPersistence(state.session);
  const hub = useLifeHubSync({ state, dispatch, flushLocal: local.flush, toast: showToast });
  const loggedIn = useLoggedIn();
  // 저장 위치: 이 기기(항상) + Life Hub(동기화를 켰을 때). 동기화가 꺼져 있으면 이 기기와 JSON 백업 파일만 쓴다.
  const save: SaveInfo = {
    hub,
    localSavedAt: local.savedAt,
    localError: local.error,
    primary: {
      cloud: primaryStatus(hub.snapshot, loggedIn),
      unsaved: hub.unsaved,
      lastSaveAt: hub.lastSaveAt,
      saveNow: async () => (await hub.engine.push('manual')) === 'ok',
    },
  };

  useEffect(() => {
    saveUiPrefs({ phase: state.phase, focus: state.focus });
  }, [state.phase, state.focus]);

  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStateContext.Provider value={state}>
        <SaveContext.Provider value={save}>
          <ToastContext.Provider value={showToast}>
            {children}
            <Toast toast={toast} onDone={clearToast} />
          </ToastContext.Provider>
        </SaveContext.Provider>
      </AppStateContext.Provider>
    </AppDispatchContext.Provider>
  );
}
