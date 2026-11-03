// 두 기기 시나리오: 메모리 안 가짜 Life Hub(version·412·sha256) 하나에 기기 둘이 붙는다.
// 기기마다 저장소(localStorage·sessionStorage), 리듀서, 엔진이 따로다. 실제 Life Hub·Supabase에는 요청하지 않는다.

import { describe, expect, it } from 'vitest';
import { parseSession, serializeSession, type SessionData } from '../../core/session/schema';
import { parseSyncDocument, syncContentKey } from '../../core/session/syncDoc';
import { supabaseWritesAllowed } from '../../state/savePolicy';
import { Device, FakeHub, join, sessionWith } from './testing';

const ratings = (s: SessionData) => s.tracks.map(t => [t.id, t.tier, t.rating, t.sigma, t.comparisons] as const);

/** 양쪽(과 서버의 현재 문서)이 같은 세션이다 */
function expectConverged(hub: FakeHub, a: Device, b: Device) {
  const server = parseSyncDocument(JSON.parse(hub.current!.body))!;
  expect(syncContentKey(a.session)).toBe(syncContentKey(b.session));
  expect(syncContentKey(a.session)).toBe(syncContentKey(server));
  expect(ratings(a.session)).toEqual(ratings(b.session));
  expect(ratings(a.session)).toEqual(ratings(server));
  expect(a.session.matches).toEqual(b.session.matches);
  expect(a.session.syncVersion).toBe(hub.current!.version);
  expect(b.session.syncVersion).toBe(hub.current!.version);
  expect(a.unsaved).toBe(0);
  expect(b.unsaved).toBe(0);
}

async function startedPair(bSeed = 2) {
  const hub = new FakeHub();
  const a = new Device(hub, { session: sessionWith(40, 60, 1), seed: 1 });
  await a.enable();
  await a.autoPush(); // v1
  const b = await join(hub, { seed: bSeed }); // B는 A의 문서로 시작한다
  expectConverged(hub, a, b);
  return { hub, a, b };
}

describe('two devices', () => {
  it('A saves, B continues from the cloud copy, edits flow both ways without any conflict', async () => {
    const { hub, a, b } = await startedPair();
    a.play(5);
    await a.autoPush(); // v2
    await b.engine.check();
    expect(b.engine.getSnapshot().remote).toMatchObject({ version: 2 }); // 자동으로 바꾸지 않고 알린다
    expect(await b.engine.loadCloud()).toBe('ok');
    expectConverged(hub, a, b);

    b.play(5);
    expect(await b.autoPush()).toBe('ok'); // v3, If-Match "2"
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"2"');
    await a.engine.check();
    await a.engine.loadCloud();
    expectConverged(hub, a, b);
    expect(b.status).toBe('idle');
    expect(a.status).toBe('idle');
  });

  it('A saves, B saves on an old base → 412 → conflict → "overwrite with this device" → both match', async () => {
    const { hub, a, b } = await startedPair();
    a.play(6);
    await a.autoPush(); // 서버 v2 (A)
    b.play(4); // B는 아직 v1 기반
    const putsBefore = hub.puts().length;

    expect(await b.autoPush()).toBe('conflict');
    expect(hub.puts()).toHaveLength(putsBefore + 1);
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"1"');
    expect(b.status).toBe('conflict');
    expect(hub.current!.version).toBe(2); // 서버는 그대로 (A의 것)
    // conflict에서는 자동 업로드가 없다
    b.play(2);
    expect(await b.autoPush()).toBe('skipped');
    expect(hub.puts()).toHaveLength(putsBefore + 1);

    expect(await b.engine.overwrite()).toBe('ok');
    expect(hub.puts().at(-1)!.headers['if-match']).toBe('"2"'); // 충돌이 보여준 version
    expect(hub.current!.version).toBe(3);
    expect(b.status).toBe('idle');

    // A는 보내지 않은 변경이 없으니 충돌이 아니라 "더 새로움" → 받아 쓰면 일치
    await a.engine.check();
    expect(a.status).toBe('idle');
    expect(a.engine.getSnapshot().remote).toMatchObject({ version: 3 });
    expect(await a.engine.loadCloud()).toBe('ok');
    expectConverged(hub, a, b);
  });

  it('A saves, B saves on an old base → conflict → "use the cloud copy" → both match, B\'s edits are kept as a backup', async () => {
    const { hub, a, b } = await startedPair();
    a.play(6);
    await a.autoPush(); // v2
    b.play(4);
    const mine = b.session;
    expect(await b.autoPush()).toBe('conflict');
    const putsBefore = hub.puts().length;

    expect(await b.engine.loadCloud()).toBe('ok');
    expect(hub.puts()).toHaveLength(putsBefore); // 받기만 했다
    expect(hub.current!.version).toBe(2);
    expectConverged(hub, a, b);
    expect(b.status).toBe('idle');
    // 바꾸기 전 B의 세션은 수동 백업 파일로 내려받을 수 있는 형태로 남았다
    expect(b.stashed).toHaveLength(1);
    const backup = parseSession(JSON.parse(JSON.stringify(serializeSession(b.stashed[0]))))!;
    expect(backup.matches).toEqual(mine.matches);
    expect(backup.matches.length).toBeGreaterThan(a.session.matches.length - 1 - 6 + 0);
    expect(syncContentKey(backup)).toBe(syncContentKey(mine));
  });

  it('a third write between the conflict and the overwrite is caught again (still no silent overwrite)', async () => {
    const { hub, a, b } = await startedPair();
    a.play(3);
    await a.autoPush(); // v2
    b.play(2);
    await b.autoPush(); // conflict (서버 v2)
    expect(b.engine.getSnapshot().conflict).toMatchObject({ version: 2 });

    a.play(2);
    await a.autoPush(); // v3: B가 충돌을 보고 있는 사이의 또 다른 쓰기
    const server = hub.current!.sha256;
    expect(await b.engine.overwrite()).toBe('conflict');
    expect(hub.current!.sha256).toBe(server); // 덮어쓰지 않았다
    expect(b.engine.getSnapshot().conflict).toMatchObject({ version: 3 });

    expect(await b.engine.overwrite()).toBe('ok');
    await a.engine.check();
    await a.engine.loadCloud();
    expectConverged(hub, a, b);
  });

  it('a restart in the middle of a conflict comes back as a conflict, not as an upload', async () => {
    const { hub, a, b } = await startedPair();
    a.play(3);
    await a.autoPush();
    b.play(2);
    b.restart(); // 보내지 않은 변경이 있는 채 앱을 닫았다 열었다
    const putsBefore = hub.puts().length;
    await b.engine.check();
    expect(b.status).toBe('conflict');
    expect(await b.autoPush()).toBe('skipped');
    expect(hub.puts()).toHaveLength(putsBefore);
  });

  it('two devices racing from the same base: exactly one wins, the other gets the conflict', async () => {
    const { hub, a, b } = await startedPair();
    a.play(2);
    b.play(3); // 다른 변경 (같은 변경이면 내용이 같아 충돌이 아니다)
    const [ra, rb] = await Promise.all([a.autoPush(), b.autoPush()]);
    expect([ra, rb].sort()).toEqual(['conflict', 'ok']);
    expect(hub.current!.version).toBe(2);
    const loser = ra === 'conflict' ? a : b;
    const winner = ra === 'conflict' ? b : a;
    expect(loser.status).toBe('conflict');
    expect(winner.status).toBe('idle');
    await loser.engine.loadCloud();
    expectConverged(hub, winner, loser);
  });

  it('two devices that made the very same change do not conflict: the second just takes the version', async () => {
    const { hub, a, b } = await startedPair(1); // 같은 시드 → 같은 쌍을 같은 점수로 고른다
    a.play(2);
    b.play(2);
    expect(await a.autoPush()).toBe('ok');
    expect(await b.autoPush()).toBe('ok');
    expect(hub.versions).toHaveLength(2); // 두 번째는 새 version을 만들지 않았다
    expectConverged(hub, a, b);
  });
});

