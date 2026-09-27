import { useRef } from 'react';
import { FileDown, FileUp } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/confirm';
import { errorMessage, fmtCount } from '../../lib/format';
import { exportBackup, readBackup } from '../../services/download';
import { useAppDispatch, useAppState, useToast } from '../../state/context';

/** Supabase 없이도 기기 간 이동·보관이 가능하도록 JSON 백업 (백업 묶음의 한 줄) */
export default function FileBackup() {
  const { session } = useAppState();
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const hasSession = session.tracks.length > 0;

  const importFile = async (file: File) => {
    try {
      const backup = await readBackup(file);
      if (hasSession) {
        const ok = await confirm({
          title: '백업 파일로 바꿀까요?',
          message: `지금 세션(${fmtCount(session.tracks.length)}곡)이 백업(${fmtCount(backup.tracks.length)}곡 · 비교 ${fmtCount(backup.compCount)}회)으로 바뀝니다.`,
          confirmLabel: '불러오기',
        });
        if (!ok) return;
      }
      dispatch({ type: 'hydrate', session: backup, origin: 'file' });
      toast(`백업에서 ${fmtCount(backup.tracks.length)}곡을 불러왔습니다`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-4 @sm:flex-row @sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold">백업 파일</h3>
        <p className="mt-0.5 text-[13px] text-fg-2">세션 전체(티어·비교 기록)를 JSON 파일로 내려받거나 다시 불러옵니다.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" icon={FileDown} disabled={!hasSession} onClick={() => exportBackup(session)}>
          내려받기
        </Button>
        <Button size="sm" icon={FileUp} onClick={() => input.current?.click()}>
          불러오기
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
    </div>
  );
}
