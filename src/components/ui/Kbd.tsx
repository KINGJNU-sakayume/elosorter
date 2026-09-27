import type { ReactNode } from 'react';

/** 단축키 표시. 키보드를 쓰는 기기에서만 보이게 하려면 호출하는 쪽에서 pointer-fine으로 감싼다 */
export default function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-sub px-1 font-sans text-[11px] leading-none font-medium text-fg ${className}`}
    >
      {children}
    </kbd>
  );
}
