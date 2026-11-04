// 테스트 전용 도구: 메모리 안 가짜 Life Hub 서버, 저장소, 가짜 기기. 합성 데이터와 fetch 모킹만 쓴다 —
// 실제 Life Hub에는 요청하지 않는다. 앱 코드에서는 가져오지 않는다.
//
// FakeHub는 life-hub의 src/sync/api.js·store.js 동작을 따른다 (docs/P6_SYNC.md 5절):
// version은 쓰기마다 정확히 1 증가, If-Match/If-None-Match 필수(428), 412 본문에 current meta(없으면 null),
// 413은 바이트 기준 1 MiB, 415, 400(형식: version === 2 이고 tracks가 배열), X-Device-Label은 출력 가능한 ASCII 1~40자.

import { parseSession, serializeSession, type SessionData } from '../../core/session/schema';
import { createInitialState, reducer, type Action, type AppState } from '../../state/reducer';
import { syntheticSession } from '../../core/session/synthetic';
import { createHubEngine, type HubEngine, type HubHost } from './engine';
import { LIFEHUB_ORIGIN, RESOURCE, type Deps } from './remote';

export const SYNC_URL = `${RESOURCE}/v1/sync`;
const TOKENS_KEY = 'elo:lifehub.tokens.v1';

export function memoryStorage(): Deps['storage'] & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
export const sha256OfText = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

interface StoredDoc { version: number; body: string; sha256: string; size: number; device: string | null; writtenAt: string }
export interface LoggedRequest { method: string; path: string; headers: Record<string, string>; bytes: number }

/** 다음 요청 하나를 이렇게 망가뜨린다 */
export interface Injection {
  method: 'GET' | 'PUT';
  /** 'meta' | 'doc'(GET /sync) — GET에서 어떤 경로인지. 생략하면 모두 */
  path?: 'meta' | 'doc';
  /** drop: 서버에 닿기 전에 네트워크 실패 / dropAfter: 서버가 처리한 뒤 응답을 잃음 / status: 서버가 이 상태로 거절 */
  kind: 'drop' | 'dropAfter' | 'status';
  status?: number;
  /** 몇 번 적용할지 (기본 1) */
  times?: number;
  /** 앞의 몇 번은 그냥 통과시킨다 */
  skip?: number;
}

export class FakeHub {
  versions: StoredDoc[] = [];
  log: LoggedRequest[] = [];
  /** 'ok' | 'inbox-only'(insufficient_scope 403) | 'revoked'(그 밖의 403) */
  access: 'ok' | 'inbox-only' | 'revoked' = 'ok';
  maxBytes = 1_048_576;
  private injections: Injection[] = [];
  private clock = Date.UTC(2026, 10, 3, 9, 0, 0);
  private tokenSeq = 0;
  validAccess = new Set<string>();
  tokenRequests: URLSearchParams[] = [];

  inject(i: Injection) { this.injections.push({ times: 1, ...i }); }
  get current(): StoredDoc | null { return this.versions.at(-1) ?? null; }
  puts() { return this.log.filter(r => r.method === 'PUT'); }
  deleteAll() { this.versions = []; }

