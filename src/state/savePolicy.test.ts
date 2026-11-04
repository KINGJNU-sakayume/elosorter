import { describe, expect, it } from 'vitest';
import { autoSaveDelay, IDLE_MS, RETRY_MS, SAVE_EVERY } from './savePolicy';

describe('autoSaveDelay (Life Hub auto upload)', () => {
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
