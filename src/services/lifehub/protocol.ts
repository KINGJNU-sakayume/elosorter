// Life Hub 기기 동기화 API 클라이언트 (life-hub docs/P6_SYNC.md 5·7절). 타이머도 UI도 없는 한 번짜리 요청 모음.
//
// 지키는 규칙:
//  - 쓰기는 항상 조건부다: `If-Match: "<version>"`, 서버에 문서가 없을 때만 `If-None-Match: *`.
//  - 본문 해시는 실제로 보낸 문자열의 UTF-8 바이트로 낸다 (다시 직렬화하지 않는다).
//  - 412에서 current.sha256이 내가 보낸 본문의 해시와 같으면 성공 (이미 반영된 재전송).
//    current가 null이면 서버 문서가 삭제된 것이니 If-None-Match: *로 다시 쓴다.
//  - 응답을 못 받은 PUT은 다시 보내기 전에 /sync/meta의 sha256을 보낸 본문의 해시와 비교한다.
//  - 413은 '너무 큼', 400·415·428은 오류(재시도하지 않음), 네트워크·5xx·408·429는 '나중에 재시도'. 로컬은 건드리지 않는다.
//  - 오류에는 상태 코드만 담는다. 응답 본문·토큰·세션 내용은 담지 않는다.

import { parseSyncDocument } from '../../core/session/syncDoc';
import type { SessionData } from '../../core/session/schema';
import { LifeHubError, syncRequest, type Deps } from './remote';

export interface RemoteMeta {
  version: number;
  sha256: string;
  sizeBytes: number | null;
  writtenAt: string;
  device: string | null;
}

export type Failure =
  | { ok: false; kind: 'retry' }
  | { ok: false; kind: 'too_large' }
  | { ok: false; kind: 'no_permission' }
  | { ok: false; kind: 'not_connected' }
  /** 400·415·428이나 읽을 수 없는 서버 문서: 버그이지 일시 오류가 아니다. 재시도하지 않는다 */
  | { ok: false; kind: 'error'; status: number | null };

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (deps: Pick<Deps, 'sha256'>, text: string): Promise<string> =>
  hex(await deps.sha256(new TextEncoder().encode(text)));

export function parseMeta(value: unknown): RemoteMeta | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== 'number' || !Number.isSafeInteger(v.version) || v.version < 1 || typeof v.sha256 !== 'string') return null;
  return {
    version: v.version,
    sha256: v.sha256,
    sizeBytes: typeof v.size_bytes === 'number' ? v.size_bytes : null,
    writtenAt: typeof v.written_at === 'string' ? v.written_at : '',
    device: typeof v.device === 'string' ? v.device : null,
  };
}

const classify = (status: number): Failure => {
  if (status === 413) return { ok: false, kind: 'too_large' };
  if (status === 408 || status === 429 || status >= 500) return { ok: false, kind: 'retry' };
  return { ok: false, kind: 'error', status };
};

class NetworkFail extends Error {}

/** syncRequest의 예외를 결과로 바꾼다. 네트워크 실패만 따로 던진다 (쓰기는 결과를 모르는 경우라서 구분해야 한다) */
async function call(deps: Deps, method: 'GET' | 'PUT', path: string, options?: { body?: string; headers?: Record<string, string> }): Promise<Response | Failure> {
  try {
    return await syncRequest(deps, method, path, options);
  } catch (error) {
    if (error instanceof LifeHubError) {
      if (error.kind === 'network') throw new NetworkFail();
      if (error.kind === 'no_sync_scope') return { ok: false, kind: 'no_permission' };
      if (error.kind === 'not_connected') return { ok: false, kind: 'not_connected' };
      return { ok: false, kind: 'retry' };
    }
    throw error;
  }
}

const isFailure = (r: Response | Failure): r is Failure => !(r instanceof Response);

/** 읽기: 네트워크 실패는 '나중에 재시도' (로컬은 아직 아무것도 바뀌지 않았다) */
async function read(deps: Deps, path: string): Promise<Response | Failure> {
  try {
    return await call(deps, 'GET', path);
  } catch (error) {
    if (error instanceof NetworkFail) return { ok: false, kind: 'retry' };
    throw error;
  }
}

