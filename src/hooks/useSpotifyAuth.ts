import { useCallback } from 'react';
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
  const isLoggedIn = useCallback((): boolean => {
    return !!localStorage.getItem('spotify_access_token');
  }, []);

  const login = useCallback(async () => {
    const cfg = loadConfig();
    if (!cfg.clientId) return false;
    const { verifier, challenge } = await generatePKCE();
    sessionStorage.setItem('pkce_verifier', verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      scope: SCOPES,
      redirect_uri: cfg.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params;
    return true;
  }, []);

  const handleCallback = useCallback(async (code: string): Promise<boolean> => {
    const cfg = loadConfig();
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) return false;
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
    if (!res.ok) return false;
    storeTokens(await res.json());
    sessionStorage.removeItem('pkce_verifier');
    window.history.replaceState({}, '', window.location.pathname);
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
  }, []);

  const logout = useCallback(() => {
    ['spotify_access_token', 'spotify_refresh_token', 'spotify_token_expires'].forEach(k =>
      localStorage.removeItem(k)
    );
  }, []);

  return { isLoggedIn, login, handleCallback, getToken, logout };
}
