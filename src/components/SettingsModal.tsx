import { useState, useEffect } from 'react';
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
  const redirectUri = loadConfig().redirectUri;

  useEffect(() => {
    if (open) {
      const cfg = loadConfig();
      setClientId(cfg.clientId);
      setSupabaseUrl(cfg.supabaseUrl);
      setAnonKey(cfg.anonKey);
    }
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const cfg = saveConfig({ clientId: clientId.trim(), supabaseUrl: supabaseUrl.trim().replace(/\/$/, ''), anonKey: anonKey.trim() });
    onSave(cfg);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: '#1c1c2c', border: '1px solid #3a3a54',
    borderRadius: 8, color: '#f0f0f8',
    fontFamily: '"DM Mono", monospace', fontSize: '0.85rem',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', color: '#8899aa',
    marginBottom: 6, fontFamily: '"DM Mono", monospace',
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: '#0f0f1a', border: '1px solid #3a3a54', borderRadius: 20, padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>⚙️ 설정</h2>
        <p style={{ fontSize: '0.85rem', color: '#8899aa', marginBottom: 24, lineHeight: 1.6 }}>
          Spotify Developer Dashboard와 Supabase에서 발급받은 정보를 입력하세요.<br />
          한 번 입력하면 브라우저에 저장됩니다.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SPOTIFY_CLIENT_ID</label>
          <input style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          <p style={{ fontSize: '0.75rem', color: '#556070', marginTop: 5, lineHeight: 1.5 }}>
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#00e87a' }}>developer.spotify.com</a>에서 앱 생성 후 Client ID 복사<br />
            Redirect URI에 <strong style={{ color: '#8899aa' }}>{redirectUri}</strong> 추가 필요
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SUPABASE_URL</label>
          <input style={inputStyle} value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>SUPABASE_ANON_KEY</label>
          <input style={inputStyle} value={anonKey} onChange={e => setAnonKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
          <p style={{ fontSize: '0.75rem', color: '#556070', marginTop: 5 }}>Supabase → Settings → API → anon public key</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8899aa', cursor: 'pointer', fontSize: '0.875rem' }}>취소</button>
          <button onClick={handleSave} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#00e87a', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>저장</button>
        </div>
      </div>
    </div>
  );
}
