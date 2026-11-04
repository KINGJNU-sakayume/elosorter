// SaveIndicator가 보여 줄 문구·아이콘 고르기 (화면과 떼어 테스트한다).

import { Check, Cloud, CloudOff, HardDrive, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CloudStatus } from '../state/saveStatus';

export interface SaveView {
  icon: LucideIcon;
  label: string;
  title: string;
  tone: string;
  spin?: boolean;
  action?: 'save' | 'import';
}

const LOCAL_ONLY = '이 브라우저(localStorage)에 자동 저장됩니다. 다른 기기로 옮기려면 백업 파일을 내려받거나, 설정에서 Life Hub에 연결하세요.';

export function saveView({ cloud, unsaved, lastSaveAt, localError }: {
  cloud: CloudStatus;
  unsaved: number;
  lastSaveAt: Date | null;
  localError: boolean;
}): SaveView {
  if (localError) return { icon: TriangleAlert, label: '로컬 저장 실패', title: '브라우저 저장 공간이 부족합니다. 백업 파일을 내려받아 두세요.', tone: 'text-danger' };
  switch (cloud) {
    case 'off':
      return { icon: HardDrive, label: '이 기기에 저장됨', title: LOCAL_ONLY, tone: 'text-fg-2' };
    case 'signed_out':
      return { icon: HardDrive, label: '이 기기에 저장됨', title: '로그아웃 상태라 Life Hub 동기화를 멈췄습니다. 이 기기에는 계속 저장되고, Spotify에 로그인하면 이어서 동기화합니다.', tone: 'text-fg-2' };
    case 'disconnected':
      return { icon: CloudOff, label: 'Life Hub 연결 필요', title: 'Life Hub 연결이 끊겼습니다. 이 기기에는 계속 저장됩니다. 설정에서 다시 연결하세요.', tone: 'text-warn' };
    case 'blocked':
      return { icon: CloudOff, label: '다른 계정 세션', title: '다른 Spotify 계정으로 만든 세션이라 Life Hub 저장을 멈췄습니다.', tone: 'text-warn', action: 'import' };
    case 'conflict':
      return { icon: TriangleAlert, label: 'Life Hub 충돌', title: 'Life Hub에 이 세션과 다른 버전이 있어 자동 저장을 멈췄습니다. 불러오기 화면에서 어느 쪽을 쓸지 고르세요.', tone: 'text-warn', action: 'import' };
    case 'forbidden':
      return { icon: CloudOff, label: '동기화 권한 없음', title: 'Life Hub 연결에 동기화 권한이 없습니다. 설정에서 다시 연결하세요.', tone: 'text-warn' };
    case 'too_large':
      return { icon: TriangleAlert, label: '동기화 문서 너무 큼', title: '동기화 문서가 한도를 넘어 자동 동기화를 멈췄습니다. 설정에서 크기를 확인하세요. 로컬 저장과 백업 파일은 그대로 됩니다.', tone: 'text-warn' };
    case 'saving':
      return { icon: LoaderCircle, label: '저장 중…', title: 'Life Hub에 저장하는 중', tone: 'text-fg-2', spin: true };
    case 'retry':
      return { icon: Cloud, label: '나중에 재시도', title: '네트워크나 서버 문제로 Life Hub에 저장하지 못했습니다. 이 기기의 세션은 그대로이고 잠시 뒤 다시 시도합니다. 눌러서 지금 시도합니다.', tone: 'text-warn', action: 'save' };
    case 'error':
      return { icon: TriangleAlert, label: '저장 실패 · 다시 시도', title: 'Life Hub 저장에 실패했습니다. 눌러서 다시 시도하세요.', tone: 'text-danger', action: 'save' };
    case 'idle':
      return unsaved > 0
        ? { icon: Cloud, label: `저장 대기 ${unsaved}`, title: '누르면 지금 Life Hub에 저장합니다 (자동 저장 대기 중)', tone: 'text-warn', action: 'save' }
        : { icon: Check, label: 'Life Hub에 저장됨', title: lastSaveAt ? `Life Hub 저장: ${lastSaveAt.toLocaleTimeString('ko-KR')}` : 'Life Hub와 동기화됨', tone: 'text-fg-2' };
  }
}
