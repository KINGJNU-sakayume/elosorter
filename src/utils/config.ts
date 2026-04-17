import type { Config } from './types';

const CFG_KEY = 'eloConfig';

// 빌드 시 주입되는 기본값 (환경변수 또는 하드코딩)
// Vite는 VITE_ 접두사가 붙은 환경변수만 클라이언트에 노출합니다.
const DEFAULTS = {
  clientId:    import.meta.env.VITE_SPOTIFY_CLIENT_ID   ?? '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL        ?? '',
  anonKey:     import.meta.env.VITE_SUPABASE_ANON_KEY   ?? '',
};

export function loadConfig(): Config {
  const base: Config = {
    clientId: DEFAULTS.clientId,
    supabaseUrl: DEFAULTS.supabaseUrl,
    anonKey: DEFAULTS.anonKey,
    redirectUri: '',
  };
  const saved = localStorage.getItem(CFG_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 저장된 값이 비어있지 않을 때만 덮어쓰기 (기본값 유지)
      if (parsed.clientId)    base.clientId    = parsed.clientId;
      if (parsed.supabaseUrl) base.supabaseUrl = parsed.supabaseUrl;
      if (parsed.anonKey)     base.anonKey     = parsed.anonKey;
    } catch { /* ignore */ }
  }
  base.redirectUri = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  return base;
}

export function saveConfig(cfg: Omit<Config, 'redirectUri'>): Config {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  return loadConfig();
}

export function saveState(data: object) {
  try {
    localStorage.setItem('eloState', JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function loadState() {
  try {
    const raw = localStorage.getItem('eloState');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
