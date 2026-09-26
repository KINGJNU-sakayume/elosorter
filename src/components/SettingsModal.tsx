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
  'w-full rounded-lg border border-line-strong bg-sub px-3.5 py-2.5 font-mono text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none';
const labelCls = 'mb-1.5 block font-mono text-xs text-fg-2';
const helpCls = 'mt-1.5 text-xs leading-relaxed text-fg-3';

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
      <h2 id="settings-title" className="text-lg font-bold">설정</h2>
      <p className="mt-1 mb-5 text-sm leading-relaxed text-fg-2">
        보통은 배포 시 환경변수로 들어갑니다. 여기서 입력한 값은 이 브라우저에만 저장되어 환경변수보다 우선합니다.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="cfg-client" className={labelCls}>SPOTIFY_CLIENT_ID</label>
          <input id="cfg-client" className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="32자리 Client ID" autoComplete="off" spellCheck={false} />
          <p className={helpCls}>
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              developer.spotify.com
            </a>
            에서 앱을 만든 뒤 Redirect URI에 <code className="break-all text-fg-2">{initial.redirectUri}</code> 를 추가하세요.
          </p>
        </div>

        <div>
          <label htmlFor="cfg-url" className={labelCls}>SUPABASE_URL <span className="text-fg-3">(선택)</span></label>
          <input id="cfg-url" className={inputCls} value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co" autoComplete="off" spellCheck={false} inputMode="url" />
        </div>

        <div>
          <label htmlFor="cfg-key" className={labelCls}>SUPABASE_ANON_KEY <span className="text-fg-3">(선택)</span></label>
          <div className="relative">
            <input id="cfg-key" type={showKey ? 'text' : 'password'} className={`${inputCls} pr-11`} value={anonKey}
              onChange={e => setAnonKey(e.target.value)} placeholder="eyJhbGciOi…" autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setShowKey(v => !v)} aria-label={showKey ? 'anon key 숨기기' : 'anon key 보기'}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:text-fg">
              {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
          <p className={helpCls}>Supabase → Project Settings → API → anon public key. 비워 두면 이 브라우저에만 저장됩니다.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-2.5 text-sm text-danger-fg">
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
