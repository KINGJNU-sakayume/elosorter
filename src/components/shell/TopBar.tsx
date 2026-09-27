import { Moon, Settings, Sun } from 'lucide-react';
import { useAppState } from '../../state/context';
import { useTheme } from '../../theme/context';
import AppMark from '../AppMark';
import SaveIndicator from '../SaveIndicator';
import { stepLabel } from './steps';

const iconBtn = 'flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-sub hover:text-fg';

/** 좁은 화면의 상단 바: 지금 화면 이름과 저장 상태·설정·테마 (단계 이동은 아래 탭 바) */
export default function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { phase } = useAppState();
  const { theme, toggle } = useTheme();
  return (
    <header className="z-30 shrink-0 border-b border-line bg-bar pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="flex h-12 items-center gap-1 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5" aria-hidden>
          <AppMark size={26} />
          <span className="truncate text-[17px] font-bold tracking-tight">{stepLabel(phase)}</span>
        </div>
        <SaveIndicator variant="icon" />
        <button type="button" onClick={onOpenSettings} aria-label="설정" title="설정" className={iconBtn}>
          <Settings size={19} aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          className={iconBtn}
        >
          {theme === 'dark' ? <Sun size={19} aria-hidden /> : <Moon size={19} aria-hidden />}
        </button>
      </div>
    </header>
  );
}
