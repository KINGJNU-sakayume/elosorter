import { Layers, Library, ListOrdered, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionData } from '../../core/session/schema';
import { fmtCount } from '../../lib/format';
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

export interface StepMeta {
  /** 화면에 보이는 짧은 표기 */
  text: string;
  /** 스크린리더·툴팁용 풀어 쓴 문장 */
  label: string;
}

/**
 * 사이드바에서 단계 이름 옆에 붙는 진행 상황: 티어 분류는 "분류한 곡/전체", 비교 정렬은 누적 횟수.
 * 숫자 하나만 두면 남은 곡인지 끝낸 곡인지 알 수 없어서 분수로 적는다.
 */
export function stepMeta(step: Phase, session: SessionData): StepMeta | null {
  const total = session.tracks.length;
  if (!total) return null;
  if (step === 'tier') {
    const done = session.tracks.filter(t => t.tier !== null).length;
    return { text: `${fmtCount(done)}/${fmtCount(total)}`, label: `${fmtCount(total)}곡 중 ${fmtCount(done)}곡 분류함` };
  }
  if (step === 'sort' && session.compCount > 0) {
    return { text: `${fmtCount(session.compCount)}회`, label: `비교 ${fmtCount(session.compCount)}회` };
  }
  return null;
}

/** 하단 탭 바의 티어 분류 탭에 붙는 미분류 곡 수 배지 */
export function untieredBadge(step: Phase, session: SessionData): string | null {
  if (step !== 'tier' || !session.tracks.length) return null;
  const n = session.tracks.filter(t => t.tier === null).length;
  return n ? (n > 999 ? '999+' : String(n)) : null;
}
