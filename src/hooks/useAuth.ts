import { useCallback, useSyncExternalStore } from 'react';
import { auth } from '../services/spotify/auth';
import { useAppDispatch, useToast } from '../state/context';

/** 로그인 여부. 모든 컴포넌트가 같은 저장소를 구독하므로 한 곳에서 로그인해도 전부 갱신된다 */
export function useLoggedIn(): boolean {
  return useSyncExternalStore(auth.subscribe, auth.isLoggedIn, () => false);
}

/** 로그아웃: 토큰만 지우고 이 브라우저의 세션은 남긴다 */
export function useLogout(): () => void {
  const dispatch = useAppDispatch();
  const toast = useToast();
  return useCallback(() => {
    auth.logout();
    dispatch({ type: 'setUser', user: null });
    toast('로그아웃했습니다. 이 브라우저의 세션은 그대로 남아 있습니다');
  }, [dispatch, toast]);
}
