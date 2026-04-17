import { useEffect } from 'react';
import type { Phase } from '../utils/types';

interface KeyboardOptions {
  phase: Phase;
  isFiveStep: boolean;
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

      if (phase === 'sort' && !isChoosing) {
        if (isFiveStep) {
          const map: Record<string, number> = { '1': 1.0, '2': 0.7, '3': 0.5, '4': 0.3, '5': 0.0 };
          if (e.key in map) onChoose(map[e.key]);
        } else {
          if (['ArrowLeft', 'a', '1'].includes(e.key)) onChoose(1.0);
          else if (['ArrowRight', 'd', '2'].includes(e.key)) onChoose(0.0);
        }
      }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [phase, isFiveStep, isChoosing, onChoose, onAssignTier, onUndo]);
}
