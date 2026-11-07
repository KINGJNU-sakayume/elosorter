// 보드 목록 업로드. 가짜 fetch와 메모리 저장소만 쓴다 (실제 Life Hub에 요청하지 않는다).

import { describe, expect, it } from 'vitest';
import { SAMPLE_NOW, sampleSession } from '../../core/board/sampleState';
import { SESSION_VERSION, type SessionData } from '../../core/session/schema';
import {
  BOARD_STATE_KEY, boardGateOpen, createBoardUploader, DAILY_MS, MIN_INTERVAL_MS, readBoardState, type BoardUploaderOptions,
} from './boardUpload';
import { BOARD_SCOPE, CONNECTED_AT_KEY, LIFEHUB_ORIGIN, SYNC_SCOPE, type Deps } from './remote';
import { memoryStorage } from './testing';

const TOKENS_KEY = 'elo:lifehub.tokens.v1';
const BOARD_URL = `${LIFEHUB_ORIGIN}/elosorter/v1/board`;

interface Call { url: string; method: string; headers: Record<string, string>; body: string }
type Reply = { status: number; body?: unknown; headers?: Record<string, string>; wait?: Promise<void> } | 'network';

function setup({ replies = [] as Reply[], scope = `${SYNC_SCOPE} ${BOARD_SCOPE}`, session = sampleSession(), ready = true } = {}) {
  const storage = memoryStorage();
  const clock = { t: SAMPLE_NOW };
  const calls: Call[] = [];
  const queue = [...replies];
  const timers: Array<{ fn: () => unknown; at: number }> = [];
  const logs: string[] = [];
  let notConnected = 0;
  let tokenSeq = 0;
  storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'at-0', refresh_token: 'rt-0', access_expires_at: clock.t + 3_600_000, scope }));

  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === `${LIFEHUB_ORIGIN}/oauth/token`) {
      tokenSeq++;
      return new Response(JSON.stringify({ access_token: `at-${tokenSeq}`, refresh_token: `rt-${tokenSeq}`, token_type: 'bearer', expires_in: 300, scope }), { status: 200 });
    }
    calls.push({ url, method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()), body: String(init.body ?? '') });
    const r = queue.shift() ?? { status: 200, body: { ok: true } };
    if (r === 'network') throw new TypeError('network down');
    if (r.wait) await r.wait;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  }) as typeof globalThis.fetch;

  const deps: Deps = {
    fetch, storage, session: memoryStorage(), now: () => clock.t,
    random: n => new Uint8Array(n),
    sha256: async d => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
  const state = { session, ready };
  const options: BoardUploaderOptions = {
    deps,
    getSession: () => state.session,
    ready: () => state.ready,
    onNotConnected: () => { notConnected++; },
    log: m => { logs.push(m); },
    setTimer: (fn, ms) => {
      const t = { fn, at: clock.t + ms };
      timers.push(t);
      return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
    },
  };
  const make = () => createBoardUploader(options);
  return {
    storage, clock, calls, state, logs, make, deps,
    uploader: make(),
    queue: (r: Reply) => queue.push(r),
    notConnected: () => notConnected,
    /** 시계를 옮기고 그때까지 찬 타이머를 돌린다 */
    advance: async (ms: number) => {
      clock.t += ms;
      for (const t of timers.filter(x => x.at <= clock.t)) {
        timers.splice(timers.indexOf(t), 1);
        await t.fn(); // 타이머가 시작한 시도가 끝날 때까지
      }
    },
    timers,
    tokens: () => storage.getItem(TOKENS_KEY),
  };
}

