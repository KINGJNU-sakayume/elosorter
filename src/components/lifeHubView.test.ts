import { describe, expect, it } from 'vitest';
import type { HubStatus } from '../services/lifehub/engine';
import { lifeHubView } from './lifeHubView';

const now = new Date(2026, 10, 4, 18, 30).getTime();
const snap = (over: Partial<{ status: HubStatus; enabled: boolean; connected: boolean; lastSyncAt: number | null }> = {}) => ({
  status: 'idle' as HubStatus, enabled: true, connected: true, lastSyncAt: null, ...over,
});
const view = (s = snap(), loggedIn = true, unsaved = 0) => lifeHubView({ snap: s, loggedIn, unsaved, now });

describe('lifeHubView', () => {
  it('A: not connected', () => {
    expect(view(snap({ connected: false, enabled: false, status: 'off' }))).toEqual({ kind: 'A', line: 'Life Hub 연결 안 됨', dot: null });
  });

  it('connected but signed out of Spotify: not C, no dot', () => {
    for (const enabled of [true, false]) {
      expect(view(snap({ enabled, status: enabled ? 'idle' : 'off' }), false)).toEqual({ kind: 'B', line: '연결됨 · Spotify에 로그인하면 동기화됩니다', dot: null });
    }
  });

  it('B: last sync time, never synced, pending count', () => {
    expect(view().line).toBe('연결됨 · 아직 동기화 전');
    expect(view(snap({ lastSyncAt: new Date(2026, 10, 4, 9, 5).getTime() })).line).toBe('연결됨 · 오늘 09:05 동기화');
    expect(view(snap({ lastSyncAt: new Date(2026, 10, 1, 21, 0).getTime() }), true, 3)).toMatchObject({ kind: 'B', dot: 'ok', line: '연결됨 · 11월 1일 21:00 동기화 · 저장 대기 3' });
  });

  it('B: saving and retry are not "확인 필요"', () => {
    expect(view(snap({ status: 'saving' }))).toMatchObject({ kind: 'B', line: '연결됨 · 동기화 중…', dot: 'ok' });
    expect(view(snap({ status: 'retry' }))).toMatchObject({ kind: 'B', line: '연결됨 · 잠시 뒤 다시 시도', dot: 'ok' });
  });

  it('C: sync left on but the Life Hub connection is gone', () => {
    expect(view(snap({ connected: false, status: 'off' }))).toEqual({ kind: 'C', line: '확인 필요', dot: 'warn', cause: 'disconnected' });
  });

  it('C: conflict, other account, no permission, error, too large', () => {
    for (const status of ['conflict', 'blocked', 'forbidden', 'error', 'too_large'] as const) {
      expect(view(snap({ status }))).toEqual({ kind: 'C', line: '확인 필요', dot: 'warn', cause: status });
    }
  });
});
