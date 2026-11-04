import { TriangleAlert } from 'lucide-react';
import { useSyncSize } from '../hooks/useSyncSize';
import { fmtCount, fmtKiB } from '../lib/format';
import { useAppState } from '../state/context';

/**
 * 「동기화 문서 크기 / 한도」. Life Hub로 보내는 문서(압축하지 않은 JSON)의 UTF-8 크기를 보여 준다.
 * 한도(900 KiB)를 넘으면 자동 동기화를 하지 않는다 — 잘라 내거나 일부만 올리지 않는다.
 */
export default function SyncSize() {
  const { session } = useAppState();
  const size = useSyncSize(session);
  const ratio = size ? Math.min(1, size.bytes / size.limit) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">동기화 문서 크기 / 한도</span>
        <span className="text-[13px] tabular-nums" aria-live="polite">
          {!session.tracks.length
            ? '세션 없음'
            : size
              ? <><span className={size.tooLarge ? 'font-semibold text-danger' : ''}>{fmtKiB(size.bytes)}</span> / {fmtKiB(size.limit)}</>
              : '계산 중…'}
        </span>
      </div>
      {size && (
        <>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sub" role="presentation">
            <div className={`h-full rounded-full ${size.tooLarge ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-2">
            {fmtCount(session.tracks.length)}곡 · 비교 기록 {fmtCount(session.matches.length)}건 · {fmtCount(size.bytes)}바이트
            {size.tooLarge && (
              <span className="mt-1 flex items-start gap-1.5 text-danger">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
                너무 큼 — 한도를 넘어서 자동 동기화를 하지 않습니다. (JSON 백업 파일과 Supabase 백업은 그대로 쓸 수 있습니다.)
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
