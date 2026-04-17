import type { Config } from './types';

const CFG_KEY = 'eloConfig';

export function loadConfig(): Config {
  const base: Config = { clientId: '', supabaseUrl: '', anonKey: '', redirectUri: '' };
  const saved = localStorage.getItem(CFG_KEY);
  if (saved) {
    try { Object.assign(base, JSON.parse(saved)); } catch { /* ignore */ }
  }
  base.redirectUri = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  return base;
}

export function saveConfig(cfg: Omit<Config, 'redirectUri'>): Config {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  return loadConfig();
}

export function saveState(data: object) {
  try {
    localStorage.setItem('eloState', JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function loadState() {
  try {
    const raw = localStorage.getItem('eloState');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
