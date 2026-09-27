import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import Kbd from './Kbd';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

// 테두리 없이 채움으로 구분한다 (Apple 스타일): 키 컬러 채움 / 회색 채움 / 글자만
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent-fill text-accent-fg enabled:hover:brightness-110 enabled:active:brightness-95',
  secondary: 'bg-sub text-fg enabled:hover:bg-sub-strong',
  ghost: 'text-accent enabled:hover:bg-sub',
  danger: 'bg-sub text-danger enabled:hover:bg-danger-soft',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-[10px] px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-6 text-[15px]',
};

const ICON: Record<Size, number> = { sm: 15, md: 17, lg: 19 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  /** 단축키 표시 */
  kbd?: string;
  children?: ReactNode;
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  kbd,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-[background-color,color,filter,transform] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading
        ? <LoaderCircle size={ICON[size]} className="animate-spin" aria-hidden />
        : Icon && <Icon size={ICON[size]} strokeWidth={2.2} aria-hidden />}
      {children}
      {kbd && <Kbd className="ml-0.5 hidden pointer-fine:inline-flex">{kbd}</Kbd>}
    </button>
  );
}
