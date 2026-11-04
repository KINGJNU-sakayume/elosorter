// 설정의 「Life Hub」 섹션·불러오기 화면 요약 줄·설정 진입점 점이 함께 쓰는 상태 계산 (화면과 떼어 테스트한다).
//  A: 연결 전 · B: 연결됨(평소) · C: 확인 필요

import type { HubSnapshot } from '../services/lifehub/engine';
import { fmtSyncTime } from '../lib/format';

/** 설정 모달의 Life Hub 섹션 id (불러오기 화면의 「설정」이 여기로 스크롤한다) */
export const LIFEHUB_SECTION_ID = 'settings-lifehub';

export type LifeHubKind = 'A' | 'B' | 'C';
export type LifeHubCause = 'disconnected' | 'forbidden' | 'conflict' | 'blocked' | 'error' | 'too_large';

export interface LifeHubView {
  kind: LifeHubKind;
  /** 상태 줄 문구 */
  line: string;
  /** 상태 줄 앞 점: 정상색 / 경고색 / 없음 */
  dot: 'ok' | 'warn' | null;
  /** C일 때 원인 */
  cause?: LifeHubCause;
}

export function lifeHubView({ snap, loggedIn, unsaved, now = Date.now() }: {
  snap: Pick<HubSnapshot, 'status' | 'enabled' | 'connected' | 'lastSyncAt'>;
  loggedIn: boolean;
  unsaved: number;
  now?: number;
}): LifeHubView {
  const warn = (cause: LifeHubCause): LifeHubView => ({ kind: 'C', line: '확인 필요', dot: 'warn', cause });
  if (!snap.connected) return snap.enabled ? warn('disconnected') : { kind: 'A', line: 'Life Hub 연결 안 됨', dot: null };
  if (!loggedIn) return { kind: 'B', line: '연결됨 · Spotify에 로그인하면 동기화됩니다', dot: null };
  switch (snap.status) {
    case 'conflict':
    case 'blocked':
    case 'forbidden':
    case 'error':
    case 'too_large':
      return warn(snap.status);
    case 'saving':
      return { kind: 'B', line: '연결됨 · 동기화 중…', dot: 'ok' };
    case 'retry':
      return { kind: 'B', line: '연결됨 · 잠시 뒤 다시 시도', dot: 'ok' };
    case 'idle':
    case 'off': {
      const base = snap.lastSyncAt ? `연결됨 · ${fmtSyncTime(snap.lastSyncAt, now)} 동기화` : '연결됨 · 아직 동기화 전';
      return { kind: 'B', line: unsaved > 0 ? `${base} · 저장 대기 ${unsaved}` : base, dot: 'ok' };
    }
  }
}
