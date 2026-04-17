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
      const { updatedA, updatedB, rsiDelta, newPairKey, nextPair, newSeenPairs } = action.payload;
      const tracks = state.tracks.map(t => {
        if (t.id === updatedA.id) return { ...updatedA, isNew: updatedA.comparisons >= 8 ? false : t.isNew };
        if (t.id === updatedB.id) return { ...updatedB, isNew: updatedB.comparisons >= 8 ? false : t.isNew };
        return t;
      });
      const newDeltas = [...state.rsiDeltas, rsiDelta].slice(-100);
      return {
        ...state,
        tracks,
        compCount: state.compCount + 1,
        rsiDeltas: newDeltas,
        seenPairs: newSeenPairs,
        lastPairKey: newPairKey,
        curPair: nextPair,
        isChoosing: false,
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
