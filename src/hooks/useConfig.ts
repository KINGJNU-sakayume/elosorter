import { useSyncExternalStore } from 'react';
import { loadConfig, subscribeConfig, type Config } from '../services/config';

/** 설정 모달에서 값을 바꾸면 구독 중인 컴포넌트가 다시 그려진다 */
export function useConfig(): Config {
  return useSyncExternalStore(subscribeConfig, loadConfig);
}
