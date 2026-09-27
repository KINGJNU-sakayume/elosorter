import { Layers, Library, ListOrdered, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionData } from '../../core/session/schema';
import type { Phase } from '../../state/reducer';

export interface Step {
  id: Phase;
  label: string;
  icon: LucideIcon;
  /** 들어갈 수 없을 때의 안내 */
  locked: string;
}

export const STEPS: readonly Step[] = [
  { id: 'import', label: '불러오기', icon: Library, locked: '' },
  { id: 'tier', label: '티어 분류', icon: Layers, locked: '먼저 곡을 불러오세요' },
  { id: 'sort', label: '비교 정렬', icon: Scale, locked: '티어를 2곡 이상 분류하면 열립니다' },
  { id: 'rank', label: '랭킹', icon: ListOrdered, locked: '티어를 분류하면 열립니다' },
];

export const stepLabel = (phase: Phase): string => STEPS.find(s => s.id === phase)?.label ?? '';

/** 티어 분류 단계에 붙는 미분류 곡 수 배지 */
export function untieredBadge(step: Phase, session: SessionData): string | null {
  if (step !== 'tier' || !session.tracks.length) return null;
  const n = session.tracks.filter(t => t.tier === null).length;
  return n ? (n > 999 ? '999+' : String(n)) : null;
}