  private meta(d: StoredDoc) {
    return { version: d.version, sha256: d.sha256, size_bytes: d.size, written_at: d.writtenAt, device: d.device };
  }
  private json(status: number, value: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();

    if (url.origin + url.pathname === `${LIFEHUB_ORIGIN}/oauth/token`) return this.token(String(init.body ?? ''));

    if (!url.pathname.startsWith('/elosorter/v1/sync')) return this.json(404, { error: 'Not found' });
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const rest = url.pathname.slice('/elosorter/v1/sync'.length);
    const body = typeof init.body === 'string' ? init.body : '';
    this.log.push({ method, path: rest || '/', headers, bytes: new TextEncoder().encode(body).byteLength });

    const auth = headers.authorization ?? '';
    if (!auth.startsWith('Bearer ') || !this.validAccess.has(auth.slice(7))) return this.json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
    if (this.access === 'inbox-only') return this.json(403, { error: 'insufficient_scope' }, { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="elosorter:sync"' });
    if (this.access === 'revoked') return this.json(403, { error: 'Token is not valid for this Life Hub' });

    const which = rest === '/meta' ? 'meta' : rest === '' ? 'doc' : null;
    const hit = this.injections.findIndex(i => i.method === method && (!i.path || i.path === which));
    let after: 'dropAfter' | null = null;
    if (hit >= 0 && (this.injections[hit].skip ?? 0) > 0) {
      this.injections[hit].skip!--;
    } else if (hit >= 0) {
      const inj = this.injections[hit];
      if (--inj.times! <= 0) this.injections.splice(hit, 1);
      if (inj.kind === 'drop') throw new TypeError('network down');
      if (inj.kind === 'status') return this.json(inj.status ?? 500, { error: 'injected' });
      after = 'dropAfter';
    }
    const response = await this.route(method, rest, headers, body);
    if (after) throw new TypeError('connection lost after the server answered');
    return response;
  };

  private async route(method: string, rest: string, headers: Record<string, string>, body: string): Promise<Response> {
    if (rest === '/meta' && method === 'GET') {
      const d = this.current;
      return d ? this.json(200, this.meta(d)) : this.json(404, { error: 'No document yet' });
    }
    if (rest === '' && method === 'GET') {
      const d = this.current;
      return d ? this.json(200, { ...this.meta(d), doc: JSON.parse(d.body) }) : this.json(404, { error: 'No document yet' });
    }
    if (rest === '' && method === 'PUT') return this.put(headers, body);
    return this.json(404, { error: 'Not found' });
  }

  private async put(headers: Record<string, string>, body: string): Promise<Response> {
    const ifMatch = headers['if-match'];
    const ifNone = headers['if-none-match'];
    if (ifMatch !== undefined && ifNone !== undefined) return this.json(400, { error: 'Use either If-Match or If-None-Match' });
    if (ifMatch === undefined && ifNone === undefined) return this.json(428, { error: 'If-Match is required' });
    let base = 0;
    if (ifNone !== undefined) {
      if (ifNone.trim() !== '*') return this.json(400, { error: 'Invalid If-None-Match' });
    } else {
      const m = /^(?:"([1-9][0-9]{0,14})"|([1-9][0-9]{0,14}))$/.exec(ifMatch.trim());
      if (!m) return this.json(400, { error: 'Invalid If-Match' });
      base = Number(m[1] ?? m[2]);
    }
    const label = headers['x-device-label'];
    if (label !== undefined && !/^[\x20-\x7e]{1,40}$/.test(label.trim())) return this.json(400, { error: 'Invalid X-Device-Label' });
    if (!/^application\/json(\s*;|\s*$)/i.test(headers['content-type'] ?? '')) return this.json(415, { error: 'application/json required' });
    const size = new TextEncoder().encode(body).byteLength;
    if (size > this.maxBytes) return this.json(413, { error: 'Document too large' });
    let doc: unknown;
    try { doc = JSON.parse(body); } catch { return this.json(400, { error: 'Invalid JSON' }); }
    const d = doc as { version?: unknown; tracks?: unknown } | null;
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.version !== 2 || !Array.isArray(d.tracks)) return this.json(400, { error: 'Invalid document' });

    // 실제 Hub의 쓰기는 조건부 INSERT 한 문장이라 검사와 저장이 쪼개지지 않는다: 여기서도 사이에 await를 두지 않는다
    const sha256 = await sha256OfText(body);
    const cur = this.current;
    if ((cur?.version ?? 0) !== base) return this.json(412, { error: 'Precondition failed', current: cur ? this.meta(cur) : null });
    this.clock += 1000;
    const stored: StoredDoc = {
      version: base + 1, body, sha256, size, device: label?.trim() ?? null,
      writtenAt: new Date(this.clock).toISOString(),
    };
    this.versions.push(stored);
    return this.json(200, { version: stored.version, sha256: stored.sha256, written_at: stored.writtenAt });
  }

  private async token(raw: string): Promise<Response> {
    const p = new URLSearchParams(raw);
    this.tokenRequests.push(p);
    if (p.get('grant_type') === 'authorization_code' || p.get('grant_type') === 'refresh_token') {
      const access = `at-${++this.tokenSeq}`;
      this.validAccess.add(access);
      return this.json(200, { access_token: access, refresh_token: `rt-${this.tokenSeq}`, token_type: 'bearer', expires_in: 300, scope: 'elosorter:sync' });
    }
    return this.json(200, {});
  }
}

export interface TestDeps extends Deps { storage: ReturnType<typeof memoryStorage>; session: ReturnType<typeof memoryStorage>; clock: { t: number } }

export function makeDeps(hub: FakeHub): TestDeps {
  const clock = { t: Date.UTC(2026, 10, 3, 9, 0, 0) };
  let n = 0;
  return {
    clock,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => hub.fetch(input, init)) as typeof fetch,
    storage: memoryStorage(),
    session: memoryStorage(),
    now: () => clock.t,
    random: bytes => Uint8Array.from({ length: bytes }, (_, i) => (i * 37 + ++n * 11) & 255),
    sha256: async d => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

/** 이미 연결된 상태로 만든다 (연결 절차 자체는 remote.test.ts) */
export function connected(deps: TestDeps, hub: FakeHub, scope = 'elosorter:sync') {
  const access = `at-pre-${hub.validAccess.size}`;
  hub.validAccess.add(access);
  deps.storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: access, refresh_token: 'rt-pre', access_expires_at: deps.now() + 3_600_000, scope }));
}

