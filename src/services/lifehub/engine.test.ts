import { describe, expect, it } from 'vitest';
import { syncContentKey, SYNC_LIMIT_BYTES } from '../../core/session/syncDoc';
import { putDocument, sha256Hex } from './protocol';
import { readState } from './state';
import { Device, FakeHub, join, sessionWith } from './testing';

const bodyOf = (hub: FakeHub, i = -1) => JSON.parse(hub.versions.at(i)!.body) as { version: number; tracks: Record<string, unknown>[] } & Record<string, unknown>;
const deviceWith = (hub: FakeHub, tracks = 30, matches = 40, seed = 1) => new Device(hub, { session: sessionWith(tracks, matches, seed) });

describe('first write and If-Match writes', () => {
  it('first write uses If-None-Match: * and sends the sync document (no derived values)', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    expect(hub.log.map(r => `${r.method} ${r.path}`)).toEqual(['GET /meta']); // 서버에 문서가 없다
    expect(a.unsaved).toBeGreaterThan(0); // 업로드가 예약됐다

    expect(await a.autoPush()).toBe('ok');
    const put = hub.puts()[0];
    expect(put.headers['if-none-match']).toBe('*');
    expect(put.headers['if-match']).toBeUndefined();
    expect(put.headers['content-type']).toBe('application/json');
    expect(put.headers['x-device-label']).toBe('Chrome on Linux');
    const doc = bodyOf(hub);
    expect(doc.version).toBe(2);
    expect(doc.tracks).toHaveLength(30);
    expect(doc.tracks.every(t => !('rating' in t) && !('sigma' in t))).toBe(true);

    expect(a.session.syncVersion).toBe(1);
    expect(a.unsaved).toBe(0);
    expect(a.status).toBe('idle');
    expect(a.engine.getSnapshot().everSucceeded).toBe(true);
    expect(a.engine.getSnapshot().lastSyncAt).not.toBeNull();
  });

  it('later writes carry If-Match with the version the copy is based on', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    a.play(3);
    expect(await a.autoPush()).toBe('ok');
    expect(hub.puts()[1].headers['if-match']).toBe('"1"');
    expect(a.session.syncVersion).toBe(2);
    a.play(1);
    await a.autoPush();
    expect(hub.puts()[2].headers['if-match']).toBe('"2"');
    expect(hub.versions.map(v => v.version)).toEqual([1, 2, 3]);
  });

  it('does not write when nothing but the save time changed', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    a.dispatch({ type: 'markDirty' }); // 변경 없이 저장만 예약된 경우
    expect(await a.engine.push('auto')).toBe('skipped');
    expect(hub.puts()).toHaveLength(1);
    expect(a.unsaved).toBe(0);
  });

  it('after a restart, an unchanged copy asks for nothing but a meta check', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    hub.log.length = 0;
    a.restart();
    await a.engine.check();
    expect(hub.log.map(r => `${r.method} ${r.path}`)).toEqual(['GET /meta']);
    expect(a.unsaved).toBe(0);
    expect(a.status).toBe('idle');
  });

  it('after a restart, edits made but not yet sent are found and scheduled', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    a.play(2);
    a.restart(); // 보내기 전에 앱을 닫았다
    expect(a.unsaved).toBe(0);
    await a.engine.check();
    expect(a.unsaved).toBeGreaterThan(0);
    expect(await a.autoPush()).toBe('ok');
    expect(hub.versions).toHaveLength(2);
  });

  it('omits X-Device-Label when the label is empty, sanitises the rest', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    a.engine.setDeviceLabel('폰📱');
    expect(a.engine.getSnapshot().deviceLabel).toBeNull(); // 쓸 수 있는 글자가 없다 → 기본 이름
    a.engine.setDeviceLabel('  My phone  ');
    expect(a.engine.getSnapshot().effectiveLabel).toBe('My phone');
    a.engine.setDeviceLabel('x'.repeat(60));
    expect(a.engine.getSnapshot().effectiveLabel).toHaveLength(40);
  });
});

