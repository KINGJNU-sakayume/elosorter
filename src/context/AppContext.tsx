import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import type { AppState, AppAction } from '../utils/types';
import { getNextPair, initRating } from '../utils/elo';

const initial: AppState = {
  phase: 'import',
  tracks: [],
  compCount: 0,
  rsiDeltas: [],
  currentSource: null,
  lastSyncedAt: null,
  tierHistory: [],
  seenPairs: new Set(),
  curPair: null,
  lastPairKey: '',
  isChoosing: false,
  user: null,
  pendingNewTracks: [],
  pendingRemovedIds: [],
  sortHistory: [],
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SET_TRACKS': {
      const tracks = action.payload;
      const curPair = getNextPair(tracks, state.seenPairs, state.lastPairKey);
      return { ...state, tracks, curPair };
    }

    case 'SET_USER':
      return { ...state, user: action.payload };

    case 'ASSIGN_TIER': {
      const { id, tier } = action.payload;
      const tracks = state.tracks.map(t =>
        t.id === id ? { ...t, tier, rating: initRating(tier) } : t
      );
      return { ...state, tracks, tierHistory: [...state.tierHistory, id] };
    }

    case 'UNDO_TIER': {
      if (!state.tierHistory.length) return state;
      const history = [...state.tierHistory];
      const id = history.pop()!;
      const tracks = state.tracks.map(t =>
        t.id === id ? { ...t, tier: null as 1 | 2 | 3 | null, rating: 1500 } : t
      );
      return { ...state, tracks, tierHistory: history };
    }

    case 'CHOOSE_START':
      if (state.isChoosing || !state.curPair) return state;
      return { ...state, isChoosing: true };

    case 'CHOOSE_DONE': {
      const { updatedA, updatedB, rsiDelta, newPairKey, nextPair, newSeenPairs, prevA, prevB, prevCurPair, prevLastPairKey } = action.payload;
      const tracks = state.tracks.map(t => {
        if (t.id === updatedA.id) return { ...updatedA, isNew: updatedA.comparisons >= 8 ? false : t.isNew };
        if (t.id === updatedB.id) return { ...updatedB, isNew: updatedB.comparisons >= 8 ? false : t.isNew };
        return t;
      });
      const newDeltas = [...state.rsiDeltas, rsiDelta].slice(-100);
      // 🆕 되돌리기용 히스토리에 push (최근 20개만 유지)
      const newHistory = [...state.sortHistory, { trackA: prevA, trackB: prevB, rsiDelta, pairKey: newPairKey, prevCurPair, prevLastPairKey }].slice(-20);
      return {
        ...state,
        tracks,
        compCount: state.compCount + 1,
        rsiDeltas: newDeltas,
        seenPairs: newSeenPairs,
        lastPairKey: newPairKey,
        curPair: nextPair,
        isChoosing: false,
        sortHistory: newHistory,
      };
    }

    case 'UNDO_CHOOSE': {
      if (!state.sortHistory.length) return state;
      const history = [...state.sortHistory];
      const last = history.pop()!;
      // 트랙 상태를 비교 전으로 되돌림
      const tracks = state.tracks.map(t => {
        if (t.id === last.trackA.id) return last.trackA;
        if (t.id === last.trackB.id) return last.trackB;
        return t;
      });
      // seenPairs에서 해당 쌍 제거
      const newSeen = new Set(state.seenPairs);
      newSeen.delete(last.pairKey);
      // rsiDeltas 마지막 항목 제거
      const newDeltas = state.rsiDeltas.slice(0, -1);
      return {
        ...state,
        tracks,
        compCount: Math.max(0, state.compCount - 1),
        rsiDeltas: newDeltas,
        seenPairs: newSeen,
        lastPairKey: last.prevLastPairKey,
        curPair: last.prevCurPair,
        sortHistory: history,
      };
    }

    case 'SET_PENDING_NEW':
      return { ...state, pendingNewTracks: action.payload };

    case 'ABSORB_NEW': {
      if (!state.pendingNewTracks.length) return state;
      const merged = [...state.tracks, ...state.pendingNewTracks];
      const curPair = getNextPair(merged, state.seenPairs, state.lastPairKey);
      return { ...state, tracks: merged, pendingNewTracks: [], curPair };
    }

    case 'SET_PENDING_REMOVED':
      return { ...state, pendingRemovedIds: action.payload };

    case 'APPLY_REMOVAL': {
      if (!state.pendingRemovedIds.length) return state;
      const removedSet = new Set(state.pendingRemovedIds);
      const tracks = state.tracks.filter(t => !removedSet.has(t.id));
      const tierHistory = state.tierHistory.filter(id => !removedSet.has(id));
      const curPair = getNextPair(tracks, state.seenPairs, state.lastPairKey);
      return { ...state, tracks, tierHistory, pendingRemovedIds: [], curPair };
    }

    case 'DISMISS_REMOVAL':
      return { ...state, pendingRemovedIds: [] };

    case 'ENRICH_TRACKS': {
      // 곡들에 previewUrl, durationMs 추가 (기존 값 유지)
      const enrichMap = new Map(action.payload.map(e => [e.id, e]));
      const tracks = state.tracks.map(t => {
        const e = enrichMap.get(t.id);
        if (!e) return t;
        return { ...t, previewUrl: e.previewUrl, durationMs: e.durationMs };
      });
      return { ...state, tracks };
    }

    case 'LOAD_STATE': {
      const { seenPairs, tracks, ...rest } = action.payload;
      const loadedTracks = tracks ?? state.tracks;
      const loadedSeen = new Set(seenPairs ?? []);
      const curPair = getNextPair(loadedTracks, loadedSeen, rest.lastPairKey ?? '');
      return { ...state, ...rest, tracks: loadedTracks, seenPairs: loadedSeen, curPair };
    }

    case 'RESET':
      return { ...initial };

    default:
      return state;
  }
}

interface ContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  showToast: (msg: string, dur?: number) => void;
}

export const AppContext = createContext<ContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, dur = 2800) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => el.classList.remove('show'), dur);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
