import { useAppDispatch, useAppState, useSave } from '../state/context';
import { saveView } from './saveView';

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
  const view = saveView({ cloud, unsaved, lastSaveAt, localError: save.localError });

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