describe('412 → conflict', () => {
  /** A가 v1을 쓰고, B가 v1 위에서 시작한다 */
  async function twoOnV1() {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    const b = await join(hub); // B는 A가 올린 문서를 받아 쓴 기기
    return { hub, a, b };
  }

  it('a stale base gets 412 and enters conflict, with no automatic retry upload', async () => {
    const { hub, a, b } = await twoOnV1();
    expect(b.status).toBe('idle');
    a.play(4);
    await a.autoPush(); // 서버 v2
    b.play(2);
    const puts = hub.puts().length;
    expect(await b.autoPush()).toBe('conflict');
    expect(hub.puts().length).toBe(puts + 1); // 시도는 한 번뿐
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"1"');
    expect(b.status).toBe('conflict');
    expect(b.engine.getSnapshot().conflict).toMatchObject({ version: 2 });
    expect(b.engine.getSnapshot().conflict!.summary!.compCount).toBe(a.session.compCount);

    // conflict에서는 몇 번을 시도해도, 새 변경이 쌓여도 올리지 않는다
    b.play(5);
    expect(await b.autoPush()).toBe('skipped');
    expect(await b.engine.push('manual')).toBe('skipped');
    await b.engine.syncNow();
    expect(hub.puts().length).toBe(puts + 1);
    expect(hub.current!.version).toBe(2);
    expect(b.status).toBe('conflict');
  });

  it('is also found by the start check, before any upload is tried', async () => {
    const { hub, a, b } = await twoOnV1();
    a.play(4);
    await a.autoPush();
    b.play(2);
    b.restart();
    const puts = hub.puts().length;
    await b.engine.check();
    expect(b.status).toBe('conflict');
    expect(await b.autoPush()).toBe('skipped');
    expect(hub.puts().length).toBe(puts);
  });

  it('without unsent local changes it is not a conflict: it shows the cloud summary and lets the owner choose', async () => {
    const { hub, a, b } = await twoOnV1();
    a.play(4);
    await a.autoPush();
    const before = syncContentKey(b.session);
    await b.engine.check();
    expect(b.status).toBe('idle');
    const snap = b.engine.getSnapshot();
    expect(snap.conflict).toBeNull();
    expect(snap.remote).toMatchObject({ version: 2 });
    expect(snap.remote!.summary!.trackCount).toBe(30);
    expect(syncContentKey(b.session)).toBe(before); // 자동으로 바꾸지 않는다
    expect(hub.puts()).toHaveLength(2); // A의 두 번뿐

    // 그 뒤 이 기기에서 고치면 보내지 않고 충돌이 된다
    b.play(1);
    expect(await b.autoPush()).toBe('conflict');
    expect(hub.puts()).toHaveLength(2);
  });

  it('a copy with no base (e.g. loaded from a file) does not overwrite an existing cloud document', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub, 30, 40, 1);
    await a.enable();
    await a.autoPush();
    const b = deviceWith(hub, 25, 10, 2); // 서로 무관한 세션
    await b.enable();
    expect(b.status).toBe('conflict');
    expect(await b.autoPush()).toBe('skipped');
    expect(hub.puts()).toHaveLength(1);
  });

  it('a copy with no base whose content equals the cloud document just takes the version', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    const b = new Device(hub, { session: { ...a.session, syncVersion: null } });
    await b.enable();
    expect(b.status).toBe('idle');
    expect(b.session.syncVersion).toBe(1);
    expect(b.unsaved).toBe(0);
    expect(hub.puts()).toHaveLength(1);
  });
});

