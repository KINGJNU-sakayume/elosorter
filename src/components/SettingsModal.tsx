import { useEffect, useState, type FormEvent } from 'react';
import { loadConfig, saveConfig } from '../services/config';
import { useTheme } from '../theme/context';
import type { Theme } from '../theme/context';
import Button from './ui/Button';
import LifeHubSync from './LifeHubSync';
import { LIFEHUB_SECTION_ID } from './lifeHubView';
import Modal from './ui/Modal';
import Segmented from './ui/Segmented';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: '다크' },
  { value: 'light', label: '라이트' },
];

interface Props {
  open: boolean;
  /** 'lifehub'이면 열리면서 Life Hub 섹션으로 스크롤한다 */
  focus?: 'lifehub' | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsModal({ open, focus = null, onClose, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <SettingsForm focus={focus} onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}

const inputCls =
  'h-10 w-full rounded-[10px] bg-sub px-3 text-sm text-fg placeholder:text-fg-2 focus:ring-2 focus:ring-accent-line focus:outline-none';
const labelCls = 'mb-1.5 block text-[13px] font-semibold';
const helpCls = 'mt-1.5 text-xs leading-relaxed text-fg-2';

/** 모달이 열릴 때마다 새로 마운트되어 저장된 값에서 시작한다 */
function SettingsForm({ focus, onCancel, onSaved }: { focus: 'lifehub' | null; onCancel: () => void; onSaved: () => void }) {
  const [initial] = useState(loadConfig);
  const [clientId, setClientId] = useState(initial.clientId);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (focus === 'lifehub') document.getElementById(LIFEHUB_SECTION_ID)?.scrollIntoView({ block: 'start' });
  }, [focus]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveConfig({ clientId: clientId.trim() });
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="settings-title" className="mb-5 text-xl font-bold tracking-tight">설정</h2>

      <div className="space-y-4">
        {/* 좁은 화면에서는 상단 바에 테마 버튼이 없어 여기서 바꾼다. 저장 버튼과 무관하게 바로 적용된다 */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold" aria-hidden>화면 테마</span>
          <Segmented label="화면 테마" options={THEMES} value={theme} onChange={setTheme} />
        </div>

        <LifeHubSync />

        <hr className="border-line" />

        {/* Client ID가 비어 있으면 처음부터 펼친다 (로그인 전 「설정 열기」로 들어온 경우 바로 입력할 수 있게) */}
        <details open={!initial.clientId}>
          <summary className="cursor-pointer text-[13px] font-semibold select-none">고급</summary>
          <p className="mt-2 mb-3 text-[13px] leading-relaxed text-fg-2">
            보통은 배포 시 환경변수로 들어갑니다. 여기서 입력한 값은 이 브라우저에만 저장되어 환경변수보다 우선합니다.
          </p>
          <label htmlFor="cfg-client" className={labelCls}>Spotify Client ID</label>
          <input id="cfg-client" className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="32자리 Client ID" autoComplete="off" spellCheck={false} />
          <p className={helpCls}>
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              developer.spotify.com
            </a>
            에서 앱을 만든 뒤 Redirect URI에 <code className="font-mono break-all text-fg">{initial.redirectUri}</code> 를 추가하세요.
          </p>
        </details>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel}>취소</Button>
        <Button type="submit" variant="primary">저장</Button>
      </div>
    </form>
  );
}
