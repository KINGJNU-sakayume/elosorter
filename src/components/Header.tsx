import { Layers, Library, Moon, Settings, Sun, Swords, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canEnter, type Phase } from '../state/reducer';
import { useAppDispatch, useAppState } from '../state/context';
import { useTheme } from '../theme/context';
import SaveIndicator from './SaveIndicator';

const STEPS: { id: Phase; label: string; icon: LucideIcon; locked: string }[] = [
  { id: 'import', label: '불러오기', icon: Library, locked: '' },
  { id: 'tier', label: '티어 분류', icon: Layers, locked: '먼저 곡을 불러오세요' },
  { id: 'sort', label: '비교 정렬', icon: Swords, locked: '티어를 2곡 이상 분류하면 열립니다' },
  { id: 'rank', label: '랭킹', icon: Trophy, locked: '티어를 분류하면 열립니다' },
];

export default function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { phase, session } = useAppState();
  const dispatch = useAppDispatch();
  const { theme, toggle } = useTheme();
  const untiered = session.tracks.filter(t => t.tier === null).length;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2 font-mono text-sm tracking-wider text-accent">
          <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" aria-hidden />
          <span className="hidden sm:inline">ELO SORTER</span>
        </div>

        <nav aria-label="단계" className="ml-auto flex min-w-0 items-center gap-0.5">
          {STEPS.map((step, i) => {
            const enabled = canEnter(step.id, session);
            const active = phase === step.id;
            const Icon = step.icon;
            const badge = step.id === 'tier' && untiered > 0 && session.tracks.length > 0 ? untiered : null;
            return (
              <button
                key={step.id}
                type="button"
                disabled={!enabled}
                aria-current={active ? 'step' : undefined}
                title={enabled ? `${i}. ${step.label}` : step.locked}
                onClick={() => dispatch({ type: 'setPhase', phase: step.id })}
                className={`relative flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[0.82rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 ${
                  active
                    ? 'border-line bg-sub text-accent'
                    : 'border-transparent text-fg-2 enabled:hover:bg-sub enabled:hover:text-fg'
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="sr-only md:not-sr-only">{step.label}</span>
                {badge !== null && (
                  <span className="rounded-full bg-t1-soft px-1.5 font-mono text-[0.65rem] leading-4 text-t1" aria-label={`미분류 ${badge}곡`}>
                    {badge > 999 ? '999+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1 sm:pl-2">
          <SaveIndicator />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="설정 (Ctrl+,)"
            title="설정 (Ctrl+,)"
            className="flex size-8 items-center justify-center rounded-lg text-fg-2 hover:bg-sub hover:text-fg"
          >
            <Settings size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className="flex size-8 items-center justify-center rounded-lg text-fg-2 hover:bg-sub hover:text-fg"
          >
            {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </header>
  );
}
