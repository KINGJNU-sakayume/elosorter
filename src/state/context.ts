import { createContext, useContext, type Dispatch } from 'react';
import type { HubEngine, HubSnapshot, LoadCloudOutcome, PushOutcome } from '../services/lifehub/engine';
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
  | 'disconnected' // Life Hub 동기화는 켜져 있는데 연결이 끊겼다 (다시 연결하거나 동기화를 꺼야 한다)
  | 'off'      // 꺼짐 (미설정·로그아웃, 또는 Life Hub 동기화에 맡겨 Supabase 쓰기를 멈춤)
  | 'blocked'  // 다른 계정의 세션
  | 'conflict' // 클라우드에 이 세션과 다른 버전이 있음 (다른 기기에서 저장했거나 이전 세션)
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'forbidden' // Life Hub: 동기화 권한 없음
  | 'retry'     // Life Hub: 네트워크·서버 문제로 나중에 다시 시도
  | 'too_large'; // Life Hub: 동기화 문서가 너무 큼

/** Supabase 백업 (5단계에서 정리 예정): 읽기와 롤백 경로로 남아 있다 */
export interface SupabaseInfo {
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
  /** Life Hub 동기화가 켜져 있고 쓰기가 성공해서 Supabase에는 더 이상 쓰지 않는다 */
  writesStopped: boolean;
  saveNow: () => Promise<boolean>;
  refreshCloudSummary: () => Promise<void>;
}

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
}

export interface SaveInfo extends SupabaseInfo {
  hub: HubInfo;
  /** 사이드바 표시용: Life Hub 동기화가 켜져 있으면 그 상태, 아니면 Supabase 상태 */
  primary: { cloud: CloudStatus; unsaved: number; lastSaveAt: Date | null; saveNow: () => Promise<boolean> };
}

export const SaveContext = createContext<SaveInfo | null>(null);

export function useSave(): SaveInfo {
  const info = useContext(SaveContext);
  if (!info) throw new Error('useSave must be used inside <AppProvider>');
  return info;
}
