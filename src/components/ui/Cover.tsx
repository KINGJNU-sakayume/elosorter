import { useState } from 'react';
import { Music } from 'lucide-react';

interface CoverProps {
  src?: string;
  /** 크기·위치는 호출하는 쪽에서 (예: "size-11 rounded-md", "absolute inset-0") */
  className?: string;
  /** 목록처럼 작은 이미지는 lazy 로딩 */
  lazy?: boolean;
}

/** 앨범 아트. 이미지가 없거나 깨지면 음표 아이콘 */
export default function Cover({ src, className = '', lazy = false }: CoverProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const ok = !!src && broken !== src;
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-sub ${className}`}>
      {ok ? (
        <img
          src={src}
          alt=""
          loading={lazy ? 'lazy' : undefined}
          decoding="async"
          draggable={false}
          onError={() => setBroken(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Music className="h-1/3 w-1/3 text-fg-3" aria-hidden />
      )}
    </div>
  );
}

/** 여러 곡의 앨범 아트를 2×2로 (Apple Music이 커버 없는 플레이리스트에 쓰는 방식). 4장이 안 되면 첫 장만 */
export function Mosaic({ images, className = '', lazy = false }: { images: readonly (string | undefined)[]; className?: string; lazy?: boolean }) {
  const list = images.filter((s): s is string => !!s);
  if (list.length < 4) return <Cover src={list[0]} className={className} lazy={lazy} />;
  return (
    <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-sub ${className}`}>
      {list.slice(0, 4).map((src, i) => <Cover key={i} src={src} lazy={lazy} className="h-full w-full" />)}
    </div>
  );
}
