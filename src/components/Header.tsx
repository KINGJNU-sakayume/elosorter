import { useApp } from '../context/AppContext';
import type { Phase } from '../utils/types';

const TABS: { id: Phase; label: string; step: string }[] = [
  { id: 'import', label: '불러오기', step: '↑' },
  { id: 'tier',   label: '티어 분류', step: '1' },
  { id: 'sort',   label: '비교 정렬', step: '2' },
  { id: 'rank',   label: '랭킹',      step: '3' },
];

export default function Header() {
  const { state, dispatch } = useApp();
  const { phase, tracks } = state;
  const hasData = tracks.length > 0;

  function goPhase(p: Phase) {
    if (!hasData && p !== 'import') return;
    dispatch({ type: 'SET_PHASE', payload: p });
  }

  return (
    <div
      style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(9,9,18,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #2a2a3e', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div className="font-mono text-accent text-[0.95rem] tracking-[0.05em] flex items-center gap-2 shrink-0">
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e87a', boxShadow: '0 0 8px #00e87a' }} />
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
                border: '1px solid ' + (active ? '#2a2a3e' : 'transparent'),
                background: active ? '#1c1c2c' : 'transparent',
                color: active ? '#00e87a' : '#8899aa',
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.82rem', fontWeight: 500,
                cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.3 : 1,
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: active ? '#00e87a' : '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontFamily: '"DM Mono", monospace', color: active ? '#000' : '#8899aa' }}>
                {tab.step}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
