// 사이드바·상단 바에 보이는 저장 상태 하나. 저장 위치는 둘뿐이다:
// 이 기기(localStorage, 항상)와 Life Hub(동기화를 켰을 때). 다른 기기로 옮기는 수동 경로는 JSON 백업 파일.

import type { HubSnapshot, HubStatus } from '../services/lifehub/engine';

export type CloudStatus =
  | HubStatus
  // 'off': 동기화 꺼짐 → 이 기기와 백업 파일에만 저장한다
  | 'signed_out'   // 동기화는 켜져 있지만 Spotify 로그아웃 상태 (세션 주인을 확인할 수 없어 보내지 않는다)
  | 'disconnected'; // 동기화는 켜져 있는데 Life Hub 연결이 끊겼다 (다시 연결하거나 동기화를 꺼야 한다)

export function primaryStatus(snap: Pick<HubSnapshot, 'enabled' | 'connected' | 'status'>, loggedIn: boolean): CloudStatus {
  if (!snap.enabled) return 'off';
  if (!snap.connected) return 'disconnected';
  if (!loggedIn) return 'signed_out';
  return snap.status;
}
