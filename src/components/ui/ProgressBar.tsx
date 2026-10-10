interface ProgressBarProps {
  /** 0 ~ 1 */
  value: number;
  label: string;
  /** 채움 색 클래스 */
  barClass?: string;
  className?: string;
}

export default function ProgressBar({ value, label, barClass = 'bg-fg', className = '' }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-1 overflow-hidden rounded-full bg-sub ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
