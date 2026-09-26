import { useSyncExternalStore } from 'react';
import { auth } from '../services/spotify/auth';

/** 로그인 여부. 모든 컴포넌트가 같은 저장소를 구독하므로 한 곳에서 로그인해도 전부 갱신된다 */
export function useLoggedIn(): boolean {
  return useSyncExternalStore(auth.subscribe, auth.isLoggedIn, () => false);
}
