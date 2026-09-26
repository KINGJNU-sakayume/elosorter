import { useEffect, useRef } from 'react';
import { fetchDurations, fetchPlaylistName, playlistIdOf } from '../services/spotify/api';
import { useAppDispatch, useAppState } from '../state/context';

/**
 * 옛 세션에 빠진 정보를 한 번씩 채운다: 재생 길이(1-c 이전에 불러온 곡), 플레이리스트 이름(v1 세션).
 * 곡마다 한 번만 시도하고, 실패해도 다시 시도하지 않는다.
 */
export function useBackfill(loggedIn: boolean): void {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const tried = useRef(new Set<string>());
  const triedName = useRef<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    const ids = session.tracks
      .filter(t => !t.durationMs && !tried.current.has(t.id))
      .map(t => t.id);
    if (!ids.length) return;
    ids.forEach(id => tried.current.add(id));
    let cancelled = false;
    fetchDurations(ids)
      .then(items => { if (!cancelled && items.length) dispatch({ type: 'enrichDurations', items }); })
      .catch(e => console.warn('[backfill] 재생 길이 보강 실패', e));
    return () => { cancelled = true; };
  }, [loggedIn, session.tracks, dispatch]);

  const { source, sourceName } = session;
  useEffect(() => {
    const playlistId = source ? playlistIdOf(source) : null;
    if (!loggedIn || !playlistId || sourceName || triedName.current === playlistId) return;
    triedName.current = playlistId;
    let cancelled = false;
    void fetchPlaylistName(playlistId).then(name => {
      if (!cancelled && name) dispatch({ type: 'setSourceName', name });
    });
    return () => { cancelled = true; };
  }, [loggedIn, source, sourceName, dispatch]);
}
