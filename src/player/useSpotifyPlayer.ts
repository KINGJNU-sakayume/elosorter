import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../lib/format';
import { playOnDevice, playRetryDelay } from '../services/spotify/api';
import { auth } from '../services/spotify/auth';
import type { Player, PlayerStatus } from './context';
import { createPlayQueue, type PlayQueue } from './playQueue';
import type { SdkPlayer } from './spotify-sdk';

const IS_MOBILE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const SDK_TIMEOUT_MS = 15_000;

/**
 * 곡이 화면에 나타난 뒤 이만큼 머물러야 자동 재생을 요청한다.
 * 빠르게 넘기는 동안에는 요청을 아예 보내지 않아 Spotify 요청 제한(429)에 걸리지 않는다.
 */
export const AUTOPLAY_DELAY_MS = 1000;

interface Internal {
  status: Exclude<PlayerStatus, 'off'>;
  reason: string | null;
  deviceId: string | null;
  isPlaying: boolean;
  currentUri: string | null;
  pendingUri: string | null;
  cuedUri: string | null;
}

const INITIAL: Internal = {
  status: 'loading', reason: null, deviceId: null, isPlaying: false, currentUri: null, pendingUri: null, cuedUri: null,
};

/** SDK 조작은 기기가 없거나 곡이 없으면 거부될 수 있다 — 결과를 기다리지 않으므로 오류도 삼킨다 */
function quiet(promise: Promise<void> | undefined): void {
  promise?.catch(() => {});
}

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
  const cued = useRef<{ uri: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    errorRef.current = onError;
    device.current = s.deviceId;
    currentUri.current = s.currentUri;
  });

  // 재생 요청은 한 번에 하나만, 항상 마지막에 원한 곡으로 (playQueue.ts). 처음 쓸 때 만든다
  const queueRef = useRef<PlayQueue | null>(null);
  const queue = useCallback((): PlayQueue => queueRef.current ??= createPlayQueue({
    send: uri => {
      const deviceId = device.current;
      return deviceId ? playOnDevice(deviceId, uri) : Promise.reject(new Error('플레이어가 준비되지 않았습니다'));
    },
    pause: () => quiet(sdk.current?.pause()),
    retryDelay: playRetryDelay,
    onStart: uri => setS(prev => ({
      ...prev,
      pendingUri: prev.pendingUri === uri ? null : prev.pendingUri,
      currentUri: uri,
      isPlaying: true,
    })),
    onError: (uri, e) => {
      setS(prev => ({ ...prev, pendingUri: prev.pendingUri === uri ? null : prev.pendingUri, isPlaying: false }));
      errorRef.current(`재생하지 못했습니다 (${errorMessage(e)})`);
    },
  }), []);

  useEffect(() => {
    if (!loggedIn || IS_MOBILE) return;
    let cancelled = false;
    const fail = (reason: string) => {
      if (!cancelled) setS(prev => ({ ...prev, status: 'embed', reason, deviceId: null, isPlaying: false, pendingUri: null, cuedUri: null }));
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
        const track = state?.track_window?.current_track;
        // 지역별로 다른 곡 ID로 바꿔 재생(relinking)하면 요청한 URI는 linked_from에 남는다
        const uri = track?.linked_from?.uri || track?.uri || null;
        const playing = !!state && !state.paused;
        setS(prev => ({
          ...prev,
          isPlaying: playing,
          currentUri: uri ?? prev.currentUri,
          pendingUri: playing && uri === prev.pendingUri ? null : prev.pendingUri,
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
    const activate = () => { quiet(sdk.current?.activateElement?.()); };
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

  const clearCue = useCallback(() => {
    if (!cued.current) return;
    clearTimeout(cued.current.timer);
    cued.current = null;
  }, []);

  const play = useCallback((uri: string) => {
    clearCue();
    if (!device.current) return;
    setS(prev => ({ ...prev, pendingUri: uri, cuedUri: null }));
    queue().play(uri);
  }, [queue, clearCue]);

  const pause = useCallback(() => {
    clearCue();
    setS(prev => (prev.pendingUri || prev.cuedUri ? { ...prev, pendingUri: null, cuedUri: null } : prev));
    queue().stop();
  }, [queue, clearCue]);

  const cue = useCallback((uri: string) => {
    // 이미 이 곡을 재생 중이거나 요청 중 (재생 중에 기기가 잠깐 끊겼다 붙은 경우 등)
    if (queue().wanted === uri || cued.current?.uri === uri) return () => {};
    // 앞 곡은 바로 멈춘다 — 화면의 곡과 들리는 곡이 어긋나지 않게
    pause();
    const timer = setTimeout(() => play(uri), AUTOPLAY_DELAY_MS);
    cued.current = { uri, timer };
    setS(prev => ({ ...prev, cuedUri: uri }));
    return () => {
      if (cued.current?.timer !== timer) return; // 이미 재생을 요청했거나 다른 곡으로 바뀜
      clearCue();
      setS(prev => (prev.cuedUri === uri ? { ...prev, cuedUri: null } : prev));
    };
  }, [queue, pause, play, clearCue]);

  const toggle = useCallback((uri: string) => {
    if (cued.current?.uri === uri) play(uri);
    else if (queue().busy && queue().wanted === uri) pause();
    else if (currentUri.current === uri) quiet(sdk.current?.togglePlay());
    else play(uri);
  }, [queue, play, pause]);

  const status: PlayerStatus = !loggedIn ? 'off' : IS_MOBILE ? 'embed' : s.status;
  const reason = !loggedIn ? null : IS_MOBILE ? '모바일에서는 Spotify 미리듣기 플레이어로 재생합니다' : s.reason;
  const ready = status === 'ready';
  const isPlaying = ready && s.isPlaying;
  const pendingUri = ready ? s.pendingUri : null;
  const cuedUri = ready ? s.cuedUri : null;

  return useMemo(
    () => ({ status, reason, isPlaying, currentUri: s.currentUri, pendingUri, cuedUri, play, toggle, pause, cue }),
    [status, reason, isPlaying, s.currentUri, pendingUri, cuedUri, play, toggle, pause, cue],
  );
}
