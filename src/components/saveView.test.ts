import { describe, expect, it } from 'vitest';
import type { CloudStatus } from '../state/saveStatus';
import { saveView } from './saveView';

const ALL: CloudStatus[] = ['off', 'signed_out', 'disconnected', 'idle', 'saving', 'conflict', 'blocked', 'error', 'forbidden', 'retry', 'too_large'];
const view = (cloud: CloudStatus, unsaved = 0) => saveView({ cloud, unsaved, lastSaveAt: null, localError: false });

describe('saveView', () => {
  it('sync off: saved on this device, pointing at the backup file and Life Hub', () => {
    const v = view('off', 5);
    expect(v.label).toBe('이 기기에 저장됨');
    expect(v.title).toMatch(/백업 파일/);
    expect(v.title).toMatch(/Life Hub/);
    expect(v.action).toBeUndefined();
  });

  it('logged out with sync on: still saved on this device, sync waits for login', () => {
    const v = view('signed_out', 3);
    expect(v.label).toBe('이 기기에 저장됨');
    expect(v.title).toMatch(/로그인/);
    expect(v.action).toBeUndefined();
  });

  it('sync on: pending changes, then saved in Life Hub', () => {
    expect(view('idle', 4)).toMatchObject({ label: '저장 대기 4', action: 'save' });
    expect(view('idle', 0).label).toBe('Life Hub에 저장됨');
    expect(view('conflict').label).toBe('Life Hub 충돌');
  });

  it('never mentions Supabase or a generic "cloud" backup', () => {
    for (const c of ALL) {
      const v = view(c, 2);
      expect(`${v.label} ${v.title}`).not.toMatch(/supabase|클라우드/i);
    }
  });

  it('a local save failure wins over everything', () => {
    expect(saveView({ cloud: 'idle', unsaved: 0, lastSaveAt: null, localError: true }).label).toBe('로컬 저장 실패');
  });
});
