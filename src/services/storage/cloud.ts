// Supabase(PostgREST) 백업. 테이블 elo_state(id text pk, data jsonb, updated_at timestamptz).
// 인증 없이 anon key로 접근한다 — README의 보안 주의사항 참고.

import {
  parseSession,
  serializeSession,
  summarize,
  type SessionData,
  type SessionSummary,
} from '../../core/session/schema';
import type { Config } from '../config';

const TABLE = 'elo_state';

export interface CloudSummary extends SessionSummary {
  updatedAt: string | null;
}

async function request(cfg: Config, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  return type.includes('application/json') ? res.json() : null;
}

const rowFilter = (userId: string) => `id=eq.${encodeURIComponent(userId)}`;

type Row = { updated_at?: string; summary?: SessionSummary | null; data?: unknown };

/**
 * 저장된 세션의 요약만 가져온다 (전체 데이터는 수 MB가 될 수 있다).
 * 요약이 없는 v1 행이면 전체를 받아 계산한다. 행이 없으면 null.
 */
export async function fetchCloudSummary(cfg: Config, userId: string): Promise<CloudSummary | null> {
  const rows = (await request(cfg, `${TABLE}?${rowFilter(userId)}&select=updated_at,summary:data->summary`)) as Row[] | null;
  const row = rows?.[0];
  if (!row) return null;
  if (row.summary) return { ...row.summary, updatedAt: row.updated_at ?? null };
  const session = await loadCloudSession(cfg, userId);
  return session ? { ...summarize(session), updatedAt: row.updated_at ?? null } : null;
}

export async function loadCloudSession(cfg: Config, userId: string): Promise<SessionData | null> {
  const rows = (await request(cfg, `${TABLE}?${rowFilter(userId)}&select=data`)) as Row[] | null;
  return rows?.[0] ? parseSession(rows[0].data) : null;
}

export async function saveCloudSession(cfg: Config, userId: string, session: SessionData, retries = 2): Promise<void> {
  const body = JSON.stringify({
    id: userId,
    data: { ...serializeSession(session), summary: summarize(session) },
    updated_at: new Date().toISOString(),
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await request(cfg, TABLE, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body,
      });
      return;
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

export async function deleteCloudSession(cfg: Config, userId: string): Promise<void> {
  await request(cfg, `${TABLE}?${rowFilter(userId)}`, { method: 'DELETE' });
}
