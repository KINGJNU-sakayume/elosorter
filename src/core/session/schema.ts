// 저장 형식(v2)과 파싱/검증/마이그레이션.
// localStorage, Supabase, 백업 파일 어디서 온 데이터든 이 파일을 거쳐서만 앱 상태가 된다.

import { countTiers } from '../rating/engine';
import { LEGACY_INITIAL_RATING, legacyPriorSd, tierPriors } from '../rating/priors';
import { isTier, type Match, type Source, type Track, type TrackPrior } from '../types';

export const SESSION_VERSION = 2;

export interface SessionData {
  version: typeof SESSION_VERSION;
  /** 이 세션의 주인 Spotify user id. v1에서 넘어온 세션은 null */
  ownerId: string | null;
  source: Source | null;
  /** 플레이리스트 이름 등 화면 표시용 */
  sourceName: string | null;
  tracks: Track[];
  /** 비교 기록 (오래된 순) */
  matches: Match[];
  /** 누적 비교 횟수 (압축·v1 기록 포함) */
  compCount: number;
  /** 비교 기록 없이 "이미 본 쌍"만 남은 것 (v1 seenPairs) */
  legacySeen: string[];
  /** Spotify와 마지막으로 동기화한 시각 */
  lastSyncedAt: string | null;
  /** 마지막 저장 시각 */
  savedAt: string | null;
  /**
   * 이 세션이 마지막으로 맞춰진 클라우드 버전(savedAt).
   * 클라우드의 savedAt이 이 값과 다르면 다른 기기에서 저장한 것이므로 자동 업로드를 멈춘다.
   */
  syncedAt: string | null;
}

/** 클라우드 목록/충돌 확인용 요약 (전체 데이터를 받지 않고 비교하려고 따로 저장) */
export interface SessionSummary {
  trackCount: number;
  tieredCount: number;
  compCount: number;
  source: Source | null;
  sourceName: string | null;
  savedAt: string | null;
}

export function summarize(s: Pick<SessionData, 'tracks' | 'compCount' | 'source' | 'sourceName' | 'savedAt'>): SessionSummary {
  return {
    trackCount: s.tracks.length,
    tieredCount: s.tracks.filter(t => t.tier !== null).length,
    compCount: s.compCount,
    source: s.source,
    sourceName: s.sourceName,
    savedAt: s.savedAt,
  };
}

// ── 검증 유틸 ────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isSource(v: unknown): v is Source {
  return v === 'liked' || (typeof v === 'string' && /^playlist:[A-Za-z0-9]+$/.test(v));
}

function parsePrior(v: unknown): TrackPrior | undefined {
  if (!isObj(v) || !finite(v.offset) || !finite(v.sd) || v.sd <= 0) return undefined;
  return { offset: v.offset, sd: v.sd };
}

function parseTrack(v: unknown): Track | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const id = v.id;
  const image = str(v.image);
  const track: Track = {
    id,
    name: str(v.name, '(제목 없음)'),
    artists: Array.isArray(v.artists) ? v.artists.filter((a): a is string => typeof a === 'string') : [],
    album: str(v.album),
    image,
    uri: str(v.uri) || `spotify:track:${id}`,
    addedAt: typeof v.addedAt === 'string' ? v.addedAt : null,
    tier: isTier(v.tier) ? v.tier : null,
    rating: finite(v.rating) ? v.rating : 1500,
    comparisons: finite(v.comparisons) && v.comparisons > 0 ? Math.floor(v.comparisons) : 0,
    isNew: v.isNew === true,
  };
  if (typeof v.thumb === 'string' && v.thumb) track.thumb = v.thumb;
  if (finite(v.durationMs) && v.durationMs > 0) track.durationMs = v.durationMs;
  if (finite(v.sigma) && v.sigma > 0) track.sigma = v.sigma;
  const prior = parsePrior(v.prior);
  if (prior) track.prior = prior;
  return track;
}