/** GET /sync/meta. 서버에 문서가 없으면 meta: null */
export async function getMeta(deps: Deps): Promise<{ ok: true; meta: RemoteMeta | null } | Failure> {
  const response = await read(deps, '/meta');
  if (isFailure(response)) return response;
  if (response.status === 404) return { ok: true, meta: null };
  if (response.status !== 200) return classify(response.status);
  const meta = parseMeta(await response.json().catch(() => null));
  return meta ? { ok: true, meta } : { ok: false, kind: 'retry' };
}

/**
 * GET /sync: 서버 문서를 받아 parseSession으로 검사한다. 서버에 문서가 없으면 null.
 * 형식이 맞지 않는 문서는 오류다 (그 위에 쓰거나 로컬을 바꾸지 않는다).
 */
export async function getDocument(deps: Deps): Promise<{ ok: true; found: { meta: RemoteMeta; session: SessionData } | null } | Failure> {
  const response = await read(deps, '');
  if (isFailure(response)) return response;
  if (response.status === 404) return { ok: true, found: null };
  if (response.status !== 200) return classify(response.status);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const meta = parseMeta(body);
  if (!meta || !body) return { ok: false, kind: 'retry' };
  const session = parseSyncDocument(body.doc);
  if (!session) return { ok: false, kind: 'error', status: null };
  return { ok: true, found: { meta, session } };
}

export type PutResult =
  | { ok: true; version: number; sha256: string; writtenAt: string | null }
  /** 서버의 문서가 내 기준 version과 다르다. current = 서버의 현재 meta (null이면 삭제됨) */
  | { ok: false; kind: 'conflict'; current: RemoteMeta | null }
  | Failure;

/** 한 번의 쓰기에서 보내기를 시도하는 최대 횟수 (결과를 모를 때·삭제됨 처리 포함) */
const MAX_PUTS = 3;

/**
 * 본문을 쓴다. `base`는 내 사본이 기반한 서버 version, null이면 서버에 문서가 없다고 보고 첫 쓰기를 한다.
 * `label`은 X-Device-Label (이미 정리된 값이거나 null — null이면 헤더를 보내지 않는다).
 */
export async function putDocument(
  deps: Deps,
  { body, base, label }: { body: string; base: number | null; label: string | null },
): Promise<PutResult> {
  const sha = await sha256Hex(deps, body);
  let expected = base;
  for (let attempt = 0; attempt < MAX_PUTS; attempt++) {
    const headers: Record<string, string> = expected === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${expected}"` };
    if (label) headers['X-Device-Label'] = label;

    let response: Response | Failure | null = null;
    try {
      response = await call(deps, 'PUT', '', { body, headers });
    } catch (error) {
      if (!(error instanceof NetworkFail)) throw error;
    }
    if (response !== null && isFailure(response)) return response;

    if (response === null || response.status >= 500) {
      // 결과를 모른다: 쓰기가 반영됐을 수 있으니, 다시 보내기 전에 서버 meta를 본다.
      const m = await getMeta(deps);
      if (!m.ok) return { ok: false, kind: 'retry' };
      if (m.meta && m.meta.sha256 === sha) return { ok: true, version: m.meta.version, sha256: sha, writtenAt: m.meta.writtenAt || null };
      if ((m.meta?.version ?? null) === expected) continue; // 서버는 그대로 → 같은 본문을 다시 보낸다
      if (m.meta === null) { expected = null; continue; } // 그 사이 삭제됨 → 첫 쓰기로
      return { ok: false, kind: 'conflict', current: m.meta };
    }

    if (response.status === 200) {
      const meta = parseMeta(await response.json().catch(() => null));
      return {
        ok: true,
        version: meta?.version ?? (expected ?? 0) + 1,
        sha256: sha,
        writtenAt: meta?.writtenAt || null,
      };
    }
    if (response.status === 412) {
      const current = (await response.json().catch(() => null) as { current?: unknown } | null)?.current;
      if (current === null) { expected = null; continue; } // 서버 문서가 삭제됨 → If-None-Match: *
      const meta = parseMeta(current);
      if (!meta) return { ok: false, kind: 'retry' };
      if (meta.sha256 === sha) return { ok: true, version: meta.version, sha256: sha, writtenAt: meta.writtenAt || null }; // 이미 반영된 내 쓰기
      return { ok: false, kind: 'conflict', current: meta };
    }
    return classify(response.status);
  }
  return { ok: false, kind: 'retry' };
}
