import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** e.key → 바인딩 이름. 글자는 소문자, 스페이스바는 'Space' */
function hotkeyName(e: KeyboardEvent): string {
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/**
 * 전역 단축키. 다음 경우엔 무시한다:
 * - 키를 누르고 있어 반복 입력될 때 (v1은 1을 누르고 있으면 여러 곡이 연달아 분류됐다)
 * - Ctrl/⌘/Alt 조합 (Ctrl+1 탭 전환이 티어 분류로 새지 않게)
 * - 입력창에 입력 중일 때, 모달이 열려 있을 때
 * - 버튼에 포커스가 있을 때의 Space/Enter (버튼 자체 동작을 우선)
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('dialog[open]')) return;
      const key = hotkeyName(e);
      const handler = ref.current[key];
      if (!handler) return;
      if ((key === 'Space' || key === 'Enter') && target?.closest('button, a, [role="button"]')) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
