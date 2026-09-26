import type { Tier } from '../core/types';

export interface TierStyle {
  short: string;
  name: string;
  /** 분류 기준 설명 */
  hint: string;
  text: string;
  soft: string;
  line: string;
  bar: string;
  hoverSoft: string;
}

// Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다
export const TIER_STYLE: Record<Tier, TierStyle> = {
  1: {
    short: 'T1', name: '최애', hint: '망설임 없이 좋은 곡 · 권장 약 10%',
    text: 'text-t1', soft: 'bg-t1-soft', line: 'border-t1-line', bar: 'bg-t1', hoverSoft: 'hover:bg-t1-soft',
  },
  2: {
    short: 'T2', name: '선호', hint: '좋아하는 곡 · 권장 약 40%',
    text: 'text-t2', soft: 'bg-t2-soft', line: 'border-t2-line', bar: 'bg-t2', hoverSoft: 'hover:bg-t2-soft',
  },
  3: {
    short: 'T3', name: '보통', hint: '그럭저럭 · 권장 약 50%',
    text: 'text-t3', soft: 'bg-t3-soft', line: 'border-t3-line', bar: 'bg-t3', hoverSoft: 'hover:bg-t3-soft',
  },
};
