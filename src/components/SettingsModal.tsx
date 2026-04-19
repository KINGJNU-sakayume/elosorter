import { useState, useEffect, useRef } from 'react';
import { loadConfig, saveConfig } from '../utils/config';
import type { Config } from '../utils/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (cfg: Config) => void;
}

export default function SettingsModal({ open, onClose, onSave }: Props) {
  const [clientId, setClientId]       = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [anonKey, setAnonKey]         = useState('');
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const redirectUri = loadConfig().redirectUri;

  const dialogRef = useRef<HTMLDivElement>(null);
  // onClose는 부모에서 매 렌더마다 새 화살표로 전달될 수 있음.
  // 트랩 effect의 재실행(포커스 리셋)을 방지하기 위해 ref로 래핑.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) {
      const cfg = loadConfig();
      setClientId(cfg.clientId);
      setSupabaseUrl(cfg.supabaseUrl);
      setAnonKey(cfg.anonKey);
      setShowAnonKey(false);
      setError(null);
    }
  }, [open]);

  // Escape 닫기 + Tab 포커스 트랩 + 이전 포커스 복원
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const getFocusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.hasAttribute('disabled'));

    getFocusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = getFocusables();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const c = clientId.trim();
    const u = supabaseUrl.trim().replace(/\/$/, '');
    const k = anonKey.trim();

    // Supabase URL/anon key는 쌍으로만 의미가 있다
    if (u && !k) { setError('Supabase URL을 입력했다면 anon key도 함께 입력하세요'); return; }
    if (k && !u) { setError('Supabase anon key를 입력했다면 URL도 함께 입력하세요'); return; }
    // URL 형식 검사
    if (u) {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'https:') { setError('Supabase URL은 https://로 시작해야 합니다'); return; }
      } catch {
        setError('Supabase URL 형식이 올바르지 않습니다'); return;
      }
    }

    setError(null);
    const cfg = saveConfig({ clientId: c, supabaseUrl: u, anonKey: k });
    onSave(cfg);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-sub)', border: '1px solid var(--border-strong)',
    borderRadius: 8, color: 'var(--text-primary)',
    fontFamily: '"DM Mono", monospace', fontSize: '0.85rem',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
    marginBottom: 6, fontFamily: '"DM Mono", monospace',
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        style={{ background: 'var(--bg-section)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h2 id="settings-title" style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>⚙️ 설정</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          Spotify Developer Dashboard와 Supabase에서 발급받은 정보를 입력하세요.<br />
          한 번 입력하면 브라우저에 저장됩니다.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SPOTIFY_CLIENT_ID</label>
          <input style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.5 }}>
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>developer.spotify.com</a>에서 앱 생성 후 Client ID 복사<br />
            Redirect URI에 <strong style={{ color: 'var(--text-secondary)' }}>{redirectUri}</strong> 추가 필요
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SUPABASE_URL</label>
          <input style={inputStyle} value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SUPABASE_ANON_KEY</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showAnonKey ? 'text' : 'password'}
              style={{ ...inputStyle, paddingRight: 44 }}
              value={anonKey}
              onChange={e => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowAnonKey(v => !v)}
              aria-label={showAnonKey ? 'anon key 숨기기' : 'anon key 보기'}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', padding: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {showAnonKey ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 5 }}>Supabase → Settings → API → anon public key</p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 12, padding: '10px 14px',
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger-border)',
              borderRadius: 8, color: 'var(--danger-text)',
              fontSize: '0.8rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>취소</button>
          <button onClick={handleSave} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>저장</button>
        </div>
      </div>
    </div>
  );
}
