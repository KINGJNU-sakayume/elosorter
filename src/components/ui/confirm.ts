import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<Confirm>(async () => false);

/** 되돌리기 어려운 동작 전에 묻는다: `if (await confirm({...})) ...` */
export const useConfirm = (): Confirm => useContext(ConfirmContext);
