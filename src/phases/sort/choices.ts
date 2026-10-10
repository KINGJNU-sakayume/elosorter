/**
 * 응답 5단계. v1은 점수 차에 따라 3단계(빠른)/5단계(세밀) 모드가 바뀌면서
 * 같은 키의 의미도 바뀌었다(3 = "B 선택" 또는 "비슷하다"). 이제 키 의미는 항상 같다.
 *
 * side·strength는 저울 모양을 정한다: 어느 곡 쪽인지, 그리고 얼마나 확실한지(2 = 확실히, 1 = 조금 더, 0 = 비슷함).
 */
export const CHOICES = [
  { score: 1, side: 'A', strength: 2, word: '확실히', label: 'A 확실히', keys: ['1', '←'] },
  { score: 0.75, side: 'A', strength: 1, word: '조금 더', label: 'A 조금 더', keys: ['2'] },
  { score: 0.5, side: null, strength: 0, word: '비슷함', label: '비슷함', keys: ['3', '↓'] },
  { score: 0.25, side: 'B', strength: 1, word: '조금 더', label: 'B 조금 더', keys: ['4'] },
  { score: 0, side: 'B', strength: 2, word: '확실히', label: 'B 확실히', keys: ['5', '→'] },
] as const;

export type Choice = (typeof CHOICES)[number];

export const CHOICE_HOTKEYS: Record<string, number> = {
  '1': 1, ArrowLeft: 1,
  '2': 0.75,
  '3': 0.5, ArrowDown: 0.5,
  '4': 0.25,
  '5': 0, ArrowRight: 0,
};

export interface Verdict {
  /** 이긴 쪽이 왼쪽 곡(a)인지. 비슷함이면 null */
  winner: 'a' | 'b' | null;
  /** "확실히" · "조금 더" · "비슷함" */
  word: string;
}

/** 기록된 점수(왼쪽 곡 기준)를 사람이 읽는 말로 */
export function verdictOf(score: number): Verdict {
  if (score === 0.5) return { winner: null, word: '비슷함' };
  const winner = score > 0.5 ? 'a' : 'b';
  const margin = Math.abs(score - 0.5);
  return { winner, word: margin >= 0.49 ? '확실히' : '조금 더' };
}
