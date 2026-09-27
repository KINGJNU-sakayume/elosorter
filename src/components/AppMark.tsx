import { useId } from 'react';

/** 앱 아이콘 (public/favicon.svg와 같은 그림): 순위처럼 짧아지는 막대 세 개 */
export default function AppMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5f76" />
          <stop offset="1" stopColor="#e0223c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill={`url(#${id})`} />
      <g fill="#fff">
        <rect x="16" y="18" width="32" height="7" rx="3.5" />
        <rect x="16" y="28.5" width="23" height="7" rx="3.5" fillOpacity=".8" />
        <rect x="16" y="39" width="14" height="7" rx="3.5" fillOpacity=".6" />
      </g>
    </svg>
  );
}
