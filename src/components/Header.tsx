import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import type { Phase } from '../utils/types';

const TABS: { id: Phase; label: string; step: string }[] = [
  { id: 'import', label: '불러오기', step: '↑' },
  { id: 'tier',   label: '티어 분류', step: '1' },
  { id: 'sort',   label: '비교 정렬', step: '2' },
  { id: 'rank',   label: '랭킹',      step: '3' },
];

interface Props {
  onSettings?: () => void;
}

export default function Header({ onSettings }: Props) {
  const { state, dispatch } = useApp();
  const { theme, toggle } = useTheme();
  const { phase, tracks } = state;
  const hasData = tracks.length > 0;

  function goPhase(p: Phase) {
    if (!hasData && p !== 'import') return;
    dispatch({ type: 'SET_PHASE', payload: p });
  }

  return (
    <div
      style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--header-bg)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div style={{
        fontFamily: '"DM Mono", monospace',
        color: 'var(--accent)',
        fontSize: '0.95rem',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
        ELO SORTER
      </div>

      <nav style={{ display: 'flex', gap: 2, marginLeft: 'auto', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(tab => {
          const locked = !hasData && tab.id !== 'import';
          const active = phase === tab.id;
          return (
            <button
              key={tab.id}
              disabled={locked}
              onClick={() => goPhase(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid ' + (active ? 'var(--border)' : 'transparent'),
                background: active ? 'var(--bg-sub)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.82rem', fontWeight: 500,
                cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.3 : 1,
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontFamily: '"DM Mono", monospace', color: active ? '#000' : 'var(--text-secondary)' }}>
                {tab.step}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* 설정 버튼 */}
      {onSettings && (
        <button
          onClick={onSettings}
          aria-label="설정 열기 (Ctrl+,)"
          title="설정 (Ctrl+,)"
          style={{
            width: 32, height: 32, borderRadius: 6,
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-sub)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* 테마 토글 */}
      <button
        onClick={toggle}
        aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        style={{
          width: 32, height: 32, borderRadius: 6,
          border: '1px solid transparent', background: 'transparent',
          color: 'var(--text-secondary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-sub)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        {theme === 'dark' ? (
          // 태양 (다크 모드 → 라이트 모드로 전환)
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          // 달 (라이트 모드 → 다크 모드로 전환)
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}
