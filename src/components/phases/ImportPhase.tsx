import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useSpotifyAuth } from '../../hooks/useSpotifyAuth';
import { fetchAllTracks, fetchPlaylists } from '../../utils/spotify';
import { loadConfig, loadState, saveState } from '../../utils/config';
import { checkCloudSession, loadFromSupabase, deleteCloudSession } from '../../utils/supabase';
import type { SpotifyPlaylist, SpotifyUser } from '../../utils/types';

interface Props {
  onSyncTrigger?: (fn: () => Promise<void>) => void;
}

export default function ImportPhase({ onSyncTrigger }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { isLoggedIn, login, handleCallback, getToken, logout } = useSpotifyAuth();

  const [user, setUser] = useState<SpotifyUser | null>(state.user);
  const [cloudInfo, setCloudInfo] = useState<{ exists: boolean; trackCount?: number; updatedAt?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPl, setSelectedPl] = useState<SpotifyPlaylist | null>(null);
  const [sourceTab, setSourceTab] = useState<'liked' | 'playlist'>('liked');
  const [plLoading, setPlLoading] = useState(false);
  const cfg = loadConfig();

  // OAuth callback
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      handleCallback(code).then(ok => {
        if (ok) showToast('✅ Spotify 로그인 완료');
        else showToast('❌ 로그인 실패');
      });
    }
    // Restore localStorage session
    const s = loadState();
    if (s?.tracks?.length) {
      dispatch({ type: 'LOAD_STATE', payload: s });
      showToast(`📂 ${s.tracks.length}곡 세션 복원됨`);
    }
  }, []);

  // Load user profile
  useEffect(() => {
    if (!isLoggedIn()) return;
    getToken().then(token => {
      if (!token) return;
      fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.json())
        .then(me => {
          const u: SpotifyUser = { id: me.id, display_name: me.display_name || me.id, email: me.email || '', imageUrl: me.images?.[0]?.url || '' };
          setUser(u);
          dispatch({ type: 'SET_USER', payload: u });
        });
    });
    checkCloudSession(cfg).then(setCloudInfo);
  }, [isLoggedIn()]);

  // expose sync function
  useEffect(() => {
    if (onSyncTrigger) onSyncTrigger(handleSync);
  }, [state.tracks.length]);

  async function handleSync() {
    if (!state.tracks.length) { showToast('⚠️ 먼저 음악 소스를 불러오세요'); return; }
    const knownIds = new Set(state.tracks.map(t => t.id));
    const endpoint = state.currentSource === 'liked' ? '/me/tracks?limit=50'
      : state.currentSource?.startsWith('playlist:') ? `/playlists/${state.currentSource.split(':')[1]}/tracks?limit=50`
      : null;
    if (!endpoint) return;
    try {
      const all = await fetchAllTracks(endpoint, getToken);
      const newOnes = all.filter(t => !knownIds.has(t.id)).map(t => ({ ...t, isNew: true }));
      if (!newOnes.length) { showToast('✅ 신규 곡 없음'); return; }
      dispatch({ type: 'SET_PENDING_NEW', payload: newOnes });
      showToast(`✦ ${newOnes.length}곡 신규 감지됨`);
    } catch (e) { showToast('❌ 동기화 실패: ' + String(e)); }
  }

  async function loadLiked() {
    setLoading(true); setLoadingText('좋아요 곡 불러오는 중…');
    try {
      const tracks = await fetchAllTracks('/me/tracks?limit=50', getToken, (n, total) => setLoadingText(`좋아요 곡 불러오는 중… ${n} / ${total}`));
      dispatch({ type: 'SET_TRACKS', payload: tracks });
      dispatch({ type: 'LOAD_STATE', payload: { currentSource: 'liked' } });
      saveState({ tracks, compCount: 0, rsiDeltas: [], currentSource: 'liked' });
      showToast(`✅ ${tracks.length}곡 불러오기 완료`);
      dispatch({ type: 'SET_PHASE', payload: tracks.some(t => t.tier === null) ? 'tier' : 'sort' });
    } catch (e) { showToast('❌ 불러오기 실패: ' + String(e)); }
    setLoading(false);
  }

  async function loadPlaylist() {
    if (!selectedPl) return;
    setLoading(true); setLoadingText(`"${selectedPl.name}" 불러오는 중…`);
    try {
      const tracks = await fetchAllTracks(`/playlists/${selectedPl.id}/tracks?limit=50`, getToken, (n, total) => setLoadingText(`"${selectedPl.name}" 불러오는 중… ${n} / ${total}`));
      const src = `playlist:${selectedPl.id}`;
      dispatch({ type: 'SET_TRACKS', payload: tracks });
      dispatch({ type: 'LOAD_STATE', payload: { currentSource: src } });
      saveState({ tracks, compCount: 0, rsiDeltas: [], currentSource: src });
      showToast(`✅ ${tracks.length}곡 불러오기 완료`);
      dispatch({ type: 'SET_PHASE', payload: tracks.some(t => t.tier === null) ? 'tier' : 'sort' });
    } catch (e) { showToast('❌ 불러오기 실패: ' + String(e)); }
    setLoading(false);
  }

  async function switchToPlaylist() {
    setSourceTab('playlist');
    if (playlists.length) return;
    setPlLoading(true);
    try { setPlaylists(await fetchPlaylists(getToken)); } catch { showToast('❌ 플레이리스트 로드 실패'); }
    setPlLoading(false);
  }

  async function handleLoadCloud() {
    const res = await loadFromSupabase(cfg);
    if (!res) { showToast('☁️ 저장된 데이터 없음'); return; }
    dispatch({ type: 'LOAD_STATE', payload: res.data });
    showToast(`☁️ ${res.data.tracks?.length ?? 0}곡 불러오기 완료`);
    dispatch({ type: 'SET_PHASE', payload: res.data.tracks?.some((t: { tier: unknown }) => t.tier === null) ? 'tier' : 'sort' });
  }

  function handleLogout() {
    logout();
    dispatch({ type: 'RESET' });
    setUser(null);
    showToast('로그아웃됨');
  }

  const S = {
    card: { background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 16, padding: 24, marginBottom: 16 } as React.CSSProperties,
    btn: (variant: 'green' | 'outline' | 'ghost') => ({
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
      fontFamily: '"DM Sans", sans-serif', fontSize: '0.875rem', fontWeight: 600,
      transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
      ...(variant === 'green' ? { background: '#00e87a', color: '#000', border: '1px solid #00e87a' }
        : variant === 'outline' ? { background: 'transparent', color: '#8899aa', border: '1px solid #2a2a3e' }
        : { background: 'transparent', color: '#556070', border: '1px solid transparent' }),
    }),
  };

  if (!isLoggedIn()) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 20 }}>🎵</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Spotify 계정 연결</h2>
        <p style={{ color: '#8899aa', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 28, maxWidth: 380, margin: '0 auto 28px' }}>
          좋아요 곡 또는 플레이리스트를 불러와 ELO 정렬을 시작하세요.
        </p>
        <button onClick={login} style={{ ...S.btn('green'), background: '#1ed760', borderColor: '#1ed760' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.076-.495 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.52-.973c3.632-1.102 8.147-.568 11.233 1.329a.78.78 0 01.257 1.072zm.105-2.835C14.69 9.145 9.375 8.955 6.204 9.88a.937.937 0 11-.543-1.794c3.618-1.096 9.635-.884 13.432 1.312a.937.937 0 01-.179 1.469z"/></svg>
          Spotify로 로그인
        </button>
        <p style={{ marginTop: 16, fontSize: '0.78rem', color: '#556070' }}>설정(⚙)에서 Spotify Client ID와 Supabase 정보를 먼저 입력하세요</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

      {/* User card */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.imageUrl
              ? <img src={user.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#242436', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8899aa' }}>👤</div>
            }
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.display_name || '—'}</div>
              <div style={{ fontSize: '0.8rem', color: '#8899aa', marginTop: 2 }}>Spotify 연결됨</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: '0.78rem', color: '#556070', fontFamily: '"DM Mono", monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.supabaseUrl ? '#00e87a' : '#556070' }} />
              {cfg.supabaseUrl ? 'Supabase 연결됨' : 'Supabase 미설정'}
            </div>
            <button onClick={handleLogout} style={S.btn('outline')}>로그아웃</button>
          </div>
        </div>
      </div>

      {/* New tracks banner */}
      {state.pendingNewTracks.length > 0 && (
        <div style={{ background: 'rgba(0,232,122,0.08)', border: '1.5px solid rgba(0,232,122,0.35)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '1.4rem', fontWeight: 700, color: '#00e87a', flexShrink: 0 }}>{state.pendingNewTracks.length}</div>
          <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.5 }}>
            <strong>신규 곡이 감지되었습니다</strong><br />
            <span style={{ fontSize: '0.82rem', color: '#8899aa' }}>{state.pendingNewTracks.slice(0, 3).map(t => `${t.name} — ${t.artists[0]}`).join(' / ')}{state.pendingNewTracks.length > 3 ? ` 외 ${state.pendingNewTracks.length - 3}곡` : ''}</span>
          </div>
          <button onClick={() => { dispatch({ type: 'ABSORB_NEW' }); dispatch({ type: 'SET_PHASE', payload: 'tier' }); }} style={S.btn('green')}>티어 분류 시작 →</button>
        </div>
      )}

      {/* Source picker */}
      <div style={S.card}>
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#556070', marginBottom: 16, fontFamily: '"DM Mono", monospace' }}>음악 소스 선택</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['liked', 'playlist'] as const).map(t => (
            <button key={t} onClick={t === 'liked' ? () => setSourceTab('liked') : switchToPlaylist}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid ' + (sourceTab === t ? '#00e87a' : '#2a2a3e'), background: sourceTab === t ? 'rgba(0,232,122,0.12)' : 'transparent', color: sourceTab === t ? '#00e87a' : '#8899aa', fontFamily: '"DM Sans", sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              {t === 'liked' ? '💚 좋아요 곡' : '📋 플레이리스트'}
            </button>
          ))}
        </div>

        {sourceTab === 'liked' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>좋아요 표시한 곡</div>
              <div style={{ fontSize: '0.82rem', color: '#8899aa', marginTop: 4 }}>Spotify에서 실시간 불러오기</div>
            </div>
            <button onClick={loadLiked} disabled={loading} style={S.btn('green')}>
              {loading ? <><span className="spinner" /> {loadingText}</> : '불러오기'}
            </button>
          </div>
        )}

        {sourceTab === 'playlist' && (
          <div>
            {plLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8899aa', fontSize: '0.88rem', padding: '16px 0' }}><span className="spinner" /> 플레이리스트 목록 로딩 중…</div>}
            {!plLoading && playlists.length === 0 && <div style={{ color: '#8899aa', fontSize: '0.88rem', padding: '12px 0' }}>플레이리스트가 없습니다</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginTop: 12 }}>
              {playlists.map(pl => (
                <button key={pl.id} onClick={() => setSelectedPl(pl)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + (selectedPl?.id === pl.id ? '#00e87a' : '#2a2a3e'), background: selectedPl?.id === pl.id ? 'rgba(0,232,122,0.12)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <img src={pl.images?.[0]?.url || ''} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', background: '#242436', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f0f8' }}>{pl.name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#8899aa', marginTop: 2 }}>{pl.tracks.total}곡</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={loadPlaylist} disabled={!selectedPl || loading} style={S.btn('green')}>
                {loading ? <><span className="spinner" /> {loadingText}</> : '선택한 플레이리스트 불러오기'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cloud */}
      <div style={S.card}>
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#556070', marginBottom: 16, fontFamily: '"DM Mono", monospace' }}>클라우드 저장</div>
        {cloudInfo?.exists ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>저장된 세션</div>
              <div style={{ fontSize: '0.8rem', color: '#8899aa', marginTop: 3 }}>{cloudInfo.trackCount}곡 · {cloudInfo.updatedAt ? new Date(cloudInfo.updatedAt).toLocaleString('ko-KR') : '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleLoadCloud} style={S.btn('green')}>클라우드에서 불러오기</button>
              <button onClick={async () => { await deleteCloudSession(cfg); setCloudInfo({ exists: false }); showToast('🗑️ 삭제됨'); }} style={S.btn('outline')}>초기화</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.88rem', color: '#8899aa' }}>{cfg.supabaseUrl ? '저장된 세션이 없습니다' : 'Supabase를 설정하면 클라우드 저장이 활성화됩니다'}</div>
        )}
      </div>

      {/* Resume session */}
      {state.tracks.length > 0 && (
        <div style={{ ...S.card, border: '1px solid rgba(0,232,122,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>현재 세션 이어하기</div>
              <div style={{ fontSize: '0.82rem', color: '#8899aa', marginTop: 3 }}>{state.tracks.length}곡 · 비교 {state.compCount}회</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => dispatch({ type: 'SET_PHASE', payload: state.tracks.some(t => t.tier === null) ? 'tier' : 'sort' })} style={S.btn('green')}>이어하기 →</button>
              <button onClick={() => dispatch({ type: 'SET_PHASE', payload: 'rank' })} style={S.btn('outline')}>랭킹 보기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
