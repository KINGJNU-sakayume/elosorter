import { useEffect } from 'react';
import type { ToastTone } from '../state/context';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const TONE: Record<ToastTone, string> = {
  info: 'border-line-strong',
  success: 'border-accent-line',
  error: 'border-danger-line',
};

export default function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDone, toast.tone === 'error' ? 5000 : 2800);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          className={`animate-rise max-w-md rounded-xl border bg-toast px-4 py-2.5 text-center text-sm text-toast-fg shadow-lg ${TONE[toast.tone]}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