describe('Supabase hand-over', () => {
  it('Supabase keeps being written until the first Life Hub write succeeds, stops after, and resumes when sync is turned off', async () => {
    const hub = new FakeHub();
    const a = new Device(hub, { session: sessionWith(30, 20, 1) });
    const writes = () => supabaseWritesAllowed(a.engine.getSnapshot());
    expect(writes()).toBe(true); // 아직 켜지 않음

    await a.enable();
    expect(a.engine.getSnapshot().enabled).toBe(true);
    expect(writes()).toBe(true); // 켰지만 아직 한 번도 성공하지 않았다

    // 실패만 하는 동안(너무 큼·권한 없음·네트워크)에는 계속 Supabase에 쓴다
    hub.inject({ method: 'PUT', kind: 'status', status: 400 });
    expect(await a.autoPush()).toBe('error');
    expect(writes()).toBe(true);
    hub.maxBytes = 100;
    await a.engine.syncNow();
    expect(a.status).toBe('too_large');
    expect(writes()).toBe(true);
    hub.maxBytes = 1_048_576;

    await a.engine.syncNow(); // 성공
    expect(a.engine.getSnapshot().everSucceeded).toBe(true);
    expect(writes()).toBe(false); // 그 뒤로 Supabase에 쓰지 않는다

    // 이후 오류가 나도 다시 쓰기 시작하지 않는다 (끄지 않는 한)
    a.play(1);
    hub.inject({ method: 'PUT', kind: 'drop' });
    hub.inject({ method: 'GET', path: 'meta', kind: 'drop' });
    await a.autoPush();
    expect(a.status).toBe('retry');
    expect(writes()).toBe(false);

    // 끄면 이전 동작(Supabase 백업)으로 돌아간다
    await a.engine.setEnabled(false);
    expect(a.status).toBe('off');
    expect(writes()).toBe(true);
    // 다시 켜면(이미 성공한 적이 있으므로) 곧바로 Supabase 쓰기가 멈춘다
    await a.engine.setEnabled(true);
    expect(writes()).toBe(false);
  });

  it('turning sync off leaves the local session, the manual JSON backup and the cloud document alone', async () => {
    const { hub, a } = await startedPair();
    const before = a.session;
    const versions = hub.versions.length;
    await a.engine.setEnabled(false);
    expect(a.session).toBe(before);
    expect(hub.versions).toHaveLength(versions);
    expect(JSON.parse(JSON.stringify(serializeSession(a.session))).tracks).toHaveLength(40); // 수동 백업은 그대로 된다
    a.play(3);
    expect(await a.engine.push('auto')).toBe('skipped'); // 꺼져 있으면 보내지 않는다
    expect(hub.versions).toHaveLength(versions);
  });
});
