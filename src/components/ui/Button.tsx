import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import Kbd from './Kbd';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'border-line bg-transparent text-fg-2 hover:border-line-strong hover:bg-sub hover:text-fg',
  ghost: 'border-transparent bg-transparent text-fg-2 hover:bg-sub hover:text-fg',
  danger: 'border-danger-line bg-transparent text-danger hover:bg-danger-soft',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-6 text-base',
};

const ICON: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

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
      className={`inline-flex shrink-0 items-center justify-center border font-semibold whitespace-nowrap transition-[background-color,border-color,color,filter] disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading
        ? <LoaderCircle size={ICON[size]} className="animate-spin" aria-hidden />
        : Icon && <Icon size={ICON[size]} aria-hidden />}
      {children}
      {kbd && <span className="ml-1 hidden sm:inline-flex"><Kbd>{kbd}</Kbd></span>}
    </button>
  );
}
