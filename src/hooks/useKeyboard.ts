import { useEffect } from 'react';
import type { Phase } from '../utils/types';

interface KeyboardOptions {
  phase: Phase;
  isFiveStep: boolean;        // true = fine(5단계), false = fast(3단계)
  isChoosing: boolean;
  onChoose: (score: number) => void;
  onAssignTier: (tier: 1 | 2 | 3) => void;
  onUndo: () => void;
}

export function useKeyboard({ phase, isFiveStep, isChoosing, onChoose, onAssignTier, onUndo }: KeyboardOptions) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (phase === 'tier') {
        if (e.key === '1') onAssignTier(1);
        else if (e.key === '2') onAssignTier(2);
        else if (e.key === '3') onAssignTier(3);
        else if (e.key.toLowerCase() === 'z') onUndo();
      }

      if (phase === 'sort') {
        // Undo는 isChoosing과 무관하게 허용
        if (e.key.toLowerCase() === 'z') { onUndo(); return; }
        if (isChoosing) return;

        if (isFiveStep) {
          // 세밀 비교 (fine): 1~5
          const map: Record<string, number> = { '1': 1.0, '2': 0.7, '3': 0.5, '4': 0.3, '5': 0.0 };
          if (e.key in map) onChoose(map[e.key]);
        } else {
          // 빠른 비교 (fast, 3단계): 1=A, 2=비슷, 3=B, 또는 방향키
          if (e.key === '1' || e.key === 'ArrowLeft') onChoose(1.0);
          else if (e.key === '2') onChoose(0.5);
          else if (e.key === '3' || e.key === 'ArrowRight') onChoose(0.0);
        }
      }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [phase, isFiveStep, isChoosing, onChoose, onAssignTier, onUndo]);
}
