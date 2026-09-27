import { useAppDispatch, useAppState } from '../../state/context';
import { canEnter } from '../../state/reducer';
import { STEPS, untieredBadge } from './steps';

/** 좁은 화면의 하단 탭 바 (iOS 탭 바처럼) */
export default function TabBar() {
  const { phase, session } = useAppState();
  const dispatch = useAppDispatch();
  return (
    <nav
      aria-label="단계"
      className="z-30 flex shrink-0 border-t border-line bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      {STEPS.map(step => {
        const enabled = canEnter(step.id, session);
        const active = phase === step.id;
        const badge = untieredBadge(step.id, session);
        const Icon = step.icon;
        return (
          <button
            key={step.id}
            type="button"
            disabled={!enabled}
            aria-current={active ? 'step' : undefined}
            title={enabled ? undefined : step.locked}
            onClick={() => dispatch({ type: 'setPhase', phase: step.id })}
            className={`flex h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors disabled:opacity-35 ${
              active ? 'text-accent' : 'text-fg-3'
            }`}
          >
            <span className="relative">
              <Icon size={22} strokeWidth={active ? 2.3 : 2} aria-hidden />
              {badge && (
                <span
                  className="absolute -top-1.5 left-3.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fill px-1 text-[10px] leading-none font-semibold whitespace-nowrap text-white tabular-nums"
                  aria-label={`미분류 ${badge}곡`}
                >
                  {badge}
                </span>
              )}
            </span>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
