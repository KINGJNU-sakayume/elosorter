import { useCallback, useState } from 'react';
import { errorMessage } from '../../lib/format';
import { fetchSourceTracks } from '../../services/spotify/api';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { diffLibrary } from '../../state/reducer';

/** 현재 세션의 소스를 Spotify에서 다시 받아 새 곡/삭제된 곡을 찾는다 (기존 티어·비교 기록은 유지) */
export function useSync() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if (!session.source) return;
    setSyncing(true);
    try {
      const remote = await fetchSourceTracks(session.source);
      const { added, removedIds } = diffLibrary(session.tracks, remote);
      dispatch({ type: 'syncDetected', remote, at: new Date().toISOString() });
      if (!added.length && !removedIds.length) {
        toast('Spotify와 비교해 바뀐 곡이 없습니다', 'success');
      } else {
        const parts = [
          added.length ? `새 곡 ${added.length}곡` : '',
          removedIds.length ? `빠진 곡 ${removedIds.length}곡` : '',
        ].filter(Boolean);
        toast(`${parts.join(' · ')}을 찾았습니다`);
      }
    } catch (e) {
      toast(`동기화 실패: ${errorMessage(e)}`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [session.source, session.tracks, dispatch, toast]);

  return { sync, syncing };
}
