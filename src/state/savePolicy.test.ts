import { describe, expect, it } from 'vitest';
import { autoSaveDelay, IDLE_MS, RETRY_MS, SAVE_EVERY, supabaseWritesAllowed } from './savePolicy';

describe('autoSaveDelay (the existing save policy, now shared with Life Hub)', () => {
  it('saves right away after SAVE_EVERY changes, else after the idle time', () => {
    expect(SAVE_EVERY).toBe(10);
    expect(IDLE_MS).toBe(15_000);
    expect(RETRY_MS).toBe(30_000);
    expect(autoSaveDelay({ canSave: true, unsaved: 1, failed: false })).toBe(15_000);
    expect(autoSaveDelay({ canSave: true, unsaved: 9, failed: false })).toBe(15_000);
    expect(autoSaveDelay({ canSave: true, unsaved: 10, failed: false })).toBe(0);
  });

  it('retries after the retry interval when the last attempt failed', () => {
    expect(autoSaveDelay({ canSave: true, unsaved: 3, failed: true })).toBe(30_000);
    expect(autoSaveDelay({ canSave: true, unsaved: 30, failed: true })).toBe(30_000);
  });

  it('does nothing when it cannot save or has nothing to save', () => {
    expect(autoSaveDelay({ canSave: false, unsaved: 12, failed: false })).toBeNull();
    expect(autoSaveDelay({ canSave: true, unsaved: 0, failed: false })).toBeNull();
  });
});

describe('supabaseWritesAllowed', () => {
  it('stops only when Life Hub sync is on AND has succeeded at least once', () => {
    expect(supabaseWritesAllowed({ enabled: false, everSucceeded: false })).toBe(true);
    expect(supabaseWritesAllowed({ enabled: true, everSucceeded: false })).toBe(true);
    expect(supabaseWritesAllowed({ enabled: true, everSucceeded: true })).toBe(false);
    expect(supabaseWritesAllowed({ enabled: false, everSucceeded: true })).toBe(true); // 끄면 롤백
  });
});
