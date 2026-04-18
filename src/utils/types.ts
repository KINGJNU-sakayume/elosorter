export interface Track {
  id: string;
  name: string;
  artists: string[];
  image: string;
  album: string;
  uri: string;
  addedAt: string | null;
  tier: 1 | 2 | 3 | null;
  rating: number;
  comparisons: number;
  isNew: boolean;
  // 🆕 재생 지원
  previewUrl?: string | null;   // Spotify 30초 프리뷰 URL (null이면 제공 안 됨)
  durationMs?: number;           // 곡 길이 (밀리초)
}

export type Phase = 'import' | 'tier' | 'sort' | 'rank';
export type Source = 'liked' | string;

// 🆕 비교 되돌리기용 스냅샷
export interface SortHistoryEntry {
  trackA: Track;         // 비교 전 A 상태
  trackB: Track;         // 비교 전 B 상태
  rsiDelta: number;      // 이 비교가 만든 rsi 변동분
  pairKey: string;       // 이 쌍의 key
  prevCurPair: [Track, Track] | null;  // 이 비교 전에 제시됐던 curPair
  prevLastPairKey: string;
}

export interface AppState {
  phase: Phase;
  tracks: Track[];
  compCount: number;
  rsiDeltas: number[];
  currentSource: Source | null;
  lastSyncedAt: string | null;
  tierHistory: string[];
  seenPairs: Set<string>;
  curPair: [Track, Track] | null;
  lastPairKey: string;
  isChoosing: boolean;
  user: SpotifyUser | null;
  pendingNewTracks: Track[];
  pendingRemovedIds: string[];
  // 🆕 비교 정렬 되돌리기 스택
  sortHistory: SortHistoryEntry[];
}

export type AppAction =
  | { type: 'SET_PHASE'; payload: Phase }
  | { type: 'SET_TRACKS'; payload: Track[] }
  | { type: 'SET_USER'; payload: SpotifyUser | null }
  | { type: 'ASSIGN_TIER'; payload: { id: string; tier: 1 | 2 | 3 } }
  | { type: 'UNDO_TIER' }
  | { type: 'CHOOSE_START' }
  | { type: 'CHOOSE_DONE'; payload: ChooseDonePayload }
  | { type: 'UNDO_CHOOSE' }                                        // 🆕 비교 되돌리기
  | { type: 'SET_PENDING_NEW'; payload: Track[] }
  | { type: 'ABSORB_NEW' }
  | { type: 'SET_PENDING_REMOVED'; payload: string[] }
  | { type: 'APPLY_REMOVAL' }
  | { type: 'DISMISS_REMOVAL' }
  | { type: 'ENRICH_TRACKS'; payload: { id: string; previewUrl: string | null; durationMs: number }[] }   // 🆕 곡 정보 보강
  | { type: 'LOAD_STATE'; payload: Partial<Omit<AppState, 'seenPairs'> & { seenPairs: string[] }> }
  | { type: 'RESET' };

export interface ChooseDonePayload {
  updatedA: Track;
  updatedB: Track;
  rsiDelta: number;
  newPairKey: string;
  nextPair: [Track, Track] | null;
  newSeenPairs: Set<string>;
  // 🆕 undo를 위한 비교 전 상태
  prevA: Track;
  prevB: Track;
  prevCurPair: [Track, Track] | null;
  prevLastPairKey: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  imageUrl: string;
}

export interface Config {
  clientId: string;
  supabaseUrl: string;
  anonKey: string;
  redirectUri: string;
}

export interface PlayerState {
  ready: boolean;
  deviceId: string | null;
  isPlaying: boolean;
  currentUri: string | null;
  isMobile: boolean;
  sdkFailed: boolean;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
}
