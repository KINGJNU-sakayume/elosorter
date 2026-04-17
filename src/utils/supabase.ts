import type { Config } from './types';

const SB_TABLE = 'elo_state';
const SB_ROW = 'main';

async function sbFetch(path: string, cfg: Config, method = 'GET', body?: object) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const txt = await res.text();
    throw new Error(txt);
  }
  if (res.status === 204 || method === 'DELETE') return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

export async function saveToSupabase(
  data: object,
  cfg: Config,
  retries = 2
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i <= retries; i++) {
    try {
      await sbFetch(SB_TABLE, cfg, 'POST', {
        id: SB_ROW,
        data: { ...data, savedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });
      return { ok: true };
    } catch (e) {
      if (i === retries) return { ok: false, error: String(e) };
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return { ok: false };
}

export async function loadFromSupabase(cfg: Config) {
  const rows = await sbFetch(`${SB_TABLE}?id=eq.${SB_ROW}&select=data,updated_at`, cfg);
  if (!rows?.length || !rows[0].data) return null;
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}

export async function checkCloudSession(cfg: Config) {
  try {
    const rows = await sbFetch(`${SB_TABLE}?id=eq.${SB_ROW}&select=data,updated_at`, cfg);
    if (rows?.length && rows[0].data) {
      return {
        exists: true,
        trackCount: rows[0].data.tracks?.length ?? 0,
        updatedAt: rows[0].updated_at,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

export async function deleteCloudSession(cfg: Config) {
  await sbFetch(`${SB_TABLE}?id=eq.${SB_ROW}`, cfg, 'DELETE');
}
