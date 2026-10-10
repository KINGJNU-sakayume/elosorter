import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /**
   * 키보드를 쓰는 기기(정밀 포인터)에서만 보인다.
   * 호출하는 쪽에서 `hidden pointer-fine:inline-flex`를 className으로 넘기면 아래의 기본 inline-flex가
   * 스타일시트에서 hidden보다 뒤에 와서 이겨 버린다(터치 기기에서도 보였다). 그래서 표시 방식은 여기서 하나만 정한다.
   */
  fineOnly?: boolean;
}

/** 단축키 표시 */
export default function Kbd({ children, className = '', fineOnly = false }: Props) {
  return (
    <kbd
      className={`${fineOnly ? 'hidden pointer-fine:inline-flex' : 'inline-flex'} h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-sub px-1 font-sans text-[11px] leading-none font-medium text-fg ${className}`}
    >
      {children}
    </kbd>
  );
}
