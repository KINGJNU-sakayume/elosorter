import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react';
import { newSeed } from '../core/rating/rng';
import { loadLocalSession, loadUiPrefs, saveUiPrefs } from '../services/storage/localSession';
import Toast, { type ToastMessage } from '../components/Toast';
import {
  AppDispatchContext, AppStateContext, SaveContext, ToastContext, type CloudStatus, type SaveInfo, type ToastTone,
} from './context';
import { createInitialState, reducer } from './reducer';
import { supabaseWritesAllowed } from './savePolicy';
import { useCloudSync } from './useCloudSync';
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
  // Life Hub 동기화가 켜져 있고 쓰기가 한 번이라도 성공했으면 Supabase에는 더 이상 쓰지 않는다. 끄면 다시 쓴다 (롤백).
  const supabase = useCloudSync({
    writesAllowed: supabaseWritesAllowed(hub.snapshot),
    state,
    dispatch,
    flushLocal: local.flush,
    localSavedAt: local.savedAt,
    localError: local.error,
  });

  const snap = hub.snapshot;
  const hubShown = snap.enabled;
  const primary: SaveInfo['primary'] = hubShown
    ? {
        cloud: !snap.connected ? 'disconnected' : (snap.status === 'off' ? 'off' : snap.status) as CloudStatus,
        unsaved: hub.unsaved,
        lastSaveAt: hub.lastSaveAt,
        saveNow: async () => (await hub.engine.push('manual')) === 'ok',
      }
    : { cloud: supabase.cloud, unsaved: supabase.unsaved, lastSaveAt: supabase.lastCloudSaveAt, saveNow: supabase.saveNow };
  const save: SaveInfo = { ...supabase, hub, primary };

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
