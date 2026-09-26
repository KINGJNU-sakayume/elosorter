import type { ReactNode } from 'react';

export default function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex min-w-5 items-center justify-center rounded border border-line bg-sub px-1 font-mono text-[0.68rem] leading-4 font-medium text-fg-3 ${className}`}
    >
      {children}
    </kbd>
  );
}
