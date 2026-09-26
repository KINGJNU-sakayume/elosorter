import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react';
import { newSeed } from '../core/rating/rng';
import { loadLocalSession, loadUiPrefs, saveUiPrefs } from '../services/storage/localSession';
import Toast, { type ToastMessage } from '../components/Toast';
import { AppDispatchContext, AppStateContext, SaveContext, ToastContext, type ToastTone } from './context';
import { createInitialState, reducer } from './reducer';
import { useCloudSync } from './useCloudSync';
import { useLocalPersistence } from './useLocalPersistence';

function init() {
  return createInitialState(newSeed(), loadLocalSession(), loadUiPrefs());
}

let toastId = 0;

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const local = useLocalPersistence(state.session);
  const save = useCloudSync({
    state,
    dispatch,
    flushLocal: local.flush,
    localSavedAt: local.savedAt,
    localError: local.error,
  });

  useEffect(() => {
    saveUiPrefs({ phase: state.phase, focus: state.focus });
  }, [state.phase, state.focus]);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: ++toastId, message, tone });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

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
