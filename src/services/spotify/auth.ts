// Spotify OAuth (PKCE) 토큰 저장소. React 밖의 단일 저장소라서
// 어느 컴포넌트/훅에서 쓰든 로그인 상태가 하나로 유지된다 (useSyncExternalStore로 구독).

import { loadConfig } from '../config';

const KEYS = {
  access: 'spotify_access_token',
  refresh: 'spotify_refresh_token',
  expires: 'spotify_token_expires',
} as const;
const PKCE_VERIFIER = 'pkce_verifier';
const PKCE_STATE = 'pkce_state';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  // Web Playback SDK 필수 스코프
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const listeners = new Set<() => void>();
let loggedIn = readLoggedIn();

function readLoggedIn(): boolean {
  try {
    return !!localStorage.getItem(KEYS.access);
  } catch {
    return false;
  }
}

function notify(): void {
  const next = readLoggedIn();
  if (next === loggedIn) return;
  loggedIn = next;
  listeners.forEach(l => l());
}

if (typeof window !== 'undefined') {
  // 다른 탭의 로그인/로그아웃 동기화
  window.addEventListener('storage', e => {
    if (e.key === null || e.key === KEYS.access) notify();
  });
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function storeTokens(data: TokenResponse, previousRefresh?: string): void {
  localStorage.setItem(KEYS.access, data.access_token);
  const refresh = data.refresh_token || previousRefresh;
  if (refresh) localStorage.setItem(KEYS.refresh, refresh);
  localStorage.setItem(KEYS.expires, String(Date.now() + data.expires_in * 1000));
  notify();
}

function logout(): void {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  notify();
}

async function login(): Promise<boolean> {
  const cfg = loadConfig();
  if (!cfg.clientId) return false;
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  // CSRF 방지용 state (PKCE와 별개)
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_VERIFIER, verifier);
  sessionStorage.setItem(PKCE_STATE, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    scope: SCOPES,
    redirect_uri: cfg.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  return true;
}

export type LoginResult = 'none' | 'success' | 'denied' | 'failed';

let completing: Promise<LoginResult> | null = null;

/**
 * 리다이렉트로 돌아온 URL(?code=... 또는 ?error=...)을 처리한다.
 * StrictMode에서 effect가 두 번 돌아도 토큰 교환은 한 번만 한다.
 */
function completeLogin(): Promise<LoginResult> {
  completing ??= (async (): Promise<LoginResult> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return 'none';

    const verifier = sessionStorage.getItem(PKCE_VERIFIER);
    const expectedState = sessionStorage.getItem(PKCE_STATE);
    sessionStorage.removeItem(PKCE_VERIFIER);
    sessionStorage.removeItem(PKCE_STATE);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    if (error) return 'denied';
    if (!code || !verifier || !expectedState || params.get('state') !== expectedState) return 'failed';
    try {
      const cfg = loadConfig();
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
          client_id: cfg.clientId,
          code_verifier: verifier,
        }),
      });
      if (!res.ok) return 'failed';
      storeTokens(await res.json());
      return 'success';
    } catch {
      return 'failed';
    }
  })();
  return completing;
}

let refreshing: Promise<string | null> | null = null;

async function refresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(KEYS.refresh);
  if (!refreshToken) {
    logout();
    return null;
  }
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: loadConfig().clientId,
      }),
    });
    if (!res.ok) {
      // 400/401 = 토큰이 폐기됨 → 로그아웃. 5xx 등 일시 오류는 로그인 유지
      if (res.status === 400 || res.status === 401) logout();
      return null;
    }
    const data: TokenResponse = await res.json();
    storeTokens(data, refreshToken);
    return data.access_token;
  } catch {
    return null; // 오프라인 등 — 로그아웃하지 않는다
  }
}

/**
 * 유효한 access token. 만료 1분 전부터 갱신하며, 동시에 여러 요청이 와도 갱신은 한 번만 한다
 * (Spotify는 갱신 때 refresh token을 바꿀 수 있어서 중복 갱신은 실패로 이어질 수 있다).
 */
async function getToken(): Promise<string | null> {
  const token = localStorage.getItem(KEYS.access);
  const expires = Number(localStorage.getItem(KEYS.expires) ?? 0);
  if (token && Date.now() < expires - 60_000) return token;
  if (!token && !localStorage.getItem(KEYS.refresh)) return null;
  refreshing ??= refresh().finally(() => { refreshing = null; });
  return refreshing;
}

/** API가 401을 돌려주면 만료로 간주해 다음 getToken에서 갱신하게 한다 */
function invalidate(): void {
  localStorage.setItem(KEYS.expires, '0');
}

export const auth = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isLoggedIn: (): boolean => loggedIn,
  login,
  logout,
  completeLogin,
  getToken,
  invalidate,
};
