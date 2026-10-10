import type { Tier } from '../core/types';

export interface TierStyle {
  short: string;
  name: string;
  /** 분류 기준 설명 */
  hint: string;
  /** 바탕 (번호 배지, 티어 알약, 분포 막대). 남색 한 계열에서 티어가 높을수록 진하다 */
  fill: string;
  /** 그 바탕 위에 얹는 글자색 */
  on: string;
}

// Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다
export const TIER_STYLE: Record<Tier, TierStyle> = {
  1: { short: 'T1', name: '최애', hint: '망설임 없이 좋은 곡', fill: 'bg-t1', on: 'text-t1-on' },
  2: { short: 'T2', name: '선호', hint: '좋아하는 곡', fill: 'bg-t2', on: 'text-t2-on' },
  3: { short: 'T3', name: '보통', hint: '그럭저럭', fill: 'bg-t3', on: 'text-t3-on' },
};
