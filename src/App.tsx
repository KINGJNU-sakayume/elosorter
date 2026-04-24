import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import ImportPhase from './components/phases/ImportPhase';
import TierPhase from './components/phases/TierPhase';
import SortPhase from './components/phases/SortPhase';
import RankPhase from './components/phases/RankPhase';

export default function App() {
  const { state } = useApp();
  const { getToken } = useSpotifyAuth();
  const player = useSpotifyPlayer(getToken);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // 전역 단축키: Ctrl+, (Mac: Cmd+,) → 설정 모달 토글
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { phase } = state;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)', fontFamily: '"DM Sans", sans-serif' }}>
      <Header onSettings={() => setSettingsOpen(true)} />
      {phase === 'import' && <ImportPhase />}
      {phase === 'tier'   && <TierPhase player={player} />}
      {phase === 'sort'   && <SortPhase player={player} getToken={getToken} />}
      {phase === 'rank'   && <RankPhase />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={() => setSettingsOpen(false)} />
    </div>
  );
}
