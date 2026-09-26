import { useMemo, useState } from 'react';
import { Heart, ListMusic, Search } from 'lucide-react';
import type { Source } from '../../core/types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Cover from '../../components/ui/Cover';
import { useConfirm } from '../../components/ui/confirm';
import { errorMessage, fmtCount } from '../../lib/format';
import { fetchPlaylists, fetchSourceTracks } from '../../services/spotify/api';
import type { SpotifyPlaylist } from '../../services/spotify/types';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { sourceLabel } from './sourceLabel';
import { useSync } from './useSync';

type Tab = 'liked' | 'playlist';

export default function SourcePicker() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const confirm = useConfirm();
  const { sync, syncing } = useSync();

  const [tab, setTab] = useState<Tab>('liked');
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selected, setSelected] = useState<SpotifyPlaylist | null>(null);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  const hasSession = session.tracks.length > 0;

  const openPlaylists = async () => {
    setTab('playlist');
    if (playlists || playlistsLoading) return;
    setPlaylistsLoading(true);
    try {
      setPlaylists(await fetchPlaylists());
    } catch (e) {
      toast(`플레이리스트를 불러오지 못했습니다: ${errorMessage(e)}`, 'error');
    } finally {
      setPlaylistsLoading(false);
    }
  };

  const load = async (source: Source, name: string | null) => {
    // 같은 소스를 다시 불러오면 기록을 지우지 않고 동기화로 처리 (v1은 비교 기록이 통째로 사라졌다)
    if (hasSession && session.source === source) {
      await sync();
      return;
    }
    if (hasSession) {
      const ok = await confirm({
        title: '새 세션을 시작할까요?',
        message: `현재 세션(${sourceLabel(session)} · ${fmtCount(session.tracks.length)}곡 · 비교 ${fmtCount(session.compCount)}회)은 이 브라우저에서 지워집니다. 필요하면 먼저 아래에서 백업 파일을 내려받으세요.`,
        confirmLabel: '새로 시작',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setProgress({ loaded: 0, total: 0 });
    try {
      const tracks = await fetchSourceTracks(source, (loaded, total) => setProgress({ loaded, total }));
      if (!tracks.length) {
        toast('불러올 곡이 없습니다', 'error');
        return;
      }
      dispatch({ type: 'newSession', source, sourceName: name, tracks });
      toast(`${fmtCount(tracks.length)}곡을 불러왔습니다. 티어를 분류해 주세요`, 'success');
    } catch (e) {
      toast(`불러오기 실패: ${errorMessage(e)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q && playlists ? playlists.filter(p => p.name.toLowerCase().includes(q)) : playlists ?? [];
  }, [playlists, query]);

  const loading = progress !== null || syncing;
  const progressLabel = progress && progress.total
    ? `불러오는 중… ${fmtCount(progress.loaded)} / ${fmtCount(progress.total)}`
    : '불러오는 중…';

  const tabCls = (active: boolean) =>
    `flex h-9 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition-colors ${
      active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-sub'
    }`;

  return (
    <Card title={hasSession ? '다른 음악으로 새 세션' : '음악 불러오기'}>
      <div role="tablist" aria-label="음악 소스" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={tab === 'liked'} className={tabCls(tab === 'liked')} onClick={() => setTab('liked')}>
          <Heart size={15} aria-hidden /> 좋아요 곡
        </button>
        <button type="button" role="tab" aria-selected={tab === 'playlist'} className={tabCls(tab === 'playlist')} onClick={openPlaylists}>
          <ListMusic size={15} aria-hidden /> 플레이리스트
        </button>
      </div>

      {tab === 'liked' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">좋아요 표시한 곡</div>
            <div className="mt-0.5 text-sm text-fg-2">
              {session.source === 'liked' ? '지금 세션의 소스입니다 — 다시 불러오면 기록을 유지한 채 동기화합니다' : 'Spotify 라이브러리 전체를 불러옵니다'}
            </div>
          </div>
          <Button variant="primary" loading={loading} onClick={() => load('liked', null)}>
            {loading ? progressLabel : session.source === 'liked' ? '동기화' : '불러오기'}
          </Button>
        </div>
      ) : (
        <div>
          {playlists && playlists.length > 8 && (
            <label className="relative mb-3 block">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden />
              <span className="sr-only">플레이리스트 검색</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="플레이리스트 검색"
                className="h-10 w-full rounded-lg border border-line bg-sub pr-3 pl-9 text-sm placeholder:text-fg-3 focus:border-accent focus:outline-none"
              />
            </label>
          )}
          {playlistsLoading && <p className="py-6 text-center text-sm text-fg-2">플레이리스트 목록을 불러오는 중…</p>}
          {playlists && !filtered.length && (
            <p className="py-6 text-center text-sm text-fg-2">{query ? '검색 결과가 없습니다' : '플레이리스트가 없습니다'}</p>
          )}
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1" aria-label="플레이리스트">
            {filtered.map(p => {
              const active = selected?.id === p.id;
              const current = session.source === `playlist:${p.id}`;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(p)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                      active ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sub'
                    }`}
                  >
                    <Cover src={p.imageUrl} lazy className="size-11 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="truncate text-xs text-fg-2">
                        {fmtCount(p.trackCount)}곡{p.owner && ` · ${p.owner}`}{current && ' · 현재 세션'}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              variant="primary"
              loading={loading}
              disabled={!selected}
              onClick={() => selected && load(`playlist:${selected.id}`, selected.name)}
            >
              {loading ? progressLabel : selected && session.source === `playlist:${selected.id}` ? '동기화' : '선택한 플레이리스트 불러오기'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
