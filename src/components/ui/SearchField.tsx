import { Search } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}

export default function SearchField({ value, onChange, placeholder, label, className = '' }: Props) {
  return (
    <label className={`relative block ${className}`}>
      <Search size={15} strokeWidth={2.2} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg bg-sub pr-3 pl-8 text-sm text-fg placeholder:text-fg-2 focus:ring-2 focus:ring-accent-line focus:outline-none pointer-coarse:h-11 pointer-coarse:rounded-[10px] pointer-coarse:text-[15px]"
      />
    </label>
  );
}
