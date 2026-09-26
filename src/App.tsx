import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import { useLoggedIn } from './hooks/useAuth';
import { useBackfill } from './hooks/useBackfill';
import ImportPhase from './phases/import/ImportPhase';
import RankPhase from './phases/rank/RankPhase';
import SortPhase from './phases/sort/SortPhase';
import TierPhase from './phases/tier/TierPhase';
import { fetchMe } from './services/spotify/api';
import { auth } from './services/spotify/auth';
import { useAppDispatch, useAppState, useToast } from './state/context';

export default function App() {
  const { phase } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const loggedIn = useLoggedIn();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  // OAuth 리다이렉트(?code=…) 처리
  useEffect(() => {
    void auth.completeLogin().then(result => {
      if (result === 'success') toast('Spotify에 로그인했습니다', 'success');
      else if (result === 'denied') toast('Spotify 로그인을 취소했습니다');
      else if (result === 'failed') toast('로그인에 실패했습니다. 설정의 Client ID와 Redirect URI를 확인하세요', 'error');
    });
  }, [toast]);

  // 프로필 → 세션 주인 확인
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetchMe()
      .then(user => { if (!cancelled) dispatch({ type: 'setUser', user }); })
      .catch(e => console.warn('[app] 프로필 조회 실패', e));
    return () => { cancelled = true; };
  }, [loggedIn, dispatch]);

  useBackfill(loggedIn);

  // 전역 단축키: Ctrl+, (Mac: ⌘+,) → 설정
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>
      <Header onOpenSettings={openSettings} />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {phase === 'import' && <ImportPhase onOpenSettings={openSettings} />}
        {phase === 'tier' && <TierPhase />}
        {phase === 'sort' && <SortPhase />}
        {phase === 'rank' && <RankPhase />}
      </main>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          toast('설정을 저장했습니다', 'success');
        }}
      />
    </div>
  );
}