function parseTracks(v: unknown): Track[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const raw of v) {
    const t = parseTrack(raw);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

function parseMatches(v: unknown, ids: Set<string>): Match[] {
  if (!Array.isArray(v)) return [];
  const out: Match[] = [];
  for (const m of v) {
    if (!Array.isArray(m) || m.length < 3) continue;
    const [a, b, s] = m;
    if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
    if (!ids.has(a) || !ids.has(b) || !finite(s) || s < 0 || s > 1) continue;
    out.push([a, b, s]);
  }
  return out;
}

const pairKeyPattern = /^[^|]+\|[^|]+$/;

// ── v1 → v2 ─────────────────────────────────────────────────────────────

/**
 * v1 세션: { tracks, compCount, rsiDeltas, currentSource, seenPairs, lastPairKey, savedAt }
 * v1은 비교 기록 없이 곡별 레이팅만 남겼다. 비교를 한 곡은 그 레이팅을
 * "티어 초기값 대비 오프셋 + 비교 횟수만큼 좁아진 표준편차"의 사전분포로 옮겨
 * 기존 순위를 최대한 유지한다. 비교하지 않은 곡은 티어 사전분포를 그대로 쓴다.
 */
export function migrateV1(raw: Obj): SessionData {
  const tracks = parseTracks(raw.tracks);
  const priors = tierPriors(countTiers(tracks));
  const migrated = tracks.map((t): Track => {
    const { sigma, ...rest } = t;
    if (t.tier === null || t.comparisons === 0) return rest;
    return {
      ...rest,
      prior: {
        offset: Math.round((t.rating - LEGACY_INITIAL_RATING[t.tier]) * 100) / 100,
        sd: Math.round(legacyPriorSd(priors[t.tier].sd, t.comparisons) * 100) / 100,
      },
    };
  });
  return {
    version: SESSION_VERSION,
    ownerId: null,
    source: isSource(raw.currentSource) ? raw.currentSource : null,
    sourceName: null,
    tracks: migrated,
    matches: [],
    compCount: finite(raw.compCount) && raw.compCount > 0 ? Math.floor(raw.compCount) : 0,
    legacySeen: Array.isArray(raw.seenPairs)
      ? raw.seenPairs.filter((k): k is string => typeof k === 'string' && pairKeyPattern.test(k))
      : [],
    lastSyncedAt: null,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null,
    syncedAt: null,
  };
}

/** 어떤 버전이든 v2 SessionData로. 알아볼 수 없으면 null */
export function parseSession(raw: unknown): SessionData | null {
  if (!isObj(raw)) return null;
  if (raw.version === undefined) return Array.isArray(raw.tracks) ? migrateV1(raw) : null;
  if (raw.version !== SESSION_VERSION) return null;
  const tracks = parseTracks(raw.tracks);
  const ids = new Set(tracks.map(t => t.id));
  const matches = parseMatches(raw.matches, ids);
  return {
    version: SESSION_VERSION,
    ownerId: typeof raw.ownerId === 'string' && raw.ownerId ? raw.ownerId : null,
    source: isSource(raw.source) ? raw.source : null,
    sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : null,
    tracks,
    matches,
    compCount: Math.max(
      matches.length,
      finite(raw.compCount) && raw.compCount > 0 ? Math.floor(raw.compCount) : 0,
    ),
    legacySeen: Array.isArray(raw.legacySeen)
      ? raw.legacySeen.filter((k): k is string => typeof k === 'string' && pairKeyPattern.test(k))
      : [],
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : null,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null,
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : null,
  };
}

/**
 * 저장용 직렬화. 기본값과 같은 필드는 빼서 용량을 줄인다
 * (uri = spotify:track:{id}, isNew = false, 미분류 곡의 rating).
 */
export function serializeSession(s: SessionData): Obj {
  return {
    ...s,
    tracks: s.tracks.map(t => {
      const out: Obj = { ...t };
      if (t.uri === `spotify:track:${t.id}`) delete out.uri;
      if (!t.isNew) delete out.isNew;
      if (t.tier === null) delete out.rating;
      if (t.thumb === t.image) delete out.thumb;
      return out;
    }),
  };
}
