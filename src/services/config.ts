// 런타임 설정: 빌드 시 환경변수 → (있으면) 설정 모달에서 저장한 값으로 덮어쓰기.

export interface Config {
  clientId: string;
  redirectUri: string;
}

const KEY = 'eloConfig';

/** P6 5단계 전 버전이 eloConfig에 함께 저장하던 Supabase 설정. 읽지 않고, 남아 있으면 한 번 지운다 */
export const LEGACY_KEYS = ['supabaseUrl', 'anonKey'] as const;

// Vite는 VITE_ 접두사가 붙은 환경변수만 클라이언트에 노출한다.
const ENV = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
};

let cached: Config | null = null;
const listeners = new Set<() => void>();

function redirectUri(): string {
  return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
}

/**
 * 저장된 eloConfig 문자열을 읽는다. 지금 쓰는 값(clientId)과, 구형 키를 뺀 다시 쓸 값(없으면 null = 그대로 둬도 됨)을 돌려준다.
 * 손상된 값은 없는 것으로 본다.
 */
export function readSavedConfig(raw: string | null): { clientId: string; rewrite: string | null } {
  let saved: unknown;
  try { saved = JSON.parse(raw ?? 'null'); } catch { return { clientId: '', rewrite: null }; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { clientId: '', rewrite: null };
  const obj = saved as Record<string, unknown>;
  const clientId = typeof obj.clientId === 'string' ? obj.clientId : '';
  if (!LEGACY_KEYS.some(k => k in obj)) return { clientId, rewrite: null };
  const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => !(LEGACY_KEYS as readonly string[]).includes(k)));
  return { clientId, rewrite: JSON.stringify(rest) };
}

export function loadConfig(): Config {
  if (cached) return cached;
  const cfg: Config = { ...ENV, redirectUri: redirectUri() };
  try {
    const { clientId, rewrite } = readSavedConfig(localStorage.getItem(KEY));
    // 저장된 값이 비어 있으면 환경변수 값을 유지
    if (clientId) cfg.clientId = clientId;
    if (rewrite !== null) localStorage.setItem(KEY, rewrite);
  } catch { /* 저장소에 접근하지 못하면 환경변수 값만 쓴다 */ }
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

/** 테스트용: 캐시를 비운다 */
export function resetConfigCache(): void {
  cached = null;
}
