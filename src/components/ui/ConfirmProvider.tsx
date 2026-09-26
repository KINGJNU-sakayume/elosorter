import { useCallback, useState, type ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';
import { ConfirmContext, type ConfirmOptions } from './confirm';

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setRequest({ ...options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!request} onClose={() => close(false)} labelledBy="confirm-title">
        {request && (
          <>
            <h2 id="confirm-title" className="text-lg font-bold">{request.title}</h2>
            {request.message && (
              <div className="mt-2 text-sm leading-relaxed text-fg-2">{request.message}</div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => close(false)}>{request.cancelLabel ?? '취소'}</Button>
              <Button
                variant={request.tone === 'danger' ? 'danger' : 'primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {request.confirmLabel ?? '확인'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
