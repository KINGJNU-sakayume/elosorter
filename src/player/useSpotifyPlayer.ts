import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playOnDevice } from '../services/spotify/api';
import { auth } from '../services/spotify/auth';
import type { Player, PlayerStatus } from './context';
import type { SdkPlayer } from './spotify-sdk';

const IS_MOBILE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const SDK_TIMEOUT_MS = 15_000;

interface Internal {
  status: Exclude<PlayerStatus, 'off'>;
  reason: string | null;
  deviceId: string | null;
  isPlaying: boolean;
  currentUri: string | null;
}

const INITIAL: Internal = { status: 'loading', reason: null, deviceId: null, isPlaying: false, currentUri: null };

/**
 * Web Playback SDK 플레이어. 로그인 상태가 true가 되는 순간 초기화한다.
 * (v1은 앱 시작 시 한 번만 초기화해서, 로그인 직후에는 토큰이 없어 재생이 끝까지 막혔다.)
 */
export function useSpotifyPlayer(loggedIn: boolean, onError: (message: string) => void): Player {
  const [s, setS] = useState<Internal>(INITIAL);
  const sdk = useRef<SdkPlayer | null>(null);
  const device = useRef<string | null>(null);
  const currentUri = useRef<string | null>(null);
  const errorRef = useRef(onError);

  useEffect(() => {
    errorRef.current = onError;
    device.current = s.deviceId;
    currentUri.current = s.currentUri;
  });

  useEffect(() => {
    if (!loggedIn || IS_MOBILE) return;
    let cancelled = false;
    const fail = (reason: string) => {
      if (!cancelled) setS(prev => ({ ...prev, status: 'embed', reason, deviceId: null, isPlaying: false }));
    };

    const init = () => {
      if (cancelled || !window.Spotify || sdk.current) return;
      const player = new window.Spotify.Player({
        name: 'ELO Sorter',
        volume: 0.8,
        getOAuthToken: cb => { void auth.getToken().then(t => { if (t) cb(t); }); },
      });
      sdk.current = player;
      player.addListener('ready', ({ device_id }) => {
        if (!cancelled) setS(prev => ({ ...prev, status: 'ready', reason: null, deviceId: device_id }));
      });
      player.addListener('not_ready', () => {
        if (!cancelled) setS(prev => ({ ...prev, status: 'loading', deviceId: null }));
      });
      player.addListener('initialization_error', () => fail('이 브라우저에서는 Spotify 전곡 재생을 쓸 수 없어 미리듣기로 재생합니다'));
      player.addListener('authentication_error', () => fail('Spotify 인증이 만료됐습니다. 다시 로그인해 주세요'));
      player.addListener('account_error', () => fail('전곡 재생은 Spotify Premium 계정에서만 됩니다. 미리듣기로 재생합니다'));
      player.addListener('playback_error', e => console.warn('[player] playback_error', e.message));
      player.addListener('player_state_changed', state => {
        if (cancelled) return;
        setS(prev => ({
          ...prev,
          isPlaying: !!state && !state.paused,
          currentUri: state?.track_window?.current_track?.uri ?? prev.currentUri,
        }));
      });
      void player.connect().then(ok => { if (!ok) fail('Spotify 플레이어에 연결하지 못했습니다'); });
    };

    if (window.Spotify) init();
    else window.addEventListener('spotify-sdk-ready', init, { once: true });
    const timeout = setTimeout(() => {
      if (!window.Spotify) fail('Spotify 재생 SDK를 불러오지 못했습니다');
    }, SDK_TIMEOUT_MS);

    // 브라우저 자동 재생 정책: 첫 사용자 입력 때 SDK 오디오 요소를 활성화
    const activate = () => { void sdk.current?.activateElement?.(); };
    window.addEventListener('pointerdown', activate, { once: true });
    window.addEventListener('keydown', activate, { once: true });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener('spotify-sdk-ready', init);
      window.removeEventListener('pointerdown', activate);
      window.removeEventListener('keydown', activate);
      sdk.current?.disconnect();
      sdk.current = null;
    };
  }, [loggedIn]);

  const play = useCallback((uri: string) => {
    const deviceId = device.current;
    if (!deviceId) return;
    setS(prev => ({ ...prev, currentUri: uri, isPlaying: true }));
    playOnDevice(deviceId, uri).catch(e => {
      setS(prev => ({ ...prev, isPlaying: false }));
      errorRef.current(`재생하지 못했습니다 (${e instanceof Error ? e.message : String(e)})`);
    });
  }, []);

  const toggle = useCallback((uri: string) => {
    if (currentUri.current === uri) void sdk.current?.togglePlay();
    else play(uri);
  }, [play]);

  const pause = useCallback(() => { void sdk.current?.pause(); }, []);

  const status: PlayerStatus = !loggedIn ? 'off' : IS_MOBILE ? 'embed' : s.status;
  const reason = !loggedIn ? null : IS_MOBILE ? '모바일에서는 Spotify 미리듣기 플레이어로 재생합니다' : s.reason;
  const isPlaying = status === 'ready' && s.isPlaying;

  return useMemo(
    () => ({ status, reason, isPlaying, currentUri: s.currentUri, play, toggle, pause }),
    [status, reason, isPlaying, s.currentUri, play, toggle, pause],
  );
}
