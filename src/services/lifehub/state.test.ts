import { describe, expect, it } from 'vitest';
import { defaultDeviceLabel, readState, sanitizeDeviceLabel, STATE_KEY, updateState } from './state';
import { memoryStorage } from './testing';

describe('device label (X-Device-Label)', () => {
  it('keeps printable ASCII, 1–40 characters; otherwise null so the header is left out', () => {
    expect(sanitizeDeviceLabel('My phone')).toBe('My phone');
    expect(sanitizeDeviceLabel('  padded  ')).toBe('padded');
    expect(sanitizeDeviceLabel('')).toBeNull();
    expect(sanitizeDeviceLabel('   ')).toBeNull();
    expect(sanitizeDeviceLabel(null)).toBeNull();
    expect(sanitizeDeviceLabel('내 폰')).toBeNull();
    expect(sanitizeDeviceLabel('폰 Pixel 9')).toBe('Pixel 9');
    expect(sanitizeDeviceLabel('line\nbreak\ttab')).toBe('linebreaktab');
    expect(sanitizeDeviceLabel('x'.repeat(100))).toHaveLength(40);
    expect(sanitizeDeviceLabel('a'.repeat(39) + ' b')).toBe('a'.repeat(39)); // 자른 뒤 끝 공백은 지운다
  });

  it('derives a default name from the user agent', () => {
    expect(defaultDeviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/130 Mobile Safari/537')).toBe('Chrome on Android');
    expect(defaultDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Safari/604')).toBe('Safari on iPhone');
    expect(defaultDeviceLabel('')).toBe('Browser');
  });
});

describe('persisted sync state', () => {
  it('survives garbage and unknown shapes', () => {
    const storage = memoryStorage();
    expect(readState(storage).enabled).toBe(false);
    storage.setItem(STATE_KEY, '{not json');
    expect(readState(storage).enabled).toBe(false);
    storage.setItem(STATE_KEY, JSON.stringify({ enabled: 'yes', lastSyncAt: 'x', pending: { sha256: 1 }, syncedKey: 5 }));
    expect(readState(storage)).toMatchObject({ enabled: false, lastSyncAt: null, pending: null, syncedKey: null });
  });

  it('never stores session content, tokens or response bodies', () => {
    const storage = memoryStorage();
    updateState(storage, { enabled: true, syncedKey: 'a'.repeat(64), deviceLabel: 'Pixel' });
    expect(Object.keys(JSON.parse(storage.getItem(STATE_KEY)!)).sort()).toEqual(
      ['deviceLabel', 'enabled', 'everSucceeded', 'lastSyncAt', 'pending', 'syncedKey'],
    );
  });

  it('keeps a stored record from before Supabase was retired (everSucceeded) and reads it back unchanged', () => {
    const storage = memoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ enabled: false, everSucceeded: true, lastSyncAt: 5, syncedKey: 'k', deviceLabel: null, pending: null }));
    const s = readState(storage);
    expect(s.enabled).toBe(false);
    expect(s.everSucceeded).toBe(true);
    expect(updateState(storage, { enabled: true }).everSucceeded).toBe(true);
  });
});
