import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}

/**
 * 네이티브 <dialog> 모달. showModal()이 포커스 가두기, Esc 닫기, 배경 비활성화를 브라우저 수준에서 처리한다.
 * 닫혀 있을 때는 children을 그리지 않으므로 열 때마다 폼 상태가 새로 시작된다.
 */
export default function Modal({ open, onClose, labelledBy, children, className = '' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className={`m-auto max-h-[90dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line-strong bg-section p-0 text-fg shadow-card ${className}`}
    >
      {open && <div className="p-5 sm:p-6">{children}</div>}
    </dialog>
  );
}
