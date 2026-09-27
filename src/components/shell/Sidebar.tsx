import { useMemo } from 'react';
import { LogOut, Moon, Settings, Sun, User } from 'lucide-react';
import { useLoggedIn, useLogout } from '../../hooks/useAuth';
import { coverImages } from '../../lib/covers';
import { fmtCount } from '../../lib/format';
import { sourceLabel } from '../../phases/import/sourceLabel';
import { useAppDispatch, useAppState } from '../../state/context';
import { canEnter } from '../../state/reducer';
import { useTheme } from '../../theme/context';
import AppMark from '../AppMark';
import SaveIndicator from '../SaveIndicator';
import { Mosaic } from '../ui/Cover';
import { STEPS, untieredBadge } from './steps';

const iconBtn = 'flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-sub hover:text-fg';

/** 넓은 화면의 왼쪽 사이드바 (Apple Music 데스크톱처럼): 단계 이동, 현재 세션, 계정·설정 */
export default function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { phase, session, user } = useAppState();
  const dispatch = useAppDispatch();
  const loggedIn = useLoggedIn();
  const logout = useLogout();
  const { theme, toggle } = useTheme();
  const covers = useMemo(() => coverImages(session.tracks), [session.tracks]);
  const hasSession = session.tracks.length > 0;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-sidebar lg:flex xl:w-64">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <AppMark size={28} />
        <span className="text-[17px] font-bold tracking-tight">ELO Sorter</span>
      </div>

      <nav aria-label="단계" className="px-3">
        <ul className="space-y-0.5">
          {STEPS.map(step => {
            const enabled = canEnter(step.id, session);
            const active = phase === step.id;
            const badge = untieredBadge(step.id, session);
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  disabled={!enabled}
                  aria-current={active ? 'step' : undefined}
                  title={enabled ? undefined : step.locked}
                  onClick={() => dispatch({ type: 'setPhase', phase: step.id })}
                  className={`flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active ? 'bg-sub-strong' : 'enabled:hover:bg-sub'
                  }`}
                >
                  <Icon size={18} strokeWidth={2.1} className="shrink-0 text-accent" aria-hidden />
                  <span className="flex-1 truncate">{step.label}</span>
                  {badge && <span className={`text-xs tabular-nums ${active ? 'text-fg' : 'text-fg-2'}`} aria-label={`미분류 ${badge}곡`}>{badge}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {hasSession && (
        <div className="mt-7 px-3">
          <h2 className="px-2.5 pb-1.5 text-xs font-semibold text-fg-2">현재 세션</h2>
          <button
            type="button"
            onClick={() => dispatch({ type: 'setPhase', phase: 'import' })}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sub"
            title="세션 관리 (불러오기 화면)"
          >
            <Mosaic images={covers} lazy className="size-10 shrink-0 rounded-md shadow-thumb" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{sourceLabel(session)}</span>
              <span className="block truncate text-xs text-fg-2 tabular-nums">
                {fmtCount(session.tracks.length)}곡 · 비교 {fmtCount(session.compCount)}회
              </span>
            </span>
          </button>
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-line p-3">
        <SaveIndicator variant="row" />
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sub text-fg-2">
                <User size={15} aria-hidden />
              </span>
            )}
            <span className="truncate text-[13px] font-medium">
              {loggedIn ? user?.displayName ?? 'Spotify 연결됨' : <span className="text-fg-2">로그인 안 됨</span>}
            </span>
          </div>
          {loggedIn && (
            <button type="button" onClick={logout} aria-label="로그아웃" title="로그아웃" className={iconBtn}>
              <LogOut size={16} aria-hidden />
            </button>
          )}
          <button type="button" onClick={onOpenSettings} aria-label="설정 (Ctrl+,)" title="설정 (Ctrl+,)" className={iconBtn}>
            <Settings size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className={iconBtn}
          >
            {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </aside>
  );
}
