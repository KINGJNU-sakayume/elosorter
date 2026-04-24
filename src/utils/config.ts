import type { Config, AppState } from './types';

const CFG_KEY = 'eloConfig';

export const AUTOSAVE_EVERY_N = 10;

export const NEW_TRACK_THRESHOLD = 8;

// 빌드 시 주입되는 기본값 (환경변수 또는 하드코딩)
// Vite는 VITE_ 접두사가 붙은 환경변수만 클라이언트에 노출합니다.
const DEFAULTS = {
  clientId:    import.meta.env.VITE_SPOTIFY_CLIENT_ID   ?? '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL        ?? '',
  anonKey:     import.meta.env.VITE_SUPABASE_ANON_KEY   ?? '',
};

// 매 렌더마다 localStorage.getItem + JSON.parse가 반복되지 않도록 캐시.
// saveConfig에서 null로 되돌려 다음 호출 시 재계산하게 한다.
let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
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
  cached = base;
  return cached;
}

export function saveConfig(cfg: Omit<Config, 'redirectUri'>): Config {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  cached = null; // 캐시 무효화: 다음 loadConfig에서 갱신된 값 반환
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

/**
 * AppState를 localStorage/Supabase에 저장 가능한 plain object로 변환.
 * Set은 JSON.stringify로 직렬화할 수 없으므로 배열로 변환.
 */
export function serializeState(state: AppState) {
  return {
    tracks: state.tracks,
    compCount: state.compCount,
    rsiDeltas: state.rsiDeltas,
    currentSource: state.currentSource,
    seenPairs: Array.from(state.seenPairs),
    lastPairKey: state.lastPairKey,
  };
}
