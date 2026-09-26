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
  play: (uri: string) => void;
  /** uri가 지금 곡이면 재생/일시정지 전환, 아니면 그 곡 재생 */
  toggle: (uri: string) => void;
  pause: () => void;
}

const noop = () => {};

export const PlayerContext = createContext<Player>({
  status: 'off',
  reason: null,
  isPlaying: false,
  currentUri: null,
  play: noop,
  toggle: noop,
  pause: noop,
});

export const usePlayer = (): Player => useContext(PlayerContext);

export function statusText(player: Player, playing: boolean): string {
  switch (player.status) {
    case 'off': return '로그인하면 들을 수 있어요';
    case 'loading': return 'Spotify 플레이어 준비 중…';
    case 'embed': return player.reason ?? '미리듣기 플레이어';
    case 'ready': return playing ? '재생 중' : '일시정지됨';
  }
}