/**
 * 가짜 기기: 실제 리듀서·엔진·저장소 직렬화를 쓰고, 화면(React)과 타이머만 뺀 것.
 * `autoPush()`는 훅의 "변경이 있으면 예약된 시점에 올린다"를 한 번 실행하는 것과 같다.
 */
export class Device {
  readonly hub: FakeHub;
  readonly deps: TestDeps;
  state: AppState;
  engine: HubEngine;
  stashed: SessionData[] = [];
  userId: string | null;
  private flushCount = 0;

  constructor(hub: FakeHub, opts: { session?: SessionData; userId?: string | null; connect?: boolean; seed?: number } = {}) {
    this.hub = hub;
    this.deps = makeDeps(hub);
    this.userId = opts.userId === undefined ? 'synthetic-user' : opts.userId;
    this.state = createInitialState(opts.seed ?? 1, opts.session ?? null);
    if (this.userId) this.state = reducer(this.state, { type: 'setUser', user: { id: this.userId, displayName: 'tester', imageUrl: '' } });
    if (opts.connect !== false) connected(this.deps, hub);
    this.engine = this.makeEngine();
  }

  private makeEngine(): HubEngine {
    const host: HubHost = {
      session: () => this.state.session,
      revision: () => this.state.revision,
      unsaved: () => Math.max(0, this.state.revision - this.state.hubRevision),
      userId: () => this.userId,
      flushLocal: () => new Date(Date.UTC(2026, 10, 3, 10, 0, ++this.flushCount)).toISOString(),
      saved: ({ version, revision }) => this.dispatch({ type: 'hubSaved', version, revision }),
      rebase: version => this.dispatch({ type: 'hubBase', version }),
      adopt: session => this.dispatch({ type: 'hydrate', session, origin: 'hub' }),
      stash: session => void this.stashed.push(session),
      markDirty: () => this.dispatch({ type: 'markDirty' }),
    };
    return createHubEngine({ deps: this.deps, host, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537' });
  }

  dispatch(action: Action) { this.state = reducer(this.state, action); }
  get session() { return this.state.session; }
  get unsaved() { return this.state.revision - this.state.hubRevision; }
  get status() { return this.engine.getSnapshot().status; }

  /** 비교를 n번 한다 (실제 choose 액션) */
  play(n: number) {
    if (this.state.phase !== 'sort') this.dispatch({ type: 'setPhase', phase: 'sort' });
    for (let k = 0; k < n && this.state.curPair; k++) {
      this.dispatch({ type: 'choose', pair: this.state.curPair, score: [0, 0.25, 0.5, 0.75, 1][k % 5] });
    }
  }

  /** 켜고 서버를 한 번 확인한다 (앱 시작과 같다) */
  async enable() {
    await this.engine.setEnabled(true);
  }

  /** 훅이 예약해 둔 업로드를 지금 한 번 */
  async autoPush() { return this.unsaved > 0 ? this.engine.push('auto') : 'skipped'; }

  /** 앱을 닫았다 다시 연다: 세션은 저장소를 거쳐 돌아오고(rating·sigma 포함), 메모리 상태와 엔진은 새로 만든다 */
  restart() {
    const persisted = parseSession(JSON.parse(JSON.stringify(serializeSession(this.state.session))))!;
    this.state = createInitialState(1, persisted);
    this.engine = this.makeEngine();
  }
}

export const sessionWith = (tracks: number, matches: number, seed = 1) => syntheticSession({ tracks, matches, seed });

/** 두 번째 기기가 합류한다: 빈 상태에서 켜고, 서버 문서를 받아 쓴다 (실제 사용 순서) */
export async function join(hub: FakeHub, opts: ConstructorParameters<typeof Device>[1] = {}) {
  const d = new Device(hub, { seed: 2, ...opts });
  await d.enable();
  const outcome = await d.engine.loadCloud();
  if (outcome !== 'ok') throw new Error(`join failed: ${outcome}`);
  return d;
}
