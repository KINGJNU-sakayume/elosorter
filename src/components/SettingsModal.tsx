import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { loadConfig, saveConfig } from '../services/config';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsModal({ open, onClose, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <SettingsForm onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}

const inputCls =
  'h-10 w-full rounded-[10px] bg-sub px-3 text-sm text-fg placeholder:text-fg-2 focus:ring-2 focus:ring-accent-line focus:outline-none';
const labelCls = 'mb-1.5 block text-[13px] font-semibold';
const helpCls = 'mt-1.5 text-xs leading-relaxed text-fg-2';

function validate(url: string, key: string): string | null {
  if (url && !key) return 'Supabase URL을 입력했다면 anon key도 함께 입력하세요';
  if (key && !url) return 'Supabase anon key를 입력했다면 URL도 함께 입력하세요';
  if (url) {
    try {
      if (new URL(url).protocol !== 'https:') return 'Supabase URL은 https://로 시작해야 합니다';
    } catch {
      return 'Supabase URL 형식이 올바르지 않습니다';
    }
  }
  return null;
}

/** 모달이 열릴 때마다 새로 마운트되어 저장된 값에서 시작한다 */
function SettingsForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const initial = loadConfig();
  const [clientId, setClientId] = useState(initial.clientId);
  const [supabaseUrl, setSupabaseUrl] = useState(initial.supabaseUrl);
  const [anonKey, setAnonKey] = useState(initial.anonKey);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = supabaseUrl.trim().replace(/\/+$/, '');
    const key = anonKey.trim();
    const problem = validate(url, key);
    if (problem) {
      setError(problem);
      return;
    }
    saveConfig({ clientId: clientId.trim(), supabaseUrl: url, anonKey: key });
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="settings-title" className="text-xl font-bold tracking-tight">설정</h2>
      <p className="mt-1 mb-5 text-[13px] leading-relaxed text-fg-2">
        보통은 배포 시 환경변수로 들어갑니다. 여기서 입력한 값은 이 브라우저에만 저장되어 환경변수보다 우선합니다.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="cfg-client" className={labelCls}>Spotify Client ID</label>
          <input id="cfg-client" className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="32자리 Client ID" autoComplete="off" spellCheck={false} />
          <p className={helpCls}>
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              developer.spotify.com
            </a>
            에서 앱을 만든 뒤 Redirect URI에 <code className="font-mono break-all text-fg">{initial.redirectUri}</code> 를 추가하세요.
          </p>
        </div>

        <div>
          <label htmlFor="cfg-url" className={labelCls}>Supabase URL <span className="font-normal text-fg-2">(선택)</span></label>
          <input id="cfg-url" className={inputCls} value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co" autoComplete="off" spellCheck={false} inputMode="url" />
        </div>

        <div>
          <label htmlFor="cfg-key" className={labelCls}>Supabase anon key <span className="font-normal text-fg-2">(선택)</span></label>
          <div className="relative">
            <input id="cfg-key" type={showKey ? 'text' : 'password'} className={`${inputCls} pr-11`} value={anonKey}
              onChange={e => setAnonKey(e.target.value)} placeholder="eyJhbGciOi…" autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setShowKey(v => !v)} aria-label={showKey ? 'anon key 숨기기' : 'anon key 보기'}
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-2 hover:text-fg">
              {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
          <p className={helpCls}>Supabase → Project Settings → API → anon public key. 비워 두면 이 브라우저에만 저장됩니다.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel}>취소</Button>
        <Button type="submit" variant="primary">저장</Button>
      </div>
    </form>
  );
}
