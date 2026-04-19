import { useCallback, useEffect, useState } from 'react';
import { loadConfig } from '../utils/config';

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'user-read-private',
  'user-read-email',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const arr = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64url(arr.buffer as ArrayBuffer);
  const encoded = new TextEncoder().encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return { verifier, challenge: base64url(hashBuffer as ArrayBuffer) };
}

function storeTokens(data: Record<string, unknown>) {
  localStorage.setItem('spotify_access_token', data.access_token as string);
  localStorage.setItem('spotify_refresh_token', data.refresh_token as string);
  localStorage.setItem('spotify_token_expires', String(Date.now() + (data.expires_in as number) * 1000));
}

export function useSpotifyAuth() {
  // localStorage만 읽으면 React가 변화를 감지 못 하므로 상태로 관리
  const [authed, setAuthed] = useState<boolean>(
    () => !!localStorage.getItem('spotify_access_token')
  );

  // 다른 탭에서 로그인/로그아웃이 일어나면 이 탭도 동기화
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'spotify_access_token') {
        setAuthed(!!e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const isLoggedIn = useCallback((): boolean => authed, [authed]);

  const logout = useCallback(() => {
    ['spotify_access_token', 'spotify_refresh_token', 'spotify_token_expires'].forEach(k =>
      localStorage.removeItem(k)
    );
    setAuthed(false);
  }, []);

  const login = useCallback(async () => {
    const cfg = loadConfig();
    if (!cfg.clientId) {
      console.warn('[Spotify] Client ID가 설정되지 않았습니다.');
      return false;
    }
    const { verifier, challenge } = await generatePKCE();
    // CSRF 방어용 랜덤 state (PKCE와 별개)
    const state = base64url(
      crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer
    );
    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('pkce_state', state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      scope: SCOPES,
      redirect_uri: cfg.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params;
    return true;
  }, []);

  const handleCallback = useCallback(async (code: string): Promise<boolean> => {
    const cfg = loadConfig();
    const verifier = sessionStorage.getItem('pkce_verifier');
    const savedState = sessionStorage.getItem('pkce_state');
    const returnedState = new URLSearchParams(window.location.search).get('state');

    // 실패·성공 모두에서 과도기 상태(verifier/state/URL 쿼리) 정리
    const cleanup = () => {
      sessionStorage.removeItem('pkce_verifier');
      sessionStorage.removeItem('pkce_state');
      window.history.replaceState({}, '', window.location.pathname);
    };

    if (!verifier) {
      cleanup();
      return false;
    }
    // state 검증 — 불일치 시 CSRF 가능성으로 즉시 중단
    if (!savedState || !returnedState || savedState !== returnedState) {
      console.error('[Spotify] state 불일치 — 로그인 중단');
      cleanup();
      return false;
    }

    const res = await fetch('https://accounts.spotify.com/api/token', {
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
    if (!res.ok) {
      console.error('[Spotify] Token 교환 실패:', await res.text());
      cleanup();
      return false;
    }
    storeTokens(await res.json());
    cleanup();
    setAuthed(true);  // 🔑 React에게 로그인 성공을 알려 리렌더링 유발
    return true;
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const expires = parseInt(localStorage.getItem('spotify_token_expires') || '0', 10);
    if (Date.now() < expires - 60000) {
      return localStorage.getItem('spotify_access_token');
    }
    const cfg = loadConfig();
    const refresh = localStorage.getItem('spotify_refresh_token');
    if (!refresh) return null;
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: cfg.clientId,
      }),
    });
    if (!res.ok) { logout(); return null; }
    const data = await res.json();
    storeTokens({ ...data, refresh_token: data.refresh_token || refresh });
    return data.access_token;
  }, [logout]);

  return { isLoggedIn, login, handleCallback, getToken, logout };
}
