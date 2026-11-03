// Life Hub 기기 동기화 문서 (life-hub docs/P6_SYNC.md 5·6절).
//
// 문서 = 압축하지 않은 JSON. Hub의 형식 검사 때문에 version: 2 와 tracks 배열이 반드시 있어야 하고,
// 형식은 serializeSession(저장·백업 파일과 같은 직렬화)에서 한 가지만 뺀다:
// 앱이 불러올 때 다시 계산하는 파생값 — 곡의 rating, sigma — 이다.
//
// 이 둘을 빼도 되는 근거: recomputeRatings(티어 사전분포 + 곡별 prior + 비교 기록 → 베이즈 Bradley–Terry MAP)는
// 난수(rng.ts는 다음 쌍 고르기에만 쓴다)나 곡·비교의 순서에 기대지 않는 결정적 계산이고,
// 앱은 세션을 불러올 때(createInitialState·hydrate) 항상 다시 계산한다.
// syncDoc.test.ts의 왕복 테스트(세션 → 문서 → 세션)가 같은 값이 나오는지 확인한다.
// 값이 달라지는 필드가 생기면 그 필드는 여기서 빼지 않는다.
//
// 그 밖의 필드(uri·isNew·thumb 같은 기본값 생략은 serializeSession이 이미 한다)는 그대로 둔다.
// savedAt·syncedAt·syncVersion도 남지만 문서를 받아 쓸 때 앱이 덮어쓴다 (이 기기 사본의 기준점이므로).

import { recomputeRatings } from '../rating/engine';
import { parseSession, SESSION_VERSION, serializeSession, type SessionData } from './schema';

/** Hub 문서 한도(1 MiB)보다 여유를 둔 자동 동기화 상한: 900 KiB = 921,600바이트 (UTF-8) */
export const SYNC_LIMIT_BYTES = 900 * 1024;

/** 문서에서 빼는 파생값 (곡 단위). 불러올 때 recomputeRatings가 다시 채운다 */
export const DERIVED_TRACK_FIELDS = ['rating', 'sigma'] as const;

type Obj = Record<string, unknown>;

/** 동기화 문서 객체. serializeSession과 같은 모양에서 파생값만 뺀다 */
export function toSyncDocument(s: SessionData): Obj {
  const doc = serializeSession(s);
  return {
    ...doc,
    tracks: (doc.tracks as Obj[]).map(t => {
      const out: Obj = { ...t };
      for (const f of DERIVED_TRACK_FIELDS) delete out[f];
      return out;
    }),
  };
}

/** 서버로 보내는 본문. 이 문자열을 그대로 보내고, 해시도 이 문자열의 UTF-8 바이트로 낸다 */
export const serializeSyncBody = (s: SessionData): string => JSON.stringify(toSyncDocument(s));

const encoder = new TextEncoder();
/** 문자열의 UTF-8 바이트 수 (한글은 3바이트). 서버도 바이트로 센다 */
export const utf8Bytes = (text: string): number => encoder.encode(text).byteLength;

export interface SyncSize {
  bytes: number;
  limit: number;
  /** 한도를 넘음: 자동 동기화를 하지 않는다 (잘라 내거나 일부만 올리지 않는다) */
  tooLarge: boolean;
}

export function syncSizeOfBody(body: string, limit = SYNC_LIMIT_BYTES): SyncSize {
  const bytes = utf8Bytes(body);
  return { bytes, limit, tooLarge: bytes > limit };
}

/** 세션을 동기화 문서로 만들었을 때의 크기 (설정 화면 표시용) */
export const measureSyncDocument = (s: SessionData, limit = SYNC_LIMIT_BYTES): SyncSize =>
  syncSizeOfBody(serializeSyncBody(s), limit);

/**
 * 서버에서 받은 문서를 세션으로. 형식이 맞지 않으면 null (그 경우 로컬은 바꾸지 않는다).
 * parseSession으로 검사하고(중복 곡·끊어진 비교 기록은 걸러진다), 파생값을 다시 계산한다.
 * Hub가 보증하는 모양(version 2, tracks 배열)이 아니면 v1 이전 형식을 받아들이지 않는다.
 */
export function parseSyncDocument(raw: unknown): SessionData | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const doc = raw as Obj;
  if (doc.version !== SESSION_VERSION || !Array.isArray(doc.tracks)) return null;
  const session = parseSession(doc);
  if (!session) return null;
  return { ...session, tracks: recomputeRatings(session.tracks, session.matches) };
}

// ── 내용 키: "보내지 않은 변경이 있는가" 판단용 ──────────────────────────────

/** 이 기기 사본의 기준점이라 내용이 아닌 필드 (저장할 때마다 바뀔 수 있다) */
const VOLATILE_FIELDS = ['savedAt', 'syncedAt', 'syncVersion'] as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const o = value as Obj;
    return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * 세션의 "내용"을 키 순서와 상관없이 같은 문자열로. 저장 시각·기준 version은 빼서,
 * 업로드가 로컬 저장 시각만 바꿔도 변경으로 보지 않는다. 파생값도 들어가지 않는다.
 */
export function syncContentKey(s: SessionData): string {
  const doc = toSyncDocument(s);
  for (const f of VOLATILE_FIELDS) delete doc[f];
  return canonical(doc);
}
