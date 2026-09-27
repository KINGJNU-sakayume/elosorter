import type { Tier } from '../core/types';

export interface TierStyle {
  short: string;
  name: string;
  /** 분류 기준 설명 */
  hint: string;
  /** 글자색 */
  text: string;
  /** 옅은 바탕 (번호 배지, 티어 알약) */
  soft: string;
  /** 진한 채움 (흰 글자를 얹는 번호 배지) */
  fill: string;
}

// Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다
export const TIER_STYLE: Record<Tier, TierStyle> = {
  1: { short: 'T1', name: '최애', hint: '망설임 없이 좋은 곡', text: 'text-t1', soft: 'bg-t1-soft', fill: 'bg-t1-fill' },
  2: { short: 'T2', name: '선호', hint: '좋아하는 곡', text: 'text-t2', soft: 'bg-t2-soft', fill: 'bg-t2-fill' },
  3: { short: 'T3', name: '보통', hint: '그럭저럭', text: 'text-t3', soft: 'bg-t3-soft', fill: 'bg-t3-fill' },
};
