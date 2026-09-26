export function fmtDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

export const fmtCount = (n: number): string => n.toLocaleString('ko-KR');

export const fmtPercent = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
