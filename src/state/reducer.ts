// 앱 상태 전이. 순수 함수 — 무작위성은 state.seed로, 시간은 액션 페이로드로 받는다.

import { compactMatches, pickNextPair, recomputeRatings } from '../core/rating/engine';
import { pairKey, type Focus } from '../core/rating/pairing';
import { createRng } from '../core/rating/rng';
import { SESSION_VERSION, type SessionData } from '../core/session/schema';
import type { Source, Tier, Track } from '../core/types';
import type { SpotifyUser } from '../services/spotify/types';

export type Phase = 'import' | 'tier' | 'sort' | 'rank';
const PHASES: readonly Phase[] = ['import', 'tier', 'sort', 'rank'];

/** 이 횟수만큼 비교하면 '신규' 표시를 뗀다 */
const NEW_TRACK_THRESHOLD = 5;
/** 비교 기록이 이만큼 쌓이면 오래된 기록을 사전분포로 압축 */
const MAX_MATCHES = 4000;
const KEEP_MATCHES = 3000;
/** 건너뛴 쌍을 기억하는 개수 */
const SKIP_MEMORY = 200;

export interface AppState {
  phase: Phase;
  user: SpotifyUser | null;
  /** 저장·동기화되는 데이터 */
  session: SessionData;
  curPair: [string, string] | null;
  focus: Focus;
  skipped: string[];
  /** 티어 분류 되돌리기 스택 (일괄 분류는 한 묶음) */
  tierHistory: string[][];
  pendingNew: Track[];
  pendingRemovedIds: string[];
  /** 세션이 바뀔 때마다 +1 */
  revision: number;
  /** 클라우드에 올라간 revision */
  cloudRevision: number;
  seed: number;
}

export type Action =
  | { type: 'hydrate'; session: SessionData; origin: 'cloud' | 'file' }
  | { type: 'newSession'; source: Source; sourceName: string | null; tracks: Track[] }
  | { type: 'reset' }
  | { type: 'setPhase'; phase: Phase }
  | { type: 'setUser'; user: SpotifyUser | null }
  | { type: 'claimSession' }
  | { type: 'assignTier'; id: string; tier: Tier }
  | { type: 'assignRemaining'; tier: Tier }
  | { type: 'undoTier' }
  | { type: 'retier'; id: string; tier: Tier }
  | { type: 'choose'; pair: readonly [string, string]; score: number }
  | { type: 'skip' }
  | { type: 'undoChoose' }
  | { type: 'setFocus'; focus: Focus }
  | { type: 'syncDetected'; remote: Track[]; at: string }
  | { type: 'absorbNew' }
  | { type: 'dismissNew' }
  | { type: 'applyRemoval' }
  | { type: 'dismissRemoval' }
  | { type: 'enrichDurations'; items: readonly { id: string; durationMs: number }[] }
  | { type: 'setSourceName'; name: string }
  | { type: 'cloudSaved'; revision: number; savedAt: string }
  | { type: 'markDirty' };

function emptySession(): SessionData {
  return {
    version: SESSION_VERSION,
    ownerId: null,
    source: null,
    sourceName: null,
    tracks: [],
    matches: [],
    compCount: 0,
    legacySeen: [],
    lastSyncedAt: null,
    savedAt: null,
    syncedAt: null,
  };
}

const isPhase = (v: unknown): v is Phase => PHASES.includes(v as Phase);

const classified = (tracks: readonly Track[]) => tracks.filter(t => t.tier !== null).length;

export function canEnter(phase: Phase, session: SessionData): boolean {
  switch (phase) {
    case 'import': return true;
    case 'tier': return session.tracks.length > 0;
    case 'sort': return classified(session.tracks) >= 2;
    case 'rank': return classified(session.tracks) >= 1;
  }
}

