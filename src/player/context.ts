import { createContext, useContext } from 'react';

/**
 * off: 로그인 전 / loading: SDK·기기 준비 중 / ready: 전곡 재생 가능
 * embed: SDK를 쓸 수 없음(모바일, Premium 아님, 오류) → Spotify 임베드 플레이어로 대체
 */
export type PlayerStatus = 'off' | 'loading' | 'ready' | 'embed';

export interface Player {
  status: PlayerStatus;
  /** embed로 떨어진 이유 (사용자에게 보여줄 문장) */
  reason: string | null;
  isPlaying: boolean;
  currentUri: string | null;
  /** 재생을 요청했지만 아직 시작되지 않은 곡 (요청 중·재시도 대기 중) */
  pendingUri: string | null;
  /** 자동 재생을 기다리는 곡 (cue) */
  cuedUri: string | null;
  play: (uri: string) => void;
  /** uri가 지금 곡이면 재생/일시정지 전환, 아니면 그 곡 재생. 자동 재생 대기 중이면 바로 재생, 요청 중이면 취소 */
  toggle: (uri: string) => void;
  /** 재생·요청·자동 재생 대기를 모두 멈춘다 */
  pause: () => void;
  /**
   * 화면에 나타난 곡의 자동 재생. 잠시 머물러야 요청을 보내고, 앞 곡은 바로 멈춘다.
   * 돌려주는 함수로 대기를 취소한다 (useEffect 정리 함수로 그대로 쓰면 된다).
   */
  cue: (uri: string) => () => void;
}

const noop = () => {};

export const PlayerContext = createContext<Player>({
  status: 'off',
  reason: null,
  isPlaying: false,
  currentUri: null,
  pendingUri: null,
  cuedUri: null,
  play: noop,
  toggle: noop,
  pause: noop,
  cue: () => noop,
});

export const usePlayer = (): Player => useContext(PlayerContext);

/** 이 곡의 재생 상태 */
export type TrackPlayback = 'playing' | 'pending' | 'cued' | 'idle';

export function trackPlayback(player: Player, uri: string): TrackPlayback {
  if (player.pendingUri === uri) return 'pending';
  if (player.cuedUri === uri) return 'cued';
  return player.isPlaying && player.currentUri === uri ? 'playing' : 'idle';
}

export function statusText(player: Player, playback: TrackPlayback): string {
  switch (player.status) {
    case 'off': return '로그인하면 들을 수 있어요';
    case 'loading': return 'Spotify 플레이어 준비 중…';
    case 'embed': return player.reason ?? '미리듣기 플레이어';
    case 'ready':
      switch (playback) {
        case 'playing': return '재생 중';
        case 'pending': return '불러오는 중…';
        case 'cued': return '곧 재생';
        case 'idle': return '일시정지됨';
      }
  }
}
