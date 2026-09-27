import type { ReactNode } from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface Props<T extends string | number> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Apple의 세그먼트 컨트롤: 회색 바탕 위에 고른 칸만 떠 있는 흰(다크: 회색) 알약. 하나만 고르는 radiogroup */
export default function Segmented<T extends string | number>({ options, value, onChange, label, className = '' }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex shrink-0 rounded-[9px] bg-sub p-0.5 ${className}`}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex h-7 flex-1 items-center justify-center rounded-[7px] px-3 text-[13px] font-semibold whitespace-nowrap text-fg transition-[background-color,box-shadow] ${
              active ? 'bg-thumb shadow-thumb' : 'hover:bg-sub'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
