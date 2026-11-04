import { parseSession, serializeSession, type SessionData } from '../../core/session/schema';

// v1과 같은 키를 그대로 쓴다: 기존 사용자의 세션을 자동으로 읽어 v2로 옮기기 위해.
const SESSION_KEY = 'eloState';
// v1 원본은 처음 옮길 때 한 번만 따로 보관 (자동으로 읽지는 않음)
const V1_BACKUP_KEY = 'eloState.v1-backup';
const UI_KEY = 'eloUi';
// Life Hub의 세션으로 바꾸기 직전의 이 기기 세션 (한 칸). 수동 백업 파일로 내려받을 수 있게 남긴다
const REPLACED_KEY = 'elo:replaced-session.v1';

export function loadLocalSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    const session = parseSession(json);
    const isV1 = session && typeof json === 'object' && json !== null && !('version' in json);
    if (isV1 && !localStorage.getItem(V1_BACKUP_KEY)) {
      try { localStorage.setItem(V1_BACKUP_KEY, raw); } catch { /* 용량 부족이면 백업 생략 */ }
    }
    return session;
  } catch {
    return null;
  }
}

/** 저장 실패(용량 초과 등) 시 false */
export function saveLocalSession(session: SessionData): boolean {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(serializeSession(session)));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(V1_BACKUP_KEY);
}

/** 화면 상태(마지막 단계, 비교 범위) — 세션 데이터와 달리 클라우드로 보내지 않는다 */
export function loadUiPrefs(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(UI_KEY) ?? '{}');
    return typeof v === 'object' && v !== null ? v : {};
  } catch {
    return {};
  }
}

export function saveUiPrefs(prefs: Record<string, unknown>): void {
  try { localStorage.setItem(UI_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
}

// ── 바꾸기 전 세션 보관 ──────────────────────────────────────────────────

/** 저장하지 못하면(용량 초과 등) false — 호출한 쪽이 파일로 내려받게 한다 */
export function stashReplacedSession(session: SessionData): boolean {
  try {
    localStorage.setItem(REPLACED_KEY, JSON.stringify({ ...serializeSession(session), replacedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function loadReplacedSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(REPLACED_KEY);
    return raw ? parseSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export const hasReplacedSession = (): boolean => {
  try { return localStorage.getItem(REPLACED_KEY) !== null; } catch { return false; }
};

export function clearReplacedSession(): void {
  try { localStorage.removeItem(REPLACED_KEY); } catch { /* 무시 */ }
}
