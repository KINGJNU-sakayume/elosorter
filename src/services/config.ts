// 런타임 설정: 빌드 시 환경변수 → (있으면) 설정 모달에서 저장한 값으로 덮어쓰기.

export interface Config {
  clientId: string;
  supabaseUrl: string;
  anonKey: string;
  redirectUri: string;
}

const KEY = 'eloConfig';

// Vite는 VITE_ 접두사가 붙은 환경변수만 클라이언트에 노출한다.
const ENV = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
};

let cached: Config | null = null;
const listeners = new Set<() => void>();

function redirectUri(): string {
  return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
}

export function loadConfig(): Config {
  if (cached) return cached;
  const cfg: Config = { ...ENV, redirectUri: redirectUri() };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // 저장된 값이 비어 있으면 환경변수 값을 유지
    if (saved?.clientId) cfg.clientId = saved.clientId;
    if (saved?.supabaseUrl) cfg.supabaseUrl = saved.supabaseUrl;
    if (saved?.anonKey) cfg.anonKey = saved.anonKey;
  } catch { /* 손상된 값은 무시 */ }
  cached = cfg;
  return cfg;
}

export function saveConfig(values: Omit<Config, 'redirectUri'>): Config {
  localStorage.setItem(KEY, JSON.stringify(values));
  cached = null;
  const cfg = loadConfig();
  listeners.forEach(l => l());
  return cfg;
}

/** useSyncExternalStore용 구독 */
export function subscribeConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isCloudConfigured = (cfg: Config): boolean => !!(cfg.supabaseUrl && cfg.anonKey);
