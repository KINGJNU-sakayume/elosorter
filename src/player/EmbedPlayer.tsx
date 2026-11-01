import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Pause, Play } from 'lucide-react';
import SpotifyLogo from '../components/SpotifyLogo';

/**
 * Compact fallback based on Spotify's official iFrame API. Keep Spotify's unmodified
 * iframe in the DOM (with encrypted-media permission), and offer a visible native
 * player if browser restrictions prevent the compact controls from starting audio.
 * The parent screen already displays the full artwork, track and artist metadata.
 */
interface PlaybackEvent {
  data?: { isPaused?: boolean; isBuffering?: boolean };
}
interface EmbedController {
  addListener(event: 'ready', cb: () => void): void;
  addListener(event: 'playback_started' | 'playback_update', cb: (event: PlaybackEvent) => void): void;
  play(): void;
  pause(): void;
  destroy(): void;
}
interface SpotifyIframeAPI {
  createController(
    element: HTMLElement,
    options: { uri: string; width: string; height: number },
    callback: (controller: EmbedController) => void,
  ): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeAPI) => void;
  }
}

let iframeApi: SpotifyIframeAPI | null = null;
let loadingApi: Promise<SpotifyIframeAPI> | null = null;
let activeEmbed: EmbedController | null = null;

function loadIframeApi(): Promise<SpotifyIframeAPI> {
  if (iframeApi) return Promise.resolve(iframeApi);
  if (loadingApi) return loadingApi;
  loadingApi = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('Spotify Embed 초기화 시간 초과')), 12000);
    window.onSpotifyIframeApiReady = api => {
      clearTimeout(timeout);
      iframeApi = api;
      resolve(api);
    };
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Spotify Embed API를 불러오지 못했습니다'));
    };
    document.body.appendChild(script);
  }).catch(error => {
    loadingApi = null;
    throw error;
  });
  return loadingApi;
}

/** Called when ranking moves to another comparison, or a tier page unmounts. */
export function pauseActiveEmbed(): void {
  activeEmbed?.pause();
  activeEmbed = null;
}

function claimPlayback(controller: EmbedController): void {
  if (activeEmbed && activeEmbed !== controller) activeEmbed.pause();
  activeEmbed = controller;
}

export default function EmbedPlayer({ trackId, title }: { trackId: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<EmbedController | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let owned: EmbedController | null = null;
    void loadIframeApi()
      .then(api => {
        if (cancelled || !host.current) return;
        api.createController(
          host.current,
          { uri: `spotify:track:${trackId}`, width: '100%', height: 80 },
          embed => {
            if (cancelled) { embed.destroy(); return; }
            owned = embed;
            controller.current = embed;
            embed.addListener('ready', () => { if (!cancelled) setReady(true); });
            embed.addListener('playback_started', () => {
              if (cancelled) return;
              claimPlayback(embed);
              setPlaying(true);
            });
            embed.addListener('playback_update', event => {
              if (cancelled) return;
              const paused = event.data?.isPaused;
              if (paused === false) claimPlayback(embed);
              if (typeof paused === 'boolean') setPlaying(!paused);
            });
          },
        );
      })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => {
      cancelled = true;
      if (owned) {
        if (activeEmbed === owned) pauseActiveEmbed();
        owned.destroy();
      }
      controller.current = null;
    };
  }, [trackId]);

  const toggle = () => {
    const embed = controller.current;
    if (!embed || !ready) return;
    if (playing) {
      embed.pause();
      if (activeEmbed === embed) activeEmbed = null;
      setPlaying(false);
    } else {
      claimPlayback(embed);
      embed.play();
      // Wait for playback_update instead of pretending playback succeeded.
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-9 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!ready}
          aria-label={`${title} ${playing ? '일시정지' : '재생'}`}
          title={playing ? '일시정지' : '재생'}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-fill text-accent-fg enabled:active:scale-95 disabled:opacity-40"
        >
          {!ready && !loadFailed
            ? <LoaderCircle size={16} className="animate-spin" aria-hidden />
            : playing
              ? <Pause size={16} fill="currentColor" strokeWidth={0} aria-hidden />
              : <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="min-w-0 truncate text-xs text-fg-2 underline-offset-2 hover:underline"
        >
          {expanded ? '플레이어 닫기' : loadFailed ? '기본 플레이어 열기' : 'Spotify 플레이어'}
        </button>
        <a
          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-fg-2 hover:text-fg"
          href={`https://open.spotify.com/track/${trackId}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Spotify에서 곡 열기"
          aria-label={`${title} Spotify에서 열기`}
        >
          <SpotifyLogo size={18} />
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
      {/* Off-screen iframe keeps the official Spotify player intact while showing
          simplified controls. On restrictions, reveal the SAME player to users. */}
      {!loadFailed && (
        <div
          ref={host}
          aria-hidden={!expanded}
          className={expanded
            ? 'h-20 w-full overflow-hidden rounded-xl'
            : 'pointer-events-none fixed -left-[10000px] top-0 h-20 w-80'}
        />
      )}
      {loadFailed && expanded && (
        <iframe
          title={`${title} Spotify 플레이어`}
          src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
          className="block h-20 w-full rounded-xl border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
      {expanded && <span className="text-[11px] text-fg-3">재생 범위는 계정·기기 환경에 따라 Spotify가 결정합니다.</span>}
    </div>
  );
}
