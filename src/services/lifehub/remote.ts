// ELO Sorter ↔ Life Hub 연결 (OAuth 2.1 인증 코드 + PKCE S256, 공개 클라이언트).
//
// - 클라이언트는 public/lifehub-client.json(CIMD: Client ID Metadata Document, 클라이언트 ID 메타데이터 문서)이 식별한다.
// - 요청 scope는 'elosorter:sync elosorter:board'다 (elosorter는 동기화 + 보드 목록만 쓰는 목적지: 인박스·제안·카드가 없다).
//   board 권한 전에 만든 연결은 보드 업로드가 403 insufficient_scope를 받는다. 그때도 토큰은 지우지 않는다 (boardRequest).
// - Life Hub는 /lifehub/(public/lifehub/index.html)로 돌려보내고, 그 페이지가 결과를 sessionStorage에 넘긴다.
// - 토큰은 Spotify 토큰('elo:spotify_*')과 섞이지 않게 'elo:lifehub.*' 키에 따로 둔다.
// - 오류 메시지에는 고정 문구와 상태 코드만 넣는다. 응답 본문·토큰·세션 내용은 넣지 않는다.
// 참고 구현: animan src/lifehub/remote.ts

export const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
/** GitHub Pages 배포 주소. vite.config.ts의 base('/elosorter/')와 같아야 한다 */
export const APP_URL = 'https://kingjnu-sakayume.github.io/elosorter/';
export const CALLBACK_URL = APP_URL + 'lifehub/';
export const CLIENT_ID = APP_URL + 'lifehub-client.json';
export const RESOURCE = LIFEHUB_ORIGIN + '/elosorter';
export const SYNC_SCOPE = 'elosorter:sync';
/** 보드 타일 목록 업로드 (PUT /elosorter/v1/board) */
export const BOARD_SCOPE = 'elosorter:board';
/** 연결할 때 요청하는 scope 전체 */
export const SCOPE = `${SYNC_SCOPE} ${BOARD_SCOPE}`;
const API = RESOURCE + '/v1';

