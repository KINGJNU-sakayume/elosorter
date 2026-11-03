import { Check, Cloud, CloudOff, HardDrive, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppState, useSave } from '../state/context';

interface View {
  icon: LucideIcon;
  label: string;
  title: string;
  tone: string;
  spin?: boolean;
  action?: 'save' | 'import';
}

/**
 * 저장 상태. v1은 단계마다 따로 세던 "미저장" 개수를 하나로 합쳤다.
 * row: 사이드바 한 줄 (아이콘 + 문구) / icon: 좁은 화면 상단 바의 아이콘
 */
export default function SaveIndicator({ variant = 'row' }: { variant?: 'row' | 'icon' }) {
  const save = useSave();
  const { session, phase } = useAppState();
  const dispatch = useAppDispatch();
  if (!session.tracks.length) return null;

  const { cloud, unsaved, lastSaveAt } = save.primary;
  const hubOn = save.hub.snapshot.enabled;
  const where = hubOn ? 'Life Hub' : '클라우드';
  const view: View = save.localError
    ? { icon: TriangleAlert, label: '로컬 저장 실패', title: '브라우저 저장 공간이 부족합니다. 백업 파일을 내려받아 두세요.', tone: 'text-danger' }
    : cloud === 'off'
      ? { icon: HardDrive, label: '이 기기에 저장됨', title: '브라우저(localStorage)에 자동 저장됩니다. 설정에서 Life Hub 동기화를 켜거나 Supabase를 설정하면 클라우드에도 백업됩니다.', tone: 'text-fg-2' }
      : cloud === 'disconnected'
        ? { icon: CloudOff, label: 'Life Hub 연결 필요', title: 'Life Hub 동기화가 켜져 있지만 연결이 끊겼습니다. 이 동안 Supabase에도 쓰지 않습니다. 설정에서 다시 연결하거나 동기화를 끄세요.', tone: 'text-warn' }
        : cloud === 'blocked'
          ? { icon: CloudOff, label: '다른 계정 세션', title: `다른 Spotify 계정으로 만든 세션이라 ${where} 저장을 멈췄습니다.`, tone: 'text-warn', action: 'import' }
          : cloud === 'conflict'
            ? { icon: TriangleAlert, label: `${where} 충돌`, title: `${where}에 이 세션과 다른 버전이 있어 자동 저장을 멈췄습니다. 불러오기 화면에서 어느 쪽을 쓸지 고르세요.`, tone: 'text-warn', action: 'import' }
            : cloud === 'forbidden'
              ? { icon: CloudOff, label: '동기화 권한 없음', title: 'Life Hub 연결에 동기화 권한이 없습니다. 설정에서 다시 연결하면서 동기화를 허용하세요.', tone: 'text-warn' }
              : cloud === 'too_large'
                ? { icon: TriangleAlert, label: '동기화 문서 너무 큼', title: '동기화 문서가 한도를 넘어 자동 동기화를 멈췄습니다. 설정에서 크기를 확인하세요. 로컬 저장과 백업 파일은 그대로 됩니다.', tone: 'text-warn' }
                : cloud === 'saving'
                  ? { icon: LoaderCircle, label: '저장 중…', title: `${where}에 저장하는 중`, tone: 'text-fg-2', spin: true }
                  : cloud === 'retry'
                    ? { icon: Cloud, label: '나중에 재시도', title: `네트워크나 서버 문제로 ${where}에 저장하지 못했습니다. 이 기기의 세션은 그대로이고 잠시 뒤 다시 시도합니다. 눌러서 지금 시도합니다.`, tone: 'text-warn', action: 'save' }
                    : cloud === 'error'
                      ? { icon: TriangleAlert, label: '저장 실패 · 다시 시도', title: `${where} 저장에 실패했습니다. 눌러서 다시 시도하세요.`, tone: 'text-danger', action: 'save' }
                      : unsaved > 0
                        ? { icon: Cloud, label: `저장 대기 ${unsaved}`, title: `누르면 지금 ${where}에 저장합니다 (자동 저장 대기 중)`, tone: 'text-warn', action: 'save' }
                        : { icon: Check, label: `${where}에 저장됨`, title: lastSaveAt ? `${where} 저장: ${lastSaveAt.toLocaleTimeString('ko-KR')}` : `${where}와 동기화됨`, tone: 'text-fg-2' };

  const Icon = view.icon;
  const icon = <Icon size={variant === 'row' ? 15 : 19} strokeWidth={2.2} className={`shrink-0 ${view.spin ? 'animate-spin' : ''}`} aria-hidden />;
  const cls = variant === 'row'
    ? `flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] ${view.tone}`
    : `flex size-11 items-center justify-center rounded-full ${view.tone}`;
  const content = variant === 'row' ? <>{icon}<span className="truncate">{view.label}</span></> : icon;

  if (!view.action) {
    return variant === 'row'
      ? <span className={cls} title={view.title}>{content}</span>
      : <span className={cls} title={view.title} role="img" aria-label={view.label}>{content}</span>;
  }
  return (
    <button
      type="button"
      className={`${cls} hover:bg-sub`}
      title={view.title}
      aria-label={`${view.label} — ${view.title}`}
      onClick={() => {
        if (view.action === 'save') void save.primary.saveNow();
        else if (phase !== 'import') dispatch({ type: 'setPhase', phase: 'import' });
      }}
    >
      {content}
    </button>
  );
}
