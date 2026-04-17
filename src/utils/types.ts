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
}

export type Phase = 'import' | 'tier' | 'sort' | 'rank';
export type Source = 'liked' | string;

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
  pendingRemovedIds: string[];   // 🆕 Spotify에서 제거된 곡 ID들
}

export type AppAction =
  | { type: 'SET_PHASE'; payload: Phase }
  | { type: 'SET_TRACKS'; payload: Track[] }
  | { type: 'SET_USER'; payload: SpotifyUser | null }
  | { type: 'ASSIGN_TIER'; payload: { id: string; tier: 1 | 2 | 3 } }
  | { type: 'UNDO_TIER' }
  | { type: 'CHOOSE_START' }
  | { type: 'CHOOSE_DONE'; payload: ChooseDonePayload }
  | { type: 'SET_PENDING_NEW'; payload: Track[] }
  | { type: 'ABSORB_NEW' }
  | { type: 'SET_PENDING_REMOVED'; payload: string[] }   // 🆕
  | { type: 'APPLY_REMOVAL' }                            // 🆕 실제로 삭제
  | { type: 'DISMISS_REMOVAL' }                          // 🆕 유지 (로컬에 남김)
  | { type: 'LOAD_STATE'; payload: Partial<Omit<AppState, 'seenPairs'> & { seenPairs: string[] }> }
  | { type: 'RESET' };

export interface ChooseDonePayload {
  updatedA: Track;
  updatedB: Track;
  rsiDelta: number;
  newPairKey: string;
  nextPair: [Track, Track] | null;
  newSeenPairs: Set<string>;
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
