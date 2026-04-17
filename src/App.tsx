import { useState, useRef } from 'react';
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
  const [isSyncing, setIsSyncing] = useState(false);
  const syncFnRef = useRef<(() => Promise<void>) | null>(null);

  async function handleSync() {
    if (!syncFnRef.current) return;
    setIsSyncing(true);
    await syncFnRef.current();
    setIsSyncing(false);
  }

  const { phase } = state;

  return (
    <div style={{ minHeight: '100vh', background: '#090912', color: '#f0f0f8', fontFamily: '"DM Sans", sans-serif' }}>
      <Header
        onSettingsClick={() => setSettingsOpen(true)}
        onSyncClick={handleSync}
        syncCount={state.pendingNewTracks.length}
        isSyncing={isSyncing}
      />
      {phase === 'import' && <ImportPhase onSyncTrigger={fn => { syncFnRef.current = fn; }} />}
      {phase === 'tier'   && <TierPhase player={player} />}
      {phase === 'sort'   && <SortPhase player={player} />}
      {phase === 'rank'   && <RankPhase />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={() => setSettingsOpen(false)} />
    </div>
  );
}
