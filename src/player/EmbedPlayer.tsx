/** Web Playback SDK를 쓸 수 없을 때(모바일, Premium 아님)의 대체 플레이어 */
export default function EmbedPlayer({ trackId, title }: { trackId: string; title: string }) {
  return (
    <iframe
      title={`${title} 미리듣기`}
      src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
      height={80}
      className="w-full rounded-xl border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}