describe('resolving a conflict', () => {
  async function conflicted() {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    const b = await join(hub);
    a.play(4);
    await a.autoPush(); // v2
    b.play(3);
    await b.autoPush();
    expect(b.status).toBe('conflict');
    return { hub, a, b };
  }

  it('overwrite: PUT with If-Match set to the version the conflict showed', async () => {
    const { hub, a, b } = await conflicted();
    expect(await b.engine.overwrite()).toBe('ok');
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"2"');
    expect(hub.current!.version).toBe(3);
    expect(b.session.syncVersion).toBe(3);
    expect(b.status).toBe('idle');
    expect(b.unsaved).toBe(0);
    // A는 이제 클라우드가 더 새롭다 (보내지 않은 변경 없음) → 가져온다
    await a.engine.check();
    expect(a.engine.getSnapshot().remote).toMatchObject({ version: 3 });
    expect(await a.engine.loadCloud()).toBe('ok');
    expect(syncContentKey(a.session)).toBe(syncContentKey(b.session));
    expect(a.session.syncVersion).toBe(3);
  });

  it('overwrite loses to a third write made in between: 412 again → conflict, nothing overwritten', async () => {
    const { hub, a, b } = await conflicted();
    a.play(2);
    await a.engine.check(); // A는 아직 v2 기준 → 보내지 않은 변경 없음, 그대로 쓰면 v3
    await a.autoPush();
    expect(hub.current!.version).toBe(3);
    const mine = hub.current!.sha256;
    expect(await b.engine.overwrite()).toBe('conflict');
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"2"'); // conflict가 보여준 version으로 걸었다
    expect(hub.current!.version).toBe(3);
    expect(hub.current!.sha256).toBe(mine);
    expect(b.engine.getSnapshot().conflict).toMatchObject({ version: 3 });
    // 이제 v3으로 덮어쓰면 된다
    expect(await b.engine.overwrite()).toBe('ok');
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"3"');
    expect(hub.current!.version).toBe(4);
  });

  it('use cloud: validates the downloaded document, keeps the replaced local session, then adopts it', async () => {
    const { a, b } = await conflicted();
    const before = b.session;
    expect(await b.engine.loadCloud()).toBe('ok');
    expect(b.stashed).toEqual([before]); // 바꾸기 전 로컬 세션을 남겼다
    expect(syncContentKey(b.session)).toBe(syncContentKey(a.session));
    expect(b.session.syncVersion).toBe(2);
    expect(b.status).toBe('idle');
    expect(b.unsaved).toBe(0);
    expect(b.engine.getSnapshot().conflict).toBeNull();
  });

  it('use cloud does not touch the local session when the document is not a valid session', async () => {
    const { hub, b } = await conflicted();
    // 서버 문서를 망가뜨린다 (Hub 검사는 version과 tracks 배열만 보므로 이런 문서도 저장될 수 있다)
    const bad = JSON.stringify({ version: 3, tracks: [] });
    hub.versions.push({ ...hub.current!, version: 3, body: bad, sha256: 'x'.repeat(64) });
    const before = b.session;
    expect(await b.engine.loadCloud()).toBe('error');
    expect(b.session).toBe(before);
    expect(b.stashed).toEqual([]);
    expect(b.engine.getSnapshot().detail).not.toContain('tracks');
  });

  it('use cloud with no document on the server changes nothing', async () => {
    const { hub, b } = await conflicted();
    hub.deleteAll();
    const before = b.session;
    expect(await b.engine.loadCloud()).toBe('none');
    expect(b.session).toBe(before);
  });
});

describe('412 details', () => {
  it('a 412 whose current sha256 equals the body just sent is a success (replay of a committed write)', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    const body = JSON.stringify({ version: 2, tracks: [{ id: 'x' }], note: '한글' });
    const first = await putDocument(a.deps, { body, base: null, label: null });
    expect(first).toMatchObject({ ok: true, version: 1 });
    const second = await putDocument(a.deps, { body, base: null, label: null }); // 같은 본문을 같은 기준으로 다시
    expect(second).toMatchObject({ ok: true, version: 1, sha256: await sha256Hex(a.deps, body) });
    expect(hub.versions).toHaveLength(1);
    expect(hub.puts().map(p => p.headers['if-none-match'])).toEqual(['*', '*']); // 두 번째는 412로 거절됐다
  });

  it('a 412 with a different sha256 is a conflict result, not a retry', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await putDocument(a.deps, { body: JSON.stringify({ version: 2, tracks: [] }), base: null, label: null });
    const r = await putDocument(a.deps, { body: JSON.stringify({ version: 2, tracks: [{ id: 'y' }] }), base: null, label: null });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', current: { version: 1 } });
    expect(hub.puts()).toHaveLength(2);
  });

  it('current: null (document deleted) → writes again with If-None-Match: *', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    hub.deleteAll();
    a.play(2);
    expect(await a.autoPush()).toBe('ok');
    const [first, second] = hub.puts().slice(-2);
    expect(first.headers['if-match']).toBe('"1"');
    expect(second.headers['if-none-match']).toBe('*');
    expect(hub.versions.map(v => v.version)).toEqual([1]);
    expect(a.session.syncVersion).toBe(1);
    expect(a.status).toBe('idle');
  });

  it('a deleted server document is recreated from an unchanged local copy at the next check', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    hub.deleteAll();
    await a.engine.check();
    expect(a.unsaved).toBeGreaterThan(0);
    expect(await a.autoPush()).toBe('ok');
    expect(hub.puts().at(-1)!.headers['if-none-match']).toBe('*');
  });
});

