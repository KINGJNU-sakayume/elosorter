import { createContext, useContext, type Dispatch } from 'react';
import type { CloudSummary } from '../services/storage/cloud';
import type { Action, AppState } from './reducer';

export const AppStateContext = createContext<AppState | null>(null);
export const AppDispatchContext = createContext<Dispatch<Action> | null>(null);

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used inside <AppProvider>');
  return state;
}

export function useAppDispatch(): Dispatch<Action> {
  const dispatch = useContext(AppDispatchContext);
  if (!dispatch) throw new Error('useAppDispatch must be used inside <AppProvider>');
  return dispatch;
}

// ── 토스트 ──────────────────────────────────────────────────────────────

export type ToastTone = 'info' | 'success' | 'error';
export type ShowToast = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<ShowToast>(() => {});
export const useToast = (): ShowToast => useContext(ToastContext);

// ── 저장 상태 ───────────────────────────────────────────────────────────

export type CloudStatus =
  | 'off'      // Supabase 미설정 또는 로그아웃
  | 'blocked'  // 다른 계정의 세션
  | 'conflict' // 클라우드에 이 세션과 다른 버전이 있음 (다른 기기에서 저장했거나 이전 세션)
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error';

export interface SaveInfo {
  cloud: CloudStatus;
  /** 클라우드에 아직 올라가지 않은 변경 수 */
  unsaved: number;
  lastCloudSaveAt: Date | null;
  /** 마지막 로컬 저장 시각 (ISO) */
  localSavedAt: string | null;
  /** localStorage 저장 실패 (용량 초과 등) */
  localError: boolean;
  /** 로그인 후 확인한 클라우드 세션 요약. undefined = 확인 전, null = 없음 */
  cloudSummary: CloudSummary | null | undefined;
  saveNow: () => Promise<boolean>;
  refreshCloudSummary: () => Promise<void>;
}

export const SaveContext = createContext<SaveInfo | null>(null);

export function useSave(): SaveInfo {
  const info = useContext(SaveContext);
  if (!info) throw new Error('useSave must be used inside <AppProvider>');
  return info;
}
