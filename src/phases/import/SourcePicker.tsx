import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Heart } from 'lucide-react';
import type { Source } from '../../core/types';
import Button from '../../components/ui/Button';
import Cover from '../../components/ui/Cover';
import SearchField from '../../components/ui/SearchField';
import { useConfirm } from '../../components/ui/confirm';
import { errorMessage, fmtCount } from '../../lib/format';
import { fetchPlaylists, fetchSourceTracks } from '../../services/spotify/api';
import type { SpotifyPlaylist } from '../../services/spotify/types';
import { useAppDispatch, useAppState, useToast } from '../../state/context';
import { sourceLabel } from './sourceLabel';
import { useSync } from './useSync';

interface Choice {
  source: Source;
  name: string | null;
  trackCount: number | null;
}

const LIKED: Choice = { source: 'liked', name: null, trackCount: null };

/**
 * 음악 고르기: 좋아요 곡 + 내 플레이리스트를 앨범 아트 격자로 (Apple Music 보관함처럼).
 * 고른 뒤 아래 막대의 버튼으로 불러온다. 목록이 길면 이 영역 안에서만 스크롤한다.
 */
export default function SourcePicker() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const confirm = useConfirm();
  const { sync, syncing } = useSync();
  const hasSession = session.tracks.length > 0;

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Choice | null>(hasSession ? null : LIKED);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaylists().then(
      list => { if (!cancelled) setPlaylists(list); },
      e => { if (!cancelled) setListError(errorMessage(e)); },
    );
    return () => { cancelled = true; };
  }, []);

  const load = async ({ source, name }: Choice) => {
    // 같은 소스를 다시 불러오면 기록을 지우지 않고 동기화로 처리 (v1은 비교 기록이 통째로 사라졌다)
    if (hasSession && session.source === source) {
      await sync();
      return;
    }
    if (hasSession) {
      const ok = await confirm({
        title: '새 세션을 시작할까요?',
        message: `현재 세션(${sourceLabel(session)} · ${fmtCount(session.tracks.length)}곡 · 비교 ${fmtCount(session.compCount)}회)은 이 브라우저에서 지워집니다. 필요하면 먼저 백업 파일을 내려받으세요.`,
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
  const isCurrent = (source: Source) => hasSession && session.source === source;
  const actionLabel = loading
    ? progress?.total ? `불러오는 중… ${fmtCount(progress.loaded)} / ${fmtCount(progress.total)}` : '불러오는 중…'
    : selected && isCurrent(selected.source) ? '동기화' : '불러오기';

  const tile = (choice: Choice, art: ReactNode, title: string, subtitle: string) => {
    const active = selected?.source === choice.source;
    return (
      <li key={choice.source}>
        <button
          type="button"
          aria-pressed={active}
          onClick={() => setSelected(choice)}
          onDoubleClick={() => { if (!loading) void load(choice); }}
          className="group block w-full rounded-lg text-left"
        >
          <span className={`relative block aspect-square overflow-hidden rounded-lg shadow-thumb transition-[box-shadow] ${
            active ? 'ring-[3px] ring-accent ring-offset-2 ring-offset-section' : ''
          }`}>
            {art}
            {isCurrent(choice.source) && (
              <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
                현재 세션
              </span>
            )}
            {active && (
              <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-accent-fill text-white shadow-thumb">
                <Check size={14} strokeWidth={3} aria-hidden />
              </span>
            )}
          </span>
          <span className="mt-2 block truncate text-[13px] font-medium">{title}</span>
          <span className="block truncate text-xs text-fg-2">{subtitle}</span>
        </button>
      </li>
    );
  };

  return (
    <section className="flex min-h-[26rem] flex-col rounded-2xl bg-section md:h-full md:min-h-0" aria-labelledby="source-title">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 id="source-title" className="mr-auto text-[17px] font-semibold">
          {hasSession ? '다른 음악으로 새 세션' : '불러올 음악 고르기'}
        </h2>
        {playlists && playlists.length > 8 && (
          <SearchField value={query} onChange={setQuery} label="플레이리스트 검색" placeholder="플레이리스트 검색" className="w-full sm:w-56" />
        )}
      </div>

      <ul
        aria-label="음악 소스"
        className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-5 overflow-y-auto px-4 py-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:px-5"
      >
        {!query && tile(
          LIKED,
          <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-[#ff7a8e] to-[#e0223c]">
            <Heart className="size-2/5 text-white" fill="currentColor" strokeWidth={0} aria-hidden />
          </span>,
          '좋아요 표시한 곡',
          'Spotify 라이브러리',
        )}
        {filtered.map(p => tile(
          { source: `playlist:${p.id}`, name: p.name, trackCount: p.trackCount },
          <Cover src={p.imageUrl} lazy className="h-full w-full" />,
          p.name,
          `${fmtCount(p.trackCount)}곡${p.owner ? ` · ${p.owner}` : ''}`,
        ))}
        {!playlists && !listError && Array.from({ length: 5 }, (_, i) => (
          <li key={`skeleton-${i}`} aria-hidden>
            <span className="block aspect-square animate-pulse rounded-lg bg-sub" />
            <span className="mt-2 block h-3 w-3/4 animate-pulse rounded bg-sub" />
          </li>
        ))}
      </ul>
      {listError && <p className="px-5 pb-3 text-sm text-danger">플레이리스트를 불러오지 못했습니다: {listError}</p>}
      {playlists && query && !filtered.length && <p className="px-5 pb-3 text-sm text-fg-2">검색 결과가 없습니다</p>}

      <div className="flex items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="min-w-0 flex-1 truncate text-sm text-fg-2">
          {selected
            ? <>
                <span className="font-semibold text-fg">{selected.name ?? '좋아요 표시한 곡'}</span>
                {selected.trackCount !== null && ` · ${fmtCount(selected.trackCount)}곡`}
                {isCurrent(selected.source) && ' · 지금 세션 — 기록을 유지한 채 동기화합니다'}
              </>
            : '불러올 음악을 고르세요'}
        </p>
        <Button variant="primary" loading={loading} disabled={!selected} onClick={() => selected && load(selected)}>
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}