describe('lost responses', () => {
  it('the server committed but the response was lost: no second write', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    hub.inject({ method: 'PUT', kind: 'dropAfter' });
    expect(await a.autoPush()).toBe('ok');
    expect(hub.puts()).toHaveLength(1);
    expect(hub.versions).toHaveLength(1);
    expect(a.session.syncVersion).toBe(1);
    expect(a.unsaved).toBe(0);
    expect(hub.log.filter(r => r.method === 'GET' && r.path === '/meta').length).toBeGreaterThanOrEqual(2); // 다시 보내기 전에 meta를 봤다
  });

  it('the request never reached the server: meta shows no change, so the same body is sent again once', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    hub.inject({ method: 'PUT', kind: 'drop' });
    expect(await a.autoPush()).toBe('ok');
    expect(hub.puts()).toHaveLength(2);
    expect(hub.puts()[1].bytes).toBe(hub.puts()[0].bytes);
    expect(hub.versions).toHaveLength(1);
  });

  it('a 5xx answer is treated like a lost response', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    a.play(2);
    hub.inject({ method: 'PUT', kind: 'status', status: 503 });
    expect(await a.autoPush()).toBe('ok');
    expect(hub.versions.map(v => v.version)).toEqual([1, 2]);
  });

  it('offline right after sending: keeps the pending write and checks it before the next send', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    // PUT은 서버에 반영되고 응답이 사라지며, 그 뒤 meta 확인도 네트워크 실패
    hub.inject({ method: 'PUT', kind: 'dropAfter' });
    hub.inject({ method: 'GET', path: 'meta', kind: 'drop', skip: 1 }); // 0번째는 첫 쓰기 전 확인
    expect(await a.autoPush()).toBe('retry');
    expect(a.status).toBe('retry');
    expect(readState(a.deps.storage).pending).not.toBeNull();
    expect(a.unsaved).toBeGreaterThan(0);
    expect(hub.versions).toHaveLength(1); // 서버에는 이미 반영돼 있다
    const putsBefore = hub.puts().length;

    // 앱을 닫았다 열면: 시작 확인이 서버 문서가 방금 보내려던 본문임을 알아보고 기준만 맞춘다
    a.restart();
    await a.engine.check();
    expect(await a.autoPush()).toBe('skipped');
    expect(hub.puts().length).toBe(putsBefore); // 중복 쓰기 없음
    expect(hub.versions).toHaveLength(1);
    expect(a.session.syncVersion).toBe(1);
    expect(a.unsaved).toBe(0);
    expect(readState(a.deps.storage).pending).toBeNull();
    expect(a.engine.getSnapshot().everSucceeded).toBe(true); // 그 쓰기는 성공이었다
    expect(a.status).toBe('idle');
  });

  it('same, when the next upload comes before any check: the pending write is looked up first', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    hub.inject({ method: 'PUT', kind: 'dropAfter' });
    hub.inject({ method: 'GET', path: 'meta', kind: 'drop', skip: 1 });
    expect(await a.autoPush()).toBe('retry');
    const putsBefore = hub.puts().length;
    a.dispatch({ type: 'markDirty' });
    expect(await a.autoPush()).toBe('ok');
    expect(hub.puts().length).toBe(putsBefore); // 같은 본문이라 다시 쓰지 않았다
    expect(hub.versions).toHaveLength(1);
    expect(a.session.syncVersion).toBe(1);
    expect(readState(a.deps.storage).pending).toBeNull();
  });

  it('edits made after the lost write go out on top of it, not as a conflict', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    hub.inject({ method: 'PUT', kind: 'dropAfter' });
    hub.inject({ method: 'GET', path: 'meta', kind: 'drop', skip: 1 });
    await a.autoPush();
    a.play(3); // 응답을 잃은 사이에 더 고쳤다
    expect(await a.autoPush()).toBe('ok');
    expect(hub.versions.map(v => v.version)).toEqual([1, 2]);
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"1"');
    expect(a.status).toBe('idle');
    expect(a.session.syncVersion).toBe(2);
  });
});

