import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  /** 제목 오른쪽 영역 */
  aside?: ReactNode;
  tone?: 'default' | 'accent' | 'danger' | 'warn';
  className?: string;
  children: ReactNode;
}

const TONE = {
  default: 'border-line bg-card',
  accent: 'border-accent-line bg-card',
  danger: 'border-danger-line bg-danger-soft',
  warn: 'border-warn-line bg-warn-soft',
};

export default function Card({ title, aside, tone = 'default', className = '', children }: CardProps) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${TONE[tone]} ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="font-mono text-[0.72rem] tracking-[0.08em] text-fg-3 uppercase">{title}</h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