const withComparison = (s: SessionData): SessionData => ({ ...s, compCount: s.compCount + 1 });
const insufficient = { status: 403, body: { error: 'insufficient_scope' }, headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="elosorter:board"' } };

describe('board upload', () => {
  it('PUTs the manifest with the bearer token and JSON, and remembers the success', async () => {
    const h = setup();
    expect(await h.uploader.start()).toBe('sent');
    expect(h.calls).toHaveLength(1);
    const c = h.calls[0];
    expect(c.url).toBe(BOARD_URL);
    expect(c.method).toBe('PUT');
    expect(c.headers.authorization).toBe('Bearer at-0');
    expect(c.headers['content-type']).toBe('application/json');
    const body = JSON.parse(c.body);
    expect(body).toMatchObject({ version: 1, app: 'elosorter', generated_at: new Date(SAMPLE_NOW).toISOString() });
    expect(body.tiles.length).toBeGreaterThan(0);
    // 세션(비교 기록·곡 id)은 올리지 않는다
    expect(c.body).not.toContain('matches');
    expect(c.body).not.toContain('sample01');
    const st = readBoardState(h.storage);
    expect(st).toMatchObject({ lastOkAt: SAMPLE_NOW, pending: false, halt: null });
    expect(st.sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('unchanged and ignored replies are successes', async () => {
    const h = setup({ replies: [{ status: 200, body: { unchanged: true } }, { status: 200, body: { ignored: true } }] });
    expect(await h.uploader.start()).toBe('sent');
    await h.advance(MIN_INTERVAL_MS);
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('ignored');
    expect(readBoardState(h.storage)).toMatchObject({ pending: false, lastOkAt: SAMPLE_NOW + MIN_INTERVAL_MS });
  });

  it('does not send when the content (without generated_at) is the same as the last success', async () => {
    const h = setup();
    await h.uploader.start();
    await h.advance(MIN_INTERVAL_MS + 1);
    expect(await h.uploader.notifyChange()).toBe('unchanged');
    expect(await h.uploader.start()).toBe('unchanged'); // 하루가 안 지났다
    expect(h.calls).toHaveLength(1);
    expect(readBoardState(h.storage).pending).toBe(false);
  });

  it('sends once a day on app open even when the content is the same', async () => {
    const h = setup();
    await h.uploader.start();
    await h.advance(DAILY_MS);
    const next = h.make(); // 다음 날 앱을 다시 연다
    expect(await next.start()).toBe('sent');
    expect(h.calls).toHaveLength(2);
    // 같은 날 두 번째로 열면 보내지 않는다
    await h.advance(MIN_INTERVAL_MS);
    expect(await h.make().start()).toBe('unchanged');
    expect(h.calls).toHaveLength(2);
  });

  it('at most once per 10 minutes: a change inside the window is sent when the window ends, once', async () => {
    const h = setup();
    await h.uploader.start();
    await h.advance(60_000);
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('throttled');
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('throttled');
    expect(h.calls).toHaveLength(1);
    expect(readBoardState(h.storage).pending).toBe(true);
    await h.advance(MIN_INTERVAL_MS - 60_000 - 1000);
    expect(h.calls).toHaveLength(1);
    await h.advance(1000);
    expect(h.calls).toHaveLength(2);
    expect(JSON.parse(h.calls[1].body).tiles[0].data.foot).toContain('비교 216회');
    expect(readBoardState(h.storage).pending).toBe(false);
  });

  it("a pending change left when the app closed is sent on the next start", async () => {
    const h = setup();
    await h.uploader.start();
    await h.advance(60_000);
    h.state.session = withComparison(h.state.session);
    await h.uploader.notifyChange(); // throttled, 앱이 닫힌다(타이머 사라짐)
    h.uploader.dispose();
    h.timers.length = 0;
    expect(readBoardState(h.storage).pending).toBe(true);
    await h.advance(MIN_INTERVAL_MS);
    expect(await h.make().start()).toBe('sent');
    expect(h.calls).toHaveLength(2);
    expect(readBoardState(h.storage).pending).toBe(false);
  });

  it('403 insufficient_scope keeps the Life Hub token, halts, and asks to reconnect', async () => {
    const h = setup({ scope: SYNC_SCOPE, replies: [insufficient] });
    const before = h.tokens();
    expect(await h.uploader.start()).toBe('no_scope');
    expect(h.tokens()).toBe(before);
    expect(h.notConnected()).toBe(0);
    expect(h.uploader.needsReconnect()).toBe(true);
    expect(readBoardState(h.storage)).toMatchObject({ halt: 'no_scope', pending: true });
    // 멈춘 동안은 요청하지 않는다
    await h.advance(MIN_INTERVAL_MS * 2);
    expect(await h.uploader.start()).toBe('no_scope');
    expect(h.calls).toHaveLength(1);
    // 다시 연결해 board scope를 받으면 풀린다
    h.storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'at-new', refresh_token: 'rt-new', access_expires_at: h.clock.t + 3_600_000, scope: `${SYNC_SCOPE} ${BOARD_SCOPE}` }));
    expect(h.uploader.needsReconnect()).toBe(false);
    expect(await h.uploader.start()).toBe('sent');
    expect(h.calls[1].headers.authorization).toBe('Bearer at-new');
  });

  it('insufficient_scope in the body counts too (the header may not be readable cross-origin)', async () => {
    const h = setup({ scope: SYNC_SCOPE, replies: [{ status: 403, body: { error: 'insufficient_scope' } }] });
    expect(await h.uploader.start()).toBe('no_scope');
    expect(h.tokens()).not.toBeNull();
  });

  it('reconnecting releases the halt even when the token response carries no scope', async () => {
    const h = setup({ scope: SYNC_SCOPE, replies: [insufficient] });
    h.storage.setItem(CONNECTED_AT_KEY, String(h.clock.t - DAILY_MS)); // 예전 연결
    expect(await h.uploader.start()).toBe('no_scope');
    // scope 필드 없는 새 토큰으로 다시 연결
    await h.advance(60_000);
    h.storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'at-new', refresh_token: 'rt-new', access_expires_at: h.clock.t + 3_600_000 }));
    expect(h.uploader.needsReconnect()).toBe(true); // 아직 다시 연결을 마치지 않음
    h.storage.setItem(CONNECTED_AT_KEY, String(h.clock.t));
    expect(h.uploader.needsReconnect()).toBe(false);
    await h.advance(MIN_INTERVAL_MS);
    expect(await h.uploader.start()).toBe('sent');
    expect(readBoardState(h.storage)).toMatchObject({ halt: null, haltedAt: null });
  });

  it('a change that arrives while a request is in flight is sent when the 10 minutes are up', async () => {
    let release!: () => void;
    const wait = new Promise<void>(r => { release = r; });
    const h = setup({ replies: [{ status: 200, wait }] });
    const first = h.uploader.start();
    await new Promise(r => setTimeout(r, 0));
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('skipped'); // 보내는 중
    release();
    expect(await first).toBe('sent');
    expect(readBoardState(h.storage).pending).toBe(true);
    expect(h.timers).toHaveLength(1);
    await h.advance(MIN_INTERVAL_MS);
    expect(h.calls).toHaveLength(2);
    expect(JSON.parse(h.calls[1].body).tiles[0].data.foot).toContain('비교 215회');
  });

  it('any other 403 follows the existing rule: the token is dropped', async () => {
    const h = setup({ replies: [{ status: 403, body: { error: 'Token is not valid for this Life Hub' } }] });
    expect(await h.uploader.start()).toBe('not_connected');
    expect(h.tokens()).toBeNull();
    expect(h.notConnected()).toBe(1);
  });

  it('a 401 is retried once after a token refresh; a 401 that stays drops the token', async () => {
    const ok = setup({ replies: [{ status: 401 }, { status: 200 }] });
    expect(await ok.uploader.start()).toBe('sent');
    expect(ok.calls.map(c => c.headers.authorization)).toEqual(['Bearer at-0', 'Bearer at-1']);
    expect(ok.tokens()).not.toBeNull();

    const bad = setup({ replies: [{ status: 401 }, { status: 401 }] });
    expect(await bad.uploader.start()).toBe('not_connected');
    expect(bad.tokens()).toBeNull();
  });

  it('400 is logged and the same content is not sent again; a new content is', async () => {
    const h = setup({ replies: [{ status: 400, body: { error: 'bad' } }] });
    expect(await h.uploader.start()).toBe('rejected');
    expect(h.logs).toEqual(['[board] Life Hub가 보드 목록을 받지 않았어요 (400).']);
    await h.advance(MIN_INTERVAL_MS);
    expect(await h.uploader.notifyChange()).toBe('rejected');
    expect(h.calls).toHaveLength(1);
    expect(h.tokens()).not.toBeNull();
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('sent');
  });

  it('network errors and 5xx are retried later, the token stays', async () => {
    const h = setup({ replies: ['network', { status: 503 }] });
    expect(await h.uploader.start()).toBe('retry');
    expect(readBoardState(h.storage).pending).toBe(true);
    await h.advance(MIN_INTERVAL_MS);
    expect(h.calls).toHaveLength(2); // 타이머가 다시 보냈고 503
    expect(readBoardState(h.storage).pending).toBe(true);
    await h.advance(MIN_INTERVAL_MS);
    expect(h.calls).toHaveLength(3);
    expect(readBoardState(h.storage).pending).toBe(false);
    expect(h.tokens()).not.toBeNull();
  });

  it('does not upload without a record (no classified track), before the sync merge, or when not connected', async () => {
    const empty: SessionData = { ...sampleSession(), tracks: sampleSession().tracks.map(t => ({ ...t, tier: null })), version: SESSION_VERSION };
    const a = setup({ session: empty });
    expect(await a.uploader.start()).toBe('skipped');
    expect(await a.uploader.notifyChange()).toBe('skipped');

    const b = setup({ ready: false });
    expect(await b.uploader.notifyChange()).toBe('skipped');
    expect(readBoardState(b.storage).pending).toBe(true); // 맞춘 뒤에 보낸다
    b.state.ready = true;
    expect(await b.uploader.start()).toBe('sent');

    const c = setup();
    c.storage.removeItem(TOKENS_KEY);
    expect(await c.uploader.start()).toBe('skipped');
    for (const h of [a, c]) expect(h.calls).toHaveLength(0);
  });

  it('keeps generated_at increasing even if the device clock goes back', async () => {
    const h = setup();
    await h.uploader.start();
    h.clock.t -= 60 * 60 * 1000;
    h.storage.setItem(BOARD_STATE_KEY, JSON.stringify({ ...readBoardState(h.storage), lastSentAt: null }));
    h.state.session = withComparison(h.state.session);
    expect(await h.uploader.notifyChange()).toBe('sent');
    const [first, second] = h.calls.map(c => Date.parse(JSON.parse(c.body).generated_at));
    expect(second).toBeGreaterThan(first);
  });
});

describe('boardGateOpen', () => {
  const snap = { connected: true, status: 'idle' as const, checked: true, remote: null, conflict: null };
  const remote = { version: 2, writtenAt: '', device: null, sizeBytes: null, summary: null };
  it('opens only after the sync has checked this run and nothing newer is waiting', () => {
    expect(boardGateOpen(snap)).toBe(true);
    expect(boardGateOpen({ ...snap, status: 'saving' })).toBe(true);
    expect(boardGateOpen({ ...snap, checked: false })).toBe(false);
    expect(boardGateOpen({ ...snap, remote })).toBe(false);
    expect(boardGateOpen({ ...snap, status: 'conflict', conflict: remote })).toBe(false);
    expect(boardGateOpen({ ...snap, status: 'blocked' })).toBe(false);
    expect(boardGateOpen({ ...snap, status: 'off' })).toBe(false);
    expect(boardGateOpen({ ...snap, connected: false })).toBe(false);
  });
  it('a connection without sync permission uploads this device\'s state', () => {
    expect(boardGateOpen({ ...snap, status: 'forbidden', checked: false })).toBe(true);
  });
});
