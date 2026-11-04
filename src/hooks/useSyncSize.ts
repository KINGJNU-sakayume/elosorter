import { useEffect, useState } from 'react';
import type { SessionData } from '../core/session/schema';
import { measureSyncDocument, type SyncSize } from '../core/session/syncDoc';

const DELAY_MS = 400;

/**
 * 세션을 동기화 문서로 만들었을 때의 크기. 직렬화는 곡이 많으면 수 ms~수십 ms 걸리므로
 * 비교를 이어 가는 동안에는 잠깐 모았다가 계산한다. 세션이 없으면 null.
 */
export function useSyncSize(session: SessionData): SyncSize | null {
  const [size, setSize] = useState<{ of: SessionData; value: SyncSize } | null>(null);
  const hasTracks = session.tracks.length > 0;
  useEffect(() => {
    if (!hasTracks) return;
    const timer = setTimeout(() => setSize({ of: session, value: measureSyncDocument(session) }), size ? DELAY_MS : 0);
    return () => clearTimeout(timer);
    // size는 첫 계산만 바로 하려는 용도라 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, hasTracks]);
  return hasTracks ? size?.value ?? null : null;
}
