import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerState } from '../utils/types';

declare global {
  interface Window {
    Spotify: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (t: string) => void) => void;
        volume: number;
      }) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
    __spotifySdkReady?: boolean;
  }
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  addListener: (event: string, cb: (data: unknown) => void) => void;
}

export function useSpotifyPlayer(getToken: () => Promise<string | null>) {
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // getToken 참조가 외부에서 재생성되어도 stale closure를 피하기 위해 ref로 래핑
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const [ps, setPs] = useState<PlayerState>({
    ready: false,
    deviceId: null,
    isPlaying: false,
    currentUri: null,
    isMobile,
    sdkFailed: isMobile,
  });

  useEffect(() => {
    if (isMobile) return;

    const init = async () => {
      const token = await getTokenRef.current();
      if (!token) { setPs(s => ({ ...s, sdkFailed: true })); return; }
      if (!window.Spotify) { setPs(s => ({ ...s, sdkFailed: true })); return; }

      const player = new window.Spotify.Player({
        name: 'ELO Sorter',
        getOAuthToken: async (cb) => { const t = await getTokenRef.current(); if (t) cb(t); },
        volume: 0.8,
      });

      player.addListener('ready', (data) => {
        const { device_id } = data as { device_id: string };
        setPs(s => ({ ...s, ready: true, deviceId: device_id }));
      });
      player.addListener('not_ready', () => setPs(s => ({ ...s, ready: false, deviceId: null })));
      player.addListener('initialization_error', () => setPs(s => ({ ...s, sdkFailed: true })));
      player.addListener('authentication_error', () => setPs(s => ({ ...s, sdkFailed: true })));
      player.addListener('account_error', (data) => {
        console.error('[SpotifyPlayer] account_error (Premium 필요?):', data);
        setPs(s => ({ ...s, sdkFailed: true }));
      });
      player.addListener('playback_error', (data) => {
        console.error('[SpotifyPlayer] playback_error:', data);
        // DRM 실패, 라이선스 만료 등이 여기로 들어옴
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const st = state as { paused: boolean; track_window: { current_track: { uri: string } } };
        setPs(s => ({ ...s, isPlaying: !st.paused, currentUri: st.track_window?.current_track?.uri ?? null }));
      });

      await player.connect();
      playerRef.current = player;
    };

    // SDK 로드 상태에 따라 즉시 init 하거나 이벤트를 기다림
    // (index.html에서 onSpotifyWebPlaybackSDKReady가 spotify-sdk-ready 이벤트를 디스패치하도록 선점돼 있음)
    if (window.Spotify) {
      init();
    } else {
      window.addEventListener('spotify-sdk-ready', init, { once: true });
    }

    return () => {
      window.removeEventListener('spotify-sdk-ready', init);
      playerRef.current?.disconnect();
    };
  }, []);

  const play = useCallback(async (uri: string) => {
  if (!ps.deviceId) { console.warn('[play] deviceId 없음 — SDK 아직 준비 안 됨'); return; }
  const token = await getTokenRef.current();
  if (!token) return;
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${ps.deviceId}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (!res.ok) {
    console.error('[play] 실패', res.status, await res.text());
  }
}, [ps.deviceId]);

  const pause = useCallback(() => playerRef.current?.pause(), []);
  const resume = useCallback(() => playerRef.current?.resume(), []);
  const toggle = useCallback(() => {
    if (ps.isPlaying) pause(); else resume();
  }, [ps.isPlaying, pause, resume]);

  return { ...ps, play, pause, resume, toggle };
}
