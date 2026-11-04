import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, readSavedConfig, resetConfigCache, saveConfig } from './config';

// 합성 값만 쓴다 (실제 URL·키가 아니다)
const LEGACY = JSON.stringify({ clientId: 'client-abc', supabaseUrl: 'https://example.invalid', anonKey: 'not-a-real-key' });

describe('readSavedConfig', () => {
  it('drops the Supabase settings left by older versions and keeps the client id', () => {
    const { clientId, rewrite } = readSavedConfig(LEGACY);
    expect(clientId).toBe('client-abc');
    expect(JSON.parse(rewrite!)).toEqual({ clientId: 'client-abc' });
  });

  it('asks for no rewrite when nothing legacy is stored', () => {
    expect(readSavedConfig(JSON.stringify({ clientId: 'x' }))).toEqual({ clientId: 'x', rewrite: null });
    expect(readSavedConfig(null)).toEqual({ clientId: '', rewrite: null });
  });

  it('ignores damaged or odd values', () => {
    expect(readSavedConfig('{not json')).toEqual({ clientId: '', rewrite: null });
    expect(readSavedConfig('[1,2]')).toEqual({ clientId: '', rewrite: null });
    expect(readSavedConfig(JSON.stringify({ clientId: 5, supabaseUrl: '' }))).toEqual({ clientId: '', rewrite: '{"clientId":5}' });
  });
});

describe('loadConfig with an old localStorage', () => {
  let store: Map<string, string>;
  let writes: number;
  beforeEach(() => {
    store = new Map();
    writes = 0;
    vi.stubGlobal('window', { location: { origin: 'https://app.example', pathname: '/elosorter/index.html' } });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { writes++; store.set(k, v); },
      removeItem: (k: string) => void store.delete(k),
    });
    resetConfigCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetConfigCache();
  });

  it('loads without breaking, exposes no Supabase settings and removes them exactly once', () => {
    store.set('eloConfig', LEGACY);
    const cfg = loadConfig();
    expect(cfg).toEqual({ clientId: 'client-abc', redirectUri: 'https://app.example/elosorter/' });
    expect(JSON.parse(store.get('eloConfig')!)).toEqual({ clientId: 'client-abc' });
    expect(writes).toBe(1);
    resetConfigCache();
    loadConfig();
    expect(writes).toBe(1); // 이미 지웠으니 다시 쓰지 않는다
  });

  it('keeps working when localStorage refuses writes', () => {
    store.set('eloConfig', LEGACY);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {},
    });
    expect(loadConfig().clientId).toBe('client-abc');
  });

  it('saves only the client id', () => {
    saveConfig({ clientId: ' new ' .trim() });
    expect(JSON.parse(store.get('eloConfig')!)).toEqual({ clientId: 'new' });
  });
});
