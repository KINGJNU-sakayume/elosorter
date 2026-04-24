import { useState, useRef, useCallback } from 'react';
import { saveToSupabase } from '../utils/supabase';
import { serializeState } from '../utils/config';
import type { AppState, Config } from '../utils/types';

export type SaveStatus = 'idle' | 'saving' | 'ok' | 'error';

export function useCloudSave(state: AppState, cfg: Config, showToast: (msg: string) => void) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const savingRef = useRef(false);

  const runCloudSave = useCallback(async (reason: 'auto' | 'manual' | 'done', count: number) => {
    if (savingRef.current) return;
    if (!cfg.supabaseUrl || !cfg.anonKey) return;
    const userId = state.user?.id;
    if (!userId) return;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const r = await saveToSupabase(serializeState(state), cfg, userId);
      setSaveStatus(r.ok ? 'ok' : 'error');
      if (r.ok) {
        setLastSavedAt(new Date());
        setLastSavedCount(count);
        if (reason === 'manual' || reason === 'done') showToast('☁️ Supabase에 저장됨');
      } else if (reason === 'manual') {
        showToast('❌ 저장 실패 — 네트워크를 확인해주세요');
      }
    } finally {
      savingRef.current = false;
    }
  }, [cfg, state, showToast]);

  return { saveStatus, lastSavedAt, lastSavedCount, runCloudSave };
}
