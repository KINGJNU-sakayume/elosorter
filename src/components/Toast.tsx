import { useEffect } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ToastTone } from '../state/context';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

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
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8"
    >
      {toast && (
        <div
          key={toast.id}
          className="flex max-w-md animate-rise items-center gap-2 rounded-2xl bg-toast px-4 py-2.5 text-sm font-medium text-toast-fg shadow-card backdrop-blur-xl"
        >
          {toast.tone === 'success' && <CircleCheck size={17} className="shrink-0 text-[#32d74b]" aria-hidden />}
          {toast.tone === 'error' && <CircleAlert size={17} className="shrink-0 text-[#ff6961]" aria-hidden />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