/** public/lifehub/index.html이 쓰는 키와 같아야 한다 */
export const CALLBACK_KEY = 'elo:lifehub.callback.v1';
const TOKENS_KEY = 'elo:lifehub.tokens.v1';
const PENDING_AUTH_KEY = 'elo:lifehub.pending-auth.v1';
/** 마지막으로 연결(인증 코드 교환)을 마친 시각(ms). 비밀이 아니다. 보드 업로드의 권한 부족 멈춤을 다시 연결 뒤 푸는 데 쓴다 */
export const CONNECTED_AT_KEY = 'elo:lifehub.connected-at.v1';
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const SYNC_TIMEOUT_MS = 30_000;

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Deps {
  fetch: typeof fetch;
  /** 토큰과 동기화 상태 (localStorage) */
  storage: KV;
  /** 연결 중에만 필요한 값 (sessionStorage) */
  session: KV;
  now: () => number;
  random: (bytes: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
}

export function browserDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    storage: localStorage,
    session: sessionStorage,
    now: () => Date.now(),
    random: n => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async d => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

/**
 * 'no_sync_scope': 토큰은 유효하지만 동기화 권한이 없다 (동의 화면에서 거부했거나 권한 없음).
 * 'no_board_scope': 토큰은 유효하지만 보드 업로드 권한이 없다 (board 권한 전에 만든 연결).
 */
export type LifeHubErrorKind = 'not_connected' | 'denied' | 'state' | 'network' | 'server' | 'no_sync_scope' | 'no_board_scope';
export class LifeHubError extends Error {
  kind: LifeHubErrorKind;
  constructor(kind: LifeHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

interface Tokens { access_token: string; access_expires_at: number; refresh_token: string; scope?: string }
interface PendingAuth { state: string; verifier: string; created_at: number }

function readJson<T>(store: KV, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 이 주소에서 연결을 시작해도 되는가: client_id·redirect_uri가 배포 주소에 묶여 있어서 그 주소에서만 된다 */
export function connectAvailable(loc: { origin: string; pathname: string }): boolean {
  const app = new URL(APP_URL);
  return loc.origin === app.origin && loc.pathname.startsWith(app.pathname);
}

export function isConnected(deps: Pick<Deps, 'storage'>): boolean {
  return typeof readJson<Tokens>(deps.storage, TOKENS_KEY)?.refresh_token === 'string';
}

/** 저장된 토큰이 가진 scope. 모르면 null */
export function grantedScopes(deps: Pick<Deps, 'storage'>): string[] | null {
  const scope = readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : null;
}

/** 토큰이 동기화 scope가 없다고 알려진 경우에만 false. 모르면 시도하고 403이 알려 준다 */
export const mayHaveSyncScope = (deps: Pick<Deps, 'storage'>): boolean => grantedScopes(deps)?.includes(SYNC_SCOPE) ?? true;

/** 마지막으로 연결을 마친 시각. 모르면 null */
export function connectedAt(deps: Pick<Deps, 'storage'>): number | null {
  const n = Number(deps.storage.getItem(CONNECTED_AT_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 토큰이 보드 scope를 가진다고 알려진 경우에만 true (다시 연결한 뒤 멈춤을 풀 때 쓴다) */
export const knownBoardScope = (deps: Pick<Deps, 'storage'>): boolean => grantedScopes(deps)?.includes(BOARD_SCOPE) ?? false;

/** 연결을 시작한다: 승인 화면 주소를 돌려준다 (호출한 쪽이 이동시킨다) */
export async function beginConnect(deps: Deps): Promise<string> {
  const verifier = b64url(deps.random(32));
  const state = b64url(deps.random(16));
  const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
  const pending: PendingAuth = { state, verifier, created_at: deps.now() };
  deps.session.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE,
  });
  return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
}

async function tokenRequest(deps: Deps, params: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
  } catch {
    throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      deps.storage.removeItem(TOKENS_KEY);
      throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.');
    }
    throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${response.status})`);
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
    throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  // 갱신 응답에 scope가 없으면 알던 값을 유지한다. 새 연결인데 없으면 모르는 채로 둔다.
  const previous = params.grant_type === 'refresh_token' ? readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope : undefined;
  const scope = typeof body.scope === 'string' ? body.scope : previous;
  const tokens: Tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000,
    ...(scope === undefined ? {} : { scope }),
  };
  deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/**
 * 콜백 페이지가 이 탭에 남긴 결과로 연결을 마친다. 남긴 것이 없으면 false.
 * state가 맞지 않거나 10분이 지났으면 거부한다.
 */
export async function completeStoredCallback(deps: Deps): Promise<boolean> {
  const search = deps.session.getItem(CALLBACK_KEY);
  if (search === null) return false;
  deps.session.removeItem(CALLBACK_KEY);
  const q = new URLSearchParams(search);
  const pending = readJson<PendingAuth>(deps.session, PENDING_AUTH_KEY);
  deps.session.removeItem(PENDING_AUTH_KEY);
  if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
    throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
  if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
  if (q.has('error')) throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
  const code = q.get('code');
  if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
  await tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: pending.verifier, resource: RESOURCE });
  try { deps.storage.setItem(CONNECTED_AT_KEY, String(deps.now())); } catch { /* 없어도 scope로 판단한다 */ }
  return true;
}

async function accessToken(deps: Deps, force = false): Promise<string> {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  if (!tokens?.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
  if (!force && tokens.access_expires_at - 60_000 > deps.now()) return tokens.access_token;
  return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).access_token;
}

/**
 * 동기화 API(`/elosorter/v1/sync*`) 요청.
 * - 401은 토큰을 한 번 갱신해 다시 보낸다.
 * - 403 + `WWW-Authenticate: … error="insufficient_scope"`는 동기화 권한이 없다는 뜻이다 → `no_sync_scope`. 토큰은 지우지 않는다.
 * - 그 밖의 403, 갱신 뒤에도 남은 401은 연결을 쓸 수 없다는 뜻이라 토큰을 지운다.
 * - 네트워크 실패는 'network'. 오류 메시지에 응답 본문·토큰을 넣지 않는다.
 */
export async function syncRequest(
  deps: Deps,
  method: 'GET' | 'PUT',
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + '/sync' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: options.body }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(SYNC_TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403 && /error="?insufficient_scope"?/i.test(response.headers.get('WWW-Authenticate') ?? ''))
    throw new LifeHubError('no_sync_scope', '이 연결에는 동기화 권한이 없어요. 다시 연결하면서 동기화를 허용해 주세요.');
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

const BOARD_TIMEOUT_MS = 30_000;

/**
 * 403이 권한(scope) 부족인가. `WWW-Authenticate`를 먼저 보고, 브라우저가 그 헤더를 못 읽는 경우(CORS로 노출되지 않음)를 위해
 * 본문의 `{"error":"insufficient_scope"}`도 받는다. 본문은 판단에만 쓰고 메시지에 넣지 않는다.
 */
async function isInsufficientScope(response: Response): Promise<boolean> {
  if (/error="?insufficient_scope"?/i.test(response.headers.get('WWW-Authenticate') ?? '')) return true;
  const body = (await response.clone().json().catch(() => null)) as { error?: unknown } | null;
  return body?.error === 'insufficient_scope';
}

/**
 * 보드 타일 목록 업로드 (`PUT /elosorter/v1/board`, scope `elosorter:board`). syncRequest와 일부러 따로 둔다:
 * syncRequest는 그 밖의 403에서 토큰을 지우는데, 그대로 쓰면 board 권한이 없는 옛 연결의 첫 업로드가 동기화 연결까지 끊는다.
 * - 403 + `WWW-Authenticate: … error="insufficient_scope"`를 **먼저** 본다 → `no_board_scope`. 토큰은 지우지 않는다.
 * - 401은 토큰을 한 번 갱신해 다시 보낸다. 갱신 뒤에도 남은 401, 그 밖의 403은 기존 규칙대로 토큰을 지운다 (`not_connected`).
 * - 네트워크 실패는 'network'. 오류 메시지에 응답 본문·토큰을 넣지 않는다.
 */
export async function boardRequest(deps: Deps, body: string): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + '/board', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(BOARD_TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403 && await isInsufficientScope(response))
    throw new LifeHubError('no_board_scope', '보드에 올리려면 Life Hub에 다시 연결해 주세요.');
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

/**
 * 연결을 끊는다: 토큰을 지우고, 서버의 갱신 토큰도 폐기하도록 요청한다 (best-effort: 실패해도 로컬은 이미 끊겼다).
 * 폐기 요청은 animan과 같이 토큰 엔드포인트로 보낸다 (P6 문서에 폐기 엔드포인트 명세는 없다).
 */
export function disconnect(deps: Deps): void {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  deps.storage.removeItem(TOKENS_KEY);
  if (tokens?.refresh_token)
    void deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString(),
    }).catch(() => undefined);
}
