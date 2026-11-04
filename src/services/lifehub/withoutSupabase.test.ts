// Supabase 없이 "Life Hub 연결 + JSON 백업 파일"만으로 세션을 옮기고 이어서 쓰는지 확인한다 (P6 5단계의 안전망).
// 합성 데이터와 메모리 안 가짜 Life Hub만 쓴다. 전역 fetch는 막아 두어, 어떤 경로도 다른 서버(Supabase 등)에 요청하지 않음을 확인한다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeSession } from '../../core/session/schema';
import { syncContentKey } from '../../core/session/syncDoc';
import { readBackup } from '../download';
import { Device, FakeHub, join, sessionWith } from './testing';

/** exportBackup이 내려받게 하는 것과 같은 파일 */
const backupFile = (d: Device) =>
  new File([JSON.stringify({ ...serializeSession(d.session), savedAt: '2026-11-04T00:00:00.000Z' })], 'backup.json', { type: 'application/json' });

const globalFetch = vi.fn(async (input: RequestInfo | URL) => {
  throw new Error(`unexpected request outside Life Hub: ${String(input)}`);
});

beforeEach(() => { vi.stubGlobal('fetch', globalFetch); });
afterEach(() => {
  vi.unstubAllGlobals();
  globalFetch.mockClear();
});

describe('without Supabase: Life Hub + JSON backup file only', () => {
  it('moves a session to a new device with the JSON file, then shares it through Life Hub', async () => {
    const hub = new FakeHub();
    // 예전에 Supabase로 백업하던 기기: 동기화는 꺼 둔 채 이 기기에만 세션이 있다
    const old = new Device(hub, { session: sessionWith(30, 40, 1), connect: false });
    old.play(4);

    // 1) JSON 내보내기 → 새 기기에서 불러오기
    const fresh = new Device(hub, { seed: 3 });
    fresh.dispatch({ type: 'hydrate', session: await readBackup(backupFile(old)), origin: 'file' });
    expect(syncContentKey(fresh.session)).toBe(syncContentKey(old.session));
    expect(fresh.session.ownerId).toBe(old.session.ownerId);

    // 2) Life Hub 연결 + 동기화 켜기 → 올라간다
    await fresh.enable();
    expect(await fresh.autoPush()).toBe('ok');
    expect(hub.current?.version).toBe(1);

    // 3) 또 다른 기기가 합류하면 같은 세션으로 이어서 한다
    const other = await join(hub, { seed: 4 });
    expect(syncContentKey(other.session)).toBe(syncContentKey(old.session));
    expect(other.session.matches).toEqual(old.session.matches);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('turning sync off keeps working on this device only; turning it back on uploads what changed meanwhile', async () => {
    const hub = new FakeHub();
    const a = new Device(hub, { session: sessionWith(30, 20, 1) });
    await a.enable();
    expect(await a.autoPush()).toBe('ok');
    const versions = hub.versions.length;

    await a.engine.setEnabled(false);
    expect(a.status).toBe('off');
    a.play(3); // 꺼진 동안의 변경: 이 기기에만 남는다
    expect(a.unsaved).toBeGreaterThan(0);
    expect(await a.engine.push('auto')).toBe('skipped');
    expect(hub.versions).toHaveLength(versions);
    // 이 기기 사본은 그대로 백업 파일로 옮길 수 있다
    expect(syncContentKey(await readBackup(backupFile(a)))).toBe(syncContentKey(a.session));

    await a.engine.setEnabled(true);
    expect(await a.autoPush()).toBe('ok');
    expect(hub.versions).toHaveLength(versions + 1);
    expect(a.unsaved).toBe(0);
    const b = await join(hub, { seed: 5 });
    expect(syncContentKey(b.session)).toBe(syncContentKey(a.session));
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('logged out: the session keeps working locally and nothing is sent', async () => {
    const hub = new FakeHub();
    const a = new Device(hub, { session: sessionWith(20, 10, 1), userId: null });
    await a.enable();
    a.play(3);
    expect(a.unsaved).toBeGreaterThan(0);
    expect(await a.engine.push('auto')).toBe('skipped');
    expect(hub.puts()).toHaveLength(0);
    expect(a.engine.getSnapshot().detail).toMatch(/로그인/);
    expect(syncContentKey(await readBackup(backupFile(a)))).toBe(syncContentKey(a.session));
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
