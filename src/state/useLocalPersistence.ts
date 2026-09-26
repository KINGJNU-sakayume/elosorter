import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionData } from '../core/session/schema';
import { clearLocalSession, saveLocalSession } from '../services/storage/localSession';

const DEBOUNCE_MS = 300;

/**
 * 세션이 바뀌면 잠깐 모았다가 localStorage에 저장하고, 탭을 닫거나 숨기면 즉시 저장한다.
 * (v1은 컴포넌트마다 따로 저장했고, 티어 분류에서는 dispatch 이전 상태를 저장해 항상 한 곡씩 늦었다.)
 */
export function useLocalPersistence(session: SessionData) {
  const [savedAt, setSavedAt] = useState<string | null>(session.savedAt);
  const [error, setError] = useState(false);
  const latest = useRef(session);
  const persisted = useRef(session);
  const savedAtRef = useRef(session.savedAt);

  useEffect(() => {
    latest.current = session;
  }, [session]);

  /** 대기 중인 변경을 바로 저장하고, 마지막 저장 시각을 돌려준다 */
  const flush = useCallback((): string | null => {
    const s = latest.current;
    if (s === persisted.current) return savedAtRef.current;
    persisted.current = s;
    if (!s.tracks.length) {
      clearLocalSession();
      savedAtRef.current = null;
      setSavedAt(null);
      return null;
    }
    const at = new Date().toISOString();
    const ok = saveLocalSession({ ...s, savedAt: at });
    setError(!ok);
    if (ok) {
      savedAtRef.current = at;
      setSavedAt(at);
    }
    return savedAtRef.current;
  }, []);

  useEffect(() => {
    if (session === persisted.current) return;
    const timer = setTimeout(flush, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [session, flush]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flush]);

  return { savedAt, error, flush };
}
