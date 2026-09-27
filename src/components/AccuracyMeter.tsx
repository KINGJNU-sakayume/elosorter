import { Info } from 'lucide-react';
import { fmtPercent } from '../lib/format';

const EXPLAIN =
  '임의의 두 곡을 골랐을 때 지금 순위의 앞뒤가 실제 취향과 맞을 확률의 추정치입니다. ' +
  '50%는 무작위, 100%는 순서가 완전히 확정된 상태입니다. 티어 분류만으로 보통 75% 안팎에서 시작해 비교할수록 올라갑니다.';

/** 예상 정확도 (정렬 신뢰도). v1의 "정렬 안정도"(최근 레이팅 변화량)를 대체한다 */
export default function AccuracyMeter({ value, className = '' }: { value: number | null; className?: string }) {
  const pct = value ?? 0;
  return (
    <div className={`flex items-center gap-3 ${className}`} title={EXPLAIN}>
      <span className="flex shrink-0 items-center gap-1 text-[13px] text-fg-2">
        예상 정확도 <Info size={13} className="text-fg-3" aria-hidden />
      </span>
      <div
        role="meter"
        aria-label="예상 정확도"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(pct * 1000) / 10}
        className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-sub"
      >
        <div className="h-full rounded-full bg-fg transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums">{value === null ? '—' : fmtPercent(value)}</span>
    </div>
  );
}
