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

/** 헤더의 저장 상태 표시. v1은 단계마다 따로 세던 "미저장" 개수를 하나로 합쳤다 */
export default function SaveIndicator() {
  const save = useSave();
  const { session, phase } = useAppState();
  const dispatch = useAppDispatch();
  if (!session.tracks.length) return null;

  const view: View = save.localError
    ? { icon: TriangleAlert, label: '로컬 저장 실패', title: '브라우저 저장 공간이 부족합니다. 백업 파일을 내려받아 두세요.', tone: 'text-danger' }
    : save.cloud === 'off'
      ? { icon: HardDrive, label: '이 기기에 저장', title: '브라우저(localStorage)에 자동 저장됩니다. Supabase를 설정하면 클라우드에도 백업됩니다.', tone: 'text-fg-3' }
      : save.cloud === 'blocked'
        ? { icon: CloudOff, label: '다른 계정 세션', title: '다른 Spotify 계정으로 만든 세션이라 클라우드 저장을 멈췄습니다.', tone: 'text-warn', action: 'import' }
        : save.cloud === 'conflict'
          ? { icon: TriangleAlert, label: '클라우드 충돌', title: '클라우드에 이 세션과 다른 버전이 있어 자동 백업을 멈췄습니다. 불러오기 화면에서 어느 쪽을 쓸지 고르세요.', tone: 'text-warn', action: 'import' }
          : save.cloud === 'saving'
            ? { icon: LoaderCircle, label: '저장 중', title: '클라우드에 저장하는 중', tone: 'text-accent', spin: true }
            : save.cloud === 'error'
              ? { icon: TriangleAlert, label: '저장 실패', title: '클라우드 저장에 실패했습니다. 눌러서 다시 시도하세요.', tone: 'text-danger', action: 'save' }
              : save.unsaved > 0
                ? { icon: Cloud, label: `미저장 ${save.unsaved}`, title: '클릭하면 지금 클라우드에 저장합니다 (자동 저장 대기 중)', tone: 'text-warn', action: 'save' }
                : { icon: Check, label: '저장됨', title: save.lastCloudSaveAt ? `클라우드 저장: ${save.lastCloudSaveAt.toLocaleTimeString('ko-KR')}` : '클라우드와 동기화됨', tone: 'text-fg-3' };

  const Icon = view.icon;
  const content = (
    <>
      <Icon size={14} className={view.spin ? 'animate-spin' : undefined} aria-hidden />
      <span className="hidden md:inline">{view.label}</span>
    </>
  );
  const cls = `inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-mono text-[0.72rem] ${view.tone}`;

  if (!view.action) {
    return <span className={cls} title={view.title} aria-label={view.label}>{content}</span>;
  }
  return (
    <button
      type="button"
      className={`${cls} hover:bg-sub`}
      title={view.title}
      aria-label={`${view.label} — ${view.title}`}
      onClick={() => {
        if (view.action === 'save') void save.saveNow();
        else if (phase !== 'import') dispatch({ type: 'setPhase', phase: 'import' });
      }}
    >
      {content}
    </button>
  );
}