describe('stops', () => {
  it('blocked: another Spotify account\'s session is never uploaded', async () => {
    const hub = new FakeHub();
    const a = new Device(hub, { session: { ...sessionWith(20, 10), ownerId: 'someone-else' } });
    await a.enable();
    expect(a.status).toBe('blocked');
    expect(await a.engine.push('manual')).toBe('skipped');
    expect(hub.log).toHaveLength(0);
    a.dispatch({ type: 'claimSession' });
    expect(a.session.ownerId).toBe('synthetic-user');
    await a.engine.check();
    expect(a.status).toBe('idle');
  });

  it('413 from the server: stops as "too large", keeps the local session, no retry until the owner asks', async () => {
    const hub = new FakeHub();
    hub.maxBytes = 1000;
    const a = deviceWith(hub);
    await a.enable();
    const local = a.session;
    expect(await a.autoPush()).toBe('too_large');
    expect(a.status).toBe('too_large');
    expect(a.session).toBe(local);
    expect(a.unsaved).toBeGreaterThan(0);
    expect(await a.autoPush()).toBe('skipped');
    expect(hub.puts()).toHaveLength(1);
    // "지금 동기화"는 다시 시도한다
    hub.maxBytes = 1_048_576;
    await a.engine.syncNow();
    expect(a.status).toBe('idle');
    expect(hub.versions).toHaveLength(1);
  });

  it('over 900 KiB: no request at all, and nothing is cut off or partly sent', async () => {
    const hub = new FakeHub();
    const big = sessionWith(3100, 50, 3);
    const a = new Device(hub, { session: big });
    await a.enable();
    hub.log.length = 0;
    a.dispatch({ type: 'markDirty' });
    expect(await a.autoPush()).toBe('too_large');
    expect(a.status).toBe('too_large');
    expect(a.engine.getSnapshot().detail).toContain('900 KiB');
    expect(hub.puts()).toHaveLength(0);
    expect(a.session.tracks).toHaveLength(3100);
    expect(SYNC_LIMIT_BYTES).toBe(921_600);
    // 줄이면 다시 된다 (다음 시도 때 다시 잰다)
    a.dispatch({ type: 'hydrate', session: sessionWith(30, 20, 3), origin: 'file' });
    a.dispatch({ type: 'markDirty' });
    expect(await a.autoPush()).toBe('ok');
    expect(a.status).toBe('idle');
  });

  it('network failure: local data untouched, "retry later", then recovers', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    await a.autoPush();
    a.play(2);
    const local = a.session;
    hub.inject({ method: 'PUT', kind: 'drop' });
    hub.inject({ method: 'GET', path: 'meta', kind: 'drop' });
    expect(await a.autoPush()).toBe('retry');
    expect(a.status).toBe('retry');
    expect(a.session).toBe(local);
    expect(a.unsaved).toBeGreaterThan(0);
    expect(a.engine.getSnapshot().detail).not.toMatch(/Bearer|network down/);
    expect(await a.autoPush()).toBe('ok');
    expect(a.status).toBe('idle');
  });

  it('a failing start check does not change the local session either', async () => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    const local = a.session;
    hub.inject({ method: 'GET', path: 'meta', kind: 'status', status: 502 });
    await a.enable();
    expect(a.status).toBe('retry');
    expect(a.session).toBe(local);
  });

  it.each([400, 415, 428])('%i is a client bug: stop with the status code, do not retry', async status => {
    const hub = new FakeHub();
    const a = deviceWith(hub);
    await a.enable();
    hub.inject({ method: 'PUT', kind: 'status', status });
    expect(await a.autoPush()).toBe('error');
    expect(a.status).toBe('error');
    const detail = a.engine.getSnapshot().detail!;
    expect(detail).toContain(String(status));
    expect(detail).not.toContain('injected'); // 응답 본문은 담지 않는다
    expect(await a.autoPush()).toBe('skipped');
    expect(hub.puts()).toHaveLength(1);
  });

  it('403 insufficient_scope on the sync path: "no permission", token kept', async () => {
    const hub = new FakeHub();
    hub.access = 'inbox-only';
    const a = deviceWith(hub);
    await a.enable();
    expect(a.status).toBe('forbidden');
    expect(a.engine.getSnapshot().detail).toContain('권한 없음');
    expect(a.engine.getSnapshot().connected).toBe(true);
    expect(await a.autoPush()).toBe('skipped');
    // 허용하고 다시 연결하면 풀린다
    hub.access = 'ok';
    await a.engine.notifyConnected();
    expect(a.status).toBe('idle');
  });

  it('any other 403: the connection is dropped and sync shows as off', async () => {
    const hub = new FakeHub();
    hub.access = 'revoked';
    const a = deviceWith(hub);
    await a.enable();
    expect(a.engine.getSnapshot().connected).toBe(false);
    expect(a.status).toBe('off');
  });

  it('does nothing without a Spotify login (the owner check needs it) or when switched off', async () => {
    const hub = new FakeHub();
    const a = new Device(hub, { session: sessionWith(10, 5), userId: null });
    await a.enable();
    expect(hub.log).toHaveLength(0);
    expect(a.engine.getSnapshot().detail).toContain('로그인');
    const b = deviceWith(hub);
    await b.engine.check();
    expect(await b.engine.push('manual')).toBe('skipped');
    expect(b.status).toBe('off');
    expect(hub.log).toHaveLength(0);
  });
});
