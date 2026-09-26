import { TIERS } from '../../core/types';
import { TARGET_SHARE, type TierCounts } from '../../core/rating/priors';
import { TIER_STYLE } from '../../components/tiers';
import { fmtCount, fmtPercent } from '../../lib/format';

/** 분류된 곡의 티어 비율과 권장 비율 비교 */
export default function TierDistribution({ counts }: { counts: TierCounts }) {
  const done = counts[1] + counts[2] + counts[3];
  const share = (n: number) => (done ? n / done : 0);

  return (
    <section className="rounded-2xl border border-line bg-section p-4" aria-labelledby="dist-title">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="dist-title" className="font-mono text-[0.72rem] tracking-[0.08em] text-fg-3 uppercase">분류 현황</h2>
        <span className="font-mono text-xs text-fg-2">{fmtCount(done)}곡</span>
      </div>

      <div className="relative">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-sub">
          {TIERS.map(tier => (
            <div key={tier} className={`${TIER_STYLE[tier].bar} transition-[width] duration-300`} style={{ width: `${share(counts[tier]) * 100}%` }} />
          ))}
        </div>
        {/* 권장 비율 경계: Tier 1 | Tier 2 = 10%, Tier 2 | Tier 3 = 50% */}
        {[TARGET_SHARE[1], TARGET_SHARE[1] + TARGET_SHARE[2]].map(x => (
          <div key={x} className="absolute -top-1 -bottom-1 w-0.5 rounded bg-fg/50" style={{ left: `${x * 100}%` }} aria-hidden />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {TIERS.map(tier => (
          <li key={tier} className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${TIER_STYLE[tier].bar}`} aria-hidden />
            <span className={TIER_STYLE[tier].text}>Tier {tier} {TIER_STYLE[tier].name}</span>
            <span className="ml-auto font-mono text-xs text-fg-2">
              {fmtCount(counts[tier])}곡 · {fmtPercent(share(counts[tier]), 0)}
              <span className="text-fg-3"> / 권장 {fmtPercent(TARGET_SHARE[tier], 0)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-fg-3">
        권장 비율은 가이드일 뿐입니다. 실제로 나눈 비율에 맞춰 티어별 시작 점수가 자동으로 조정되니 억지로 맞출 필요는 없습니다.
      </p>
    </section>
  );
}
