// 이 기기의 Life Hub 동기화 설정과 진행 상태 (localStorage 'elo:lifehub.sync.v1').
// 세션 자체(syncVersion 포함)는 세션 저장소에 있고, 여기에는 세션이 아닌 것만 둔다.

import type { Deps } from './remote';

export const STATE_KEY = 'elo:lifehub.sync.v1';

/** 보내는 중에 응답을 받지 못한 쓰기. 다음에 보내기 전에 서버 meta의 sha256과 비교한다 */
export interface PendingWrite {
  /** 보낸 본문(UTF-8 바이트)의 SHA-256 */
  sha256: string;
  /** 그때의 If-Match 기준 (null = If-None-Match: *) */
  base: number | null;
  /** 보낸 세션 내용의 해시 (syncedKey와 같은 종류) */
  key: string;
}

export interface HubState {
  /** 이 기기에서 Life Hub 동기화를 켰는가 */
  enabled: boolean;
  /**
   * Life Hub에 쓰기가 한 번이라도 성공했는가. enabled이면서 true이면 그 뒤로 Supabase elo_state에 쓰지 않는다.
   * (읽기만 하거나 문서를 받아 온 것은 성공으로 치지 않는다: 쓰기 경로가 실제로 되는지 확인된 것이 아니므로.)
   */
  everSucceeded: boolean;
  /** 마지막으로 맞춘 시각 (ms) */
  lastSyncAt: number | null;
  /** 마지막으로 서버와 같다고 확인한 세션 내용의 해시. 지금 내용의 해시와 다르면 보내지 않은 변경이 있다 */
  syncedKey: string | null;
  /** 직접 정한 기기 이름. null이면 브라우저·OS로 만든 기본값 */
  deviceLabel: string | null;
  pending: PendingWrite | null;
}

export const DEFAULT_STATE: HubState = {
  enabled: false, everSucceeded: false, lastSyncAt: null, syncedKey: null, deviceLabel: null, pending: null,
};

export function readState(storage: Deps['storage']): HubState {
  try {
    const raw = JSON.parse(storage.getItem(STATE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
    const p = raw.pending as Record<string, unknown> | null | undefined;
    const pending: PendingWrite | null = p && typeof p === 'object' && typeof p.sha256 === 'string' && typeof p.key === 'string'
      && (p.base === null || (typeof p.base === 'number' && Number.isSafeInteger(p.base)))
      ? { sha256: p.sha256, base: p.base as number | null, key: p.key }
      : null;
    return {
      enabled: raw.enabled === true,
      everSucceeded: raw.everSucceeded === true,
      lastSyncAt: typeof raw.lastSyncAt === 'number' && Number.isFinite(raw.lastSyncAt) ? raw.lastSyncAt : null,
      syncedKey: typeof raw.syncedKey === 'string' ? raw.syncedKey : null,
      deviceLabel: typeof raw.deviceLabel === 'string' ? raw.deviceLabel : null,
      pending,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function updateState(storage: Deps['storage'], patch: Partial<HubState>): HubState {
  const next = { ...readState(storage), ...patch };
  try {
    storage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    /* 저장하지 못해도 이번 동작은 끝났다. 다음에 다시 확인한다 */
  }
  return next;
}

/** Life Hub 동기화가 켜져 있고 쓰기가 한 번이라도 성공했는가 → Supabase elo_state에 쓰지 않는다 */
export const stopsSupabaseWrites = (storage: Deps['storage']): boolean => {
  const s = readState(storage);
  return s.enabled && s.everSucceeded;
};

// ── 기기 이름 (X-Device-Label) ──────────────────────────────────────────

/** 출력 가능한 ASCII(0x20–0x7E) 1~40자. 쓸 수 있는 글자가 없으면 null — 그러면 헤더를 보내지 않는다 */
export function sanitizeDeviceLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const label = value.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 40).trim();
  return label === '' ? null : label;
}

/** "Chrome on Android" 같은 기본 이름 (user-agent에서) */
export function defaultDeviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /OPR\/|Opera/.test(userAgent) ? 'Opera' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const os = /iPhone/.test(userAgent) ? 'iPhone' : /iPad/.test(userAgent) ? 'iPad' : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS' : /CrOS/.test(userAgent) ? 'ChromeOS'
      : /Linux/.test(userAgent) ? 'Linux' : '';
  return sanitizeDeviceLabel(os ? `${browser} on ${os}` : browser) ?? 'Browser';
}
