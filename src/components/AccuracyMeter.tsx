import { fmtPercent } from '../lib/format';

/** 막대가 시작하는 값. 무작위로 줄 세워도 두 곡의 순서는 절반은 맞으므로 그 아래는 그리지 않는다 */
const FLOOR = 0.5;

const EXPLAIN =
  '임의의 두 곡을 골랐을 때 지금 순위의 앞뒤가 실제 취향과 맞을 확률의 추정치입니다. ' +
  '막대는 50%(무작위)부터 100%(순서가 완전히 확정)까지이고, 세로 눈금은 티어 분류만 했을 때의 값입니다. ' +
  '비교할수록 눈금에서 오른쪽으로 멀어집니다.';

/** 50~100% 구간에서의 위치 (0~100) */
function position(x: number): number {
  return Math.min(1, Math.max(0, (x - FLOOR) / (1 - FLOOR))) * 100;
}

interface Props {
  value: number | null;
  /** 티어 분류만 했을 때의 예상 정확도 (engine의 tierOnlyAccuracy). 눈금과 "비교로 +N%p"의 기준 */
  baseline?: number | null;
  className?: string;
}

/**
 * 예상 정확도 (정렬 신뢰도). v1의 "정렬 안정도"(최근 레이팅 변화량)를 대체한다.
 * 0~100%로 그리면 티어 분류만으로도 막대의 3/4이 차서 비교의 성과가 끝자락에 몰린다.
 * 그래서 의미 있는 구간(50~100%)만 그리고, 분류만 했을 때의 위치를 눈금으로 남긴다.
 */
export default function AccuracyMeter({ value, baseline = null, className = '' }: Props) {
  const gain = value !== null && baseline !== null ? value - baseline : null;
  return (
    <div className={`flex flex-col gap-[7px] ${className}`} title={EXPLAIN}>
      <div className="flex items-baseline gap-2 text-[13px] leading-none whitespace-nowrap">
        <span className="text-fg-2">예상 정확도</span>
        <span className="text-[15px] font-bold tabular-nums">{value === null ? '—' : fmtPercent(value)}</span>
        {gain !== null && gain >= 0.0005 && (
          <span className="ml-auto text-xs text-fg-2 tabular-nums">
            <span className="max-sm:sr-only">비교로 </span>+{(gain * 100).toFixed(1)}%p
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label="예상 정확도"
        aria-valuemin={FLOOR * 100}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value * 1000) / 10}
        aria-valuetext={value === null
          ? '아직 계산할 수 없음'
          : `${fmtPercent(value)}${baseline !== null ? `, 티어 분류만 했을 때 ${fmtPercent(baseline)}` : ''}`}
        className="relative h-3"
      >
        <span className="absolute inset-x-0 top-1 h-1 rounded-full bg-sub" />
        {value !== null && (
          <span
            className="absolute top-1 left-0 h-1 rounded-full bg-fg transition-[width] duration-500"
            style={{ width: `${position(value)}%` }}
          />
        )}
        {baseline !== null && (
          <span
            className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-[1px] bg-fg-2 ring-2 ring-page"
            style={{ left: `${position(baseline)}%` }}
          />
        )}
      </div>
    </div>
  );
}