export function createInitialState(
  seed: number,
  session?: SessionData | null,
  ui: { phase?: unknown; focus?: unknown } = {},
): AppState {
  let state: AppState = {
    phase: 'import',
    user: null,
    session: session
      ? { ...session, tracks: recomputeRatings(session.tracks, session.matches) }
      : emptySession(),
    curPair: null,
    focus: ui.focus === 'top' ? 'top' : 'all',
    skipped: [],
    tierHistory: [],
    pendingNew: [],
    pendingRemovedIds: [],
    revision: 0,
    cloudRevision: 0,
    seed: seed >>> 0,
  };
  if (isPhase(ui.phase) && canEnter(ui.phase, state.session)) state.phase = ui.phase;
  if (state.phase === 'sort') state = withPair(state);
  return state;
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────

function commit(state: AppState, patch: Partial<SessionData>): AppState {
  return { ...state, session: { ...state.session, ...patch }, revision: state.revision + 1 };
}

function pairIsValid(pair: readonly [string, string] | null, tracks: readonly Track[]): boolean {
  if (!pair) return false;
  const ok = new Set(tracks.filter(t => t.tier !== null).map(t => t.id));
  return ok.has(pair[0]) && ok.has(pair[1]);
}

/** 다음 비교 쌍을 새로 뽑는다. avoid에 든 곡은 가능하면 피한다 */
function withPair(state: AppState, avoid: readonly string[] = state.curPair ?? []): AppState {
  const rng = createRng(state.seed);
  const { tracks, matches, legacySeen } = state.session;
  const curPair = pickNextPair(tracks, matches, {
    rng,
    focus: state.focus,
    avoid,
    extraSeen: [...legacySeen, ...state.skipped],
  });
  return { ...state, curPair, seed: Math.floor(rng() * 0x100000000) >>> 0 };
}

/** 쌍이 무효가 됐으면 정렬 단계에서만 새로 뽑고, 아니면 비워 둔다 (정렬 단계 진입 시 뽑음) */
function refreshPair(state: AppState): AppState {
  if (pairIsValid(state.curPair, state.session.tracks)) return state;
  return state.phase === 'sort' ? withPair({ ...state, curPair: null }) : { ...state, curPair: null };
}

function withTier(t: Track, tier: Tier | null): Track {
  // 티어를 바꾸면 곡별 사전분포(v1 레이팅 등)는 버리고 새 티어 사전분포를 쓴다
  const { prior, ...rest } = t;
  return { ...rest, tier };
}

function setTiers(state: AppState, ids: ReadonlySet<string>, tier: Tier | null): Track[] {
  const tracks = state.session.tracks.map(t => (ids.has(t.id) && t.tier !== tier ? withTier(t, tier) : t));
  return recomputeRatings(tracks, state.session.matches);
}

function bumpComparisons(t: Track, delta: 1 | -1): Track {
  const comparisons = Math.max(0, t.comparisons + delta);
  return { ...t, comparisons, isNew: t.isNew && comparisons < NEW_TRACK_THRESHOLD };
}

/** Spotify 쪽 목록과 비교해 새로 생긴 곡과 사라진 곡을 찾는다 */
export function diffLibrary(local: readonly Track[], remote: readonly Track[]) {
  const localIds = new Set(local.map(t => t.id));
  const remoteIds = new Set(remote.map(t => t.id));
  return {
    added: remote.filter(t => !localIds.has(t.id)),
    removedIds: local.filter(t => !remoteIds.has(t.id)).map(t => t.id),
  };
}

/** 이미 있는 곡은 제목·앨범 아트 등 메타데이터만 최신으로 (티어·레이팅은 유지) */
function refreshMeta(t: Track, r: Track): Track {
  const next: Track = {
    ...t,
    name: r.name,
    artists: r.artists,
    album: r.album,
    image: r.image || t.image,
    uri: r.uri || t.uri,
  };
  if (r.thumb ?? t.thumb) next.thumb = r.thumb ?? t.thumb;
  if (r.durationMs ?? t.durationMs) next.durationMs = r.durationMs ?? t.durationMs;
  const same = next.name === t.name && next.album === t.album && next.image === t.image &&
    next.thumb === t.thumb && next.durationMs === t.durationMs && next.uri === t.uri &&
    next.artists.join('\u0000') === t.artists.join('\u0000');
  return same ? t : next;
}

function claim(state: AppState): AppState {
  const { user, session } = state;
  if (!user || session.ownerId || !session.tracks.length) return state;
  return commit(state, { ownerId: user.id });
}

// ── 리듀서 ──────────────────────────────────────────────────────────────

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate': {
      const session: SessionData = {
        ...action.session,
        tracks: recomputeRatings(action.session.tracks, action.session.matches),
        // 클라우드에서 받은 버전이면 그 버전을 기준점으로 삼는다
        syncedAt: action.origin === 'cloud' ? action.session.savedAt : null,
      };
      const revision = state.revision + 1;
      let next: AppState = {
        ...state,
        session,
        curPair: null,
        skipped: [],
        tierHistory: [],
        pendingNew: [],
        pendingRemovedIds: [],
        revision,
        cloudRevision: action.origin === 'cloud' ? revision : state.cloudRevision,
      };
      if (!canEnter(next.phase, session)) next.phase = 'import';
      if (next.phase === 'sort') next = withPair(next);
      return claim(next);
    }

    case 'newSession': {
      const seen = new Set<string>();
      const fresh = action.tracks
        .filter(t => !seen.has(t.id) && seen.add(t.id))
        .map(t => ({ ...withTier(t, null), comparisons: 0, isNew: false }));
      const session: SessionData = {
        ...emptySession(),
        ownerId: state.user?.id ?? null,
        source: action.source,
        sourceName: action.sourceName,
        tracks: recomputeRatings(fresh, []),
      };
      return {
        ...state,
        phase: session.tracks.length ? 'tier' : 'import',
        session,
        curPair: null,
        skipped: [],
        tierHistory: [],
        pendingNew: [],
        pendingRemovedIds: [],
        revision: state.revision + 1,
      };
    }

    case 'reset':
      return {
        ...createInitialState(state.seed),
        user: state.user,
        revision: state.revision + 1,
        cloudRevision: state.cloudRevision,
      };

    case 'setPhase': {
      if (!canEnter(action.phase, state.session) || action.phase === state.phase) return state;
      const next = { ...state, phase: action.phase };
      return action.phase === 'sort' && !pairIsValid(next.curPair, next.session.tracks)
        ? withPair(next, [])
        : next;
    }

    case 'setUser':
      return claim({ ...state, user: action.user });

    case 'claimSession':
      return state.user ? commit(state, { ownerId: state.user.id }) : state;

    case 'assignTier': {
      const track = state.session.tracks.find(t => t.id === action.id);
      if (!track || track.tier === action.tier) return state;
      const next = commit(state, { tracks: setTiers(state, new Set([action.id]), action.tier) });
      return {
        ...next,
        curPair: null,
        tierHistory: track.tier === null ? [...state.tierHistory, [action.id]] : state.tierHistory,
      };
    }

    case 'assignRemaining': {
      const ids = state.session.tracks.filter(t => t.tier === null).map(t => t.id);
      if (!ids.length) return state;
      const next = commit(state, { tracks: setTiers(state, new Set(ids), action.tier) });
      return { ...next, curPair: null, tierHistory: [...state.tierHistory, ids] };
    }

    case 'undoTier': {
      const last = state.tierHistory.at(-1);
      if (!last) return state;
      // 그사이 비교에 쓰인 곡은 되돌리지 않는다 (비교 기록이 미분류 곡을 가리키게 되므로)
      const compared = new Set(state.session.matches.flatMap(([a, b]) => [a, b]));
      const ids = new Set(last.filter(id => !compared.has(id)));
      const next = ids.size ? commit(state, { tracks: setTiers(state, ids, null) }) : state;
      return refreshPair({ ...next, tierHistory: state.tierHistory.slice(0, -1) });
    }

    case 'retier': {
      const track = state.session.tracks.find(t => t.id === action.id);
      if (!track || track.tier === null || track.tier === action.tier) return state;
      const next = commit(state, { tracks: setTiers(state, new Set([action.id]), action.tier) });
      return { ...next, curPair: null };
    }

    case 'choose': {
      const { curPair } = state;
      // 화면에 떠 있는 쌍에 대한 응답만 받는다 (연타·키 반복으로 다음 쌍에 잘못 적용되는 것 방지)
      if (!curPair || curPair[0] !== action.pair[0] || curPair[1] !== action.pair[1]) return state;
      const score = Math.min(1, Math.max(0, action.score));
      const [a, b] = curPair;
      let matches = [...state.session.matches, [a, b, score] as [string, string, number]];
      let tracks = state.session.tracks.map(t => (t.id === a || t.id === b ? bumpComparisons(t, 1) : t));
      tracks = recomputeRatings(tracks, matches);
      if (matches.length > MAX_MATCHES) ({ tracks, matches } = compactMatches(tracks, matches, KEEP_MATCHES));
      const next = commit(state, { tracks, matches, compCount: state.session.compCount + 1 });
      return withPair({ ...next, tierHistory: [] }, curPair);
    }

    case 'skip': {
      if (!state.curPair) return state;
      const skipped = [...state.skipped, pairKey(...state.curPair)].slice(-SKIP_MEMORY);
      return withPair({ ...state, skipped }, state.curPair);
    }

    case 'undoChoose': {
      const last = state.session.matches.at(-1);
      if (!last) return state;
      const [a, b] = last;
      const matches = state.session.matches.slice(0, -1);
      const tracks = recomputeRatings(
        state.session.tracks.map(t => (t.id === a || t.id === b ? bumpComparisons(t, -1) : t)),
        matches,
      );
      const next = commit(state, {
        tracks,
        matches,
        compCount: Math.max(0, state.session.compCount - 1),
      });
      // 되돌린 쌍을 같은 배치로 다시 보여준다
      return refreshPair({ ...next, curPair: [a, b] });
    }

    case 'setFocus':
      if (state.focus === action.focus) return state;
      return state.phase === 'sort'
        ? withPair({ ...state, focus: action.focus }, [])
        : { ...state, focus: action.focus, curPair: null };

    case 'syncDetected': {
      const { added, removedIds } = diffLibrary(state.session.tracks, action.remote);
      const remote = new Map(action.remote.map(t => [t.id, t]));
      const tracks = state.session.tracks.map(t => {
        const r = remote.get(t.id);
        return r ? refreshMeta(t, r) : t;
      });
      const next = commit(state, { tracks, lastSyncedAt: action.at });
      return {
        ...next,
        pendingNew: added.map(t => ({ ...withTier(t, null), comparisons: 0, isNew: true })),
        pendingRemovedIds: removedIds,
      };
    }

    case 'absorbNew': {
      if (!state.pendingNew.length) return state;
      const known = new Set(state.session.tracks.map(t => t.id));
      const tracks = [...state.session.tracks, ...state.pendingNew.filter(t => !known.has(t.id))];
      return { ...commit(state, { tracks }), pendingNew: [] };
    }

    case 'dismissNew':
      return { ...state, pendingNew: [] };

    case 'applyRemoval': {
      if (!state.pendingRemovedIds.length) return state;
      const gone = new Set(state.pendingRemovedIds);
      const matches = state.session.matches.filter(([a, b]) => !gone.has(a) && !gone.has(b));
      const next = commit(state, {
        tracks: recomputeRatings(state.session.tracks.filter(t => !gone.has(t.id)), matches),
        matches,
        legacySeen: state.session.legacySeen.filter(k => !k.split('|').some(id => gone.has(id))),
      });
      const tierHistory = state.tierHistory
        .map(group => group.filter(id => !gone.has(id)))
        .filter(group => group.length);
      let result = refreshPair({ ...next, pendingRemovedIds: [], tierHistory });
      if (!canEnter(result.phase, result.session)) result = { ...result, phase: 'import' };
      return result;
    }

    case 'dismissRemoval':
      return { ...state, pendingRemovedIds: [] };

    // 아래 두 보강은 사용자의 작업이 아니므로 revision을 올리지 않는다:
    // 로컬에는 저장되지만(세션 객체가 바뀜) 이것만으로 클라우드 업로드를 일으키지는 않는다.
    case 'enrichDurations': {
      const byId = new Map(action.items.map(i => [i.id, i.durationMs]));
      let changed = false;
      const tracks = state.session.tracks.map(t => {
        const d = byId.get(t.id);
        if (d === undefined || t.durationMs) return t;
        changed = true;
        return { ...t, durationMs: d };
      });
      return changed ? { ...state, session: { ...state.session, tracks } } : state;
    }

    case 'setSourceName':
      return state.session.sourceName === action.name
        ? state
        : { ...state, session: { ...state.session, sourceName: action.name } };

    case 'cloudSaved':
      // revision은 올리지 않는다 (업로드 자체는 새 변경이 아니므로)
      return {
        ...state,
        session: { ...state.session, syncedAt: action.savedAt },
        cloudRevision: Math.max(state.cloudRevision, action.revision),
      };

    case 'markDirty':
      return { ...state, revision: state.revision + 1 };
  }
}
