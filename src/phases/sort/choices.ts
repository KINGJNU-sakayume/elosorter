/**
 * 응답 5단계. v1은 점수 차에 따라 3단계(빠른)/5단계(세밀) 모드가 바뀌면서
 * 같은 키의 의미도 바뀌었다(3 = "B 선택" 또는 "비슷하다"). 이제 키 의미는 항상 같다.
 */
export const CHOICES = [
  { score: 1, label: 'A 확실히', short: 'A 확실', keys: ['1', '←'] },
  { score: 0.75, label: 'A 조금 더', short: 'A 조금', keys: ['2'] },
  { score: 0.5, label: '비슷함', short: '비슷', keys: ['3', '↓'] },
  { score: 0.25, label: 'B 조금 더', short: 'B 조금', keys: ['4'] },
  { score: 0, label: 'B 확실히', short: 'B 확실', keys: ['5', '→'] },
] as const;

export const CHOICE_HOTKEYS: Record<string, number> = {
  '1': 1, ArrowLeft: 1,
  '2': 0.75,
  '3': 0.5, ArrowDown: 0.5,
  '4': 0.25,
  '5': 0, ArrowRight: 0,
};
