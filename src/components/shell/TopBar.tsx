import { Settings } from 'lucide-react';
import { fmtCount } from '../../lib/format';
import { useAppState } from '../../state/context';
import AppMark from '../AppMark';
import SaveIndicator from '../SaveIndicator';
import { stepLabel } from './steps';

/**
 * 좁은 화면의 상단 바: 지금 화면 이름과 저장 상태·설정 (단계 이동은 아래 탭 바, 테마는 설정 창).
 * 손가락으로 누르는 화면이라 아이콘 버튼은 44px을 확보한다.
 */
export default function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { phase, session } = useAppState();
  return (
    <header className="z-30 shrink-0 border-b border-line bg-bar pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="flex h-12 items-center gap-1 pr-0.5 pl-3 sm:pr-2 sm:pl-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5" aria-hidden>
          <AppMark size={26} />
          <span className="truncate text-[17px] font-bold tracking-tight">
            {stepLabel(phase)}
            {/* 비교 화면은 세로 공간이 빠듯해서 몇 번째 비교인지를 여기에 적는다 */}
            {phase === 'sort' && session.tracks.length > 0 && (
              <span className="font-semibold text-fg-3 tabular-nums"> #{fmtCount(session.compCount + 1)}</span>
            )}
          </span>
        </div>
        <SaveIndicator variant="icon" />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="설정"
          title="설정"
          className="flex size-11 items-center justify-center rounded-full text-fg-2 hover:bg-sub hover:text-fg"
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>
    </header>
  );
}
