import { useCallback, useEffect, useState } from 'react';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/shell/Sidebar';
import TabBar from './components/shell/TabBar';
import TopBar from './components/shell/TopBar';
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

  // 화면 전체를 쓰는 앱 틀: 넓은 화면은 왼쪽 사이드바, 좁은 화면은 상단 바 + 하단 탭 바.
  // 문서 자체는 스크롤되지 않고, 각 화면이 필요할 때만 안쪽에서 스크롤한다 (랭킹 목록 등).
  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-card">
        본문으로 건너뛰기
      </a>
      <Sidebar onOpenSettings={openSettings} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenSettings={openSettings} />
        <main id="main" className="relative min-h-0 flex-1 overflow-hidden">
          {phase === 'import' && <ImportPhase onOpenSettings={openSettings} />}
          {phase === 'tier' && <TierPhase />}
          {phase === 'sort' && <SortPhase />}
          {phase === 'rank' && <RankPhase />}
        </main>
        <TabBar />
      </div>
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
