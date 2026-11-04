import { describe, expect, it } from 'vitest';
import { fmtSyncTime } from './format';

describe('fmtSyncTime', () => {
  const now = new Date(2026, 10, 4, 18, 30).getTime();
  it('today → 오늘 HH:MM', () => {
    expect(fmtSyncTime(new Date(2026, 10, 4, 9, 5).getTime(), now)).toBe('오늘 09:05');
  });
  it('another day → M월 D일 HH:MM', () => {
    expect(fmtSyncTime(new Date(2026, 10, 3, 23, 59).getTime(), now)).toBe('11월 3일 23:59');
    expect(fmtSyncTime(new Date(2025, 0, 2, 0, 0).getTime(), now)).toBe('1월 2일 00:00');
  });
});
