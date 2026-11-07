import { createContext, useContext, type Dispatch } from 'react';
import type { HubEngine, HubSnapshot, LoadCloudOutcome, PushOutcome } from '../services/lifehub/engine';
import type { Action, AppState } from './reducer';
import type { CloudStatus } from './saveStatus';

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

export type { CloudStatus } from './saveStatus';

/** Life Hub 동기화: 엔진 상태와 화면에서 부르는 동작 */
export interface HubInfo {
  snapshot: HubSnapshot;
  engine: HubEngine;
  /** 지금 주소에서 연결을 시작할 수 있는가 (배포 주소에서만) */
  connectAvailable: boolean;
  /** Life Hub에 아직 올라가지 않은 변경 수 */
  unsaved: number;
  lastSaveAt: Date | null;
  connect: () => Promise<void>;
  /** 연결을 끊고 동기화도 끈다 */
  disconnect: () => void;
  /** 충돌·"클라우드가 더 새로움"에서 서버 문서를 받아 쓴다 (바꾸기 전 로컬 세션은 따로 남긴다) */
  loadCloud: () => Promise<LoadCloudOutcome>;
  overwrite: () => Promise<PushOutcome>;
  syncNow: () => Promise<void>;
  /** 보드 업로드가 권한 부족(insufficient_scope)으로 멈췄다: 다시 연결하면 풀린다. 동기화는 그대로 */
  boardNeedsReconnect: boolean;
}

export interface SaveInfo {
  hub: HubInfo;
  /** 마지막 로컬 저장 시각 (ISO) */
  localSavedAt: string | null;
  /** localStorage 저장 실패 (용량 초과 등) */
  localError: boolean;
  /** 사이드바 표시용: Life Hub 동기화 상태 (꺼져 있으면 'off' = 이 기기와 백업 파일만) */
  primary: { cloud: CloudStatus; unsaved: number; lastSaveAt: Date | null; saveNow: () => Promise<boolean> };
}

export const SaveContext = createContext<SaveInfo | null>(null);

export function useSave(): SaveInfo {
  const info = useContext(SaveContext);
  if (!info) throw new Error('useSave must be used inside <AppProvider>');
  return info;
}
