// 보드 타일 목록(manifest)을 Life Hub에 올린다: PUT /elosorter/v1/board (scope elosorter:board).
//
// 올리는 것은 보드용 목록뿐이다. 세션(곡·비교 기록) 자체는 올리지 않는다(그건 동기화 문서의 일).
// 목록은 core/board/tiles.ts의 buildBoardTiles(순수 함수)가 만들고, 이 모듈은 "언제, 올릴지 말지"만 정한다.
//  - 10분에 한 번 이하. 변화가 생기면 마지막 전송에서 10분이 지났으면 바로, 아니면 10분이 차는 때 한 번.
//  - 마지막으로 성공한 본문의 sha256(generated_at 뺀 것)과 같으면 보내지 않는다. 단, 앱을 열 때(start) 마지막 성공이
//    하루가 넘었으면 같아도 한 번 보낸다(보드의 '오래됨'은 Hub가 받은 시각 기준).
//  - '보낼 것 있음'·마지막 성공 sha·시각은 localStorage(개인 데이터 아님). 앱이 닫혀도 다음 실행에서 이어 보낸다.
//  - 올리지 않는 경우: 연결 안 됨, 분류한 곡이 하나도 없음, 동기화로 아직 맞춰 보지 않음(ready).
//  - 실패는 앱의 다른 기능을 막지 않는다(던지지 않는다). 권한 부족(insufficient_scope)이어도 토큰은 지우지 않는다.

import type { SessionData } from '../../core/session/schema';
import { buildBoardTiles, hasAnyRecord, type BoardManifest } from '../../core/board/tiles';
import type { HubSnapshot } from './engine';
import { boardRequest, connectedAt, isConnected, knownBoardScope, LifeHubError, type Deps } from './remote';

export const BOARD_STATE_KEY = 'elo:lifehub.board.v1';
export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const DAILY_MS = 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 64 * 1024;

export interface BoardState {
  /** 마지막으로 성공한 본문의 sha256(hex, generated_at 제외) */
  sha: string | null;
  lastOkAt: number | null;
  /** 마지막으로 요청을 보낸 시각(성공·실패 모두). 10분 제한의 기준 */
  lastSentAt: number | null;
  lastGeneratedAt: string | null;
  /** 보낼 것이 남아 있다(변화가 있었는데 아직 못 보냄) */
  pending: boolean;
  /** insufficient_scope: 다시 연결할 때까지 멈춘다(토큰은 그대로) */
  halt: 'no_scope' | null;
  /** 멈춘 시각. 그 뒤에 다시 연결했으면(connectedAt) 멈춤을 푼다 */
  haltedAt: number | null;
  /** 400/413으로 거절된 본문의 sha. 같은 내용으로 다시 보내지 않는다 */
  rejectedSha: string | null;
}

const EMPTY: BoardState = { sha: null, lastOkAt: null, lastSentAt: null, lastGeneratedAt: null, pending: false, halt: null, haltedAt: null, rejectedSha: null };

export function readBoardState(storage: Pick<Storage, 'getItem'>): BoardState {
  try {
    const raw = storage.getItem(BOARD_STATE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object') return { ...EMPTY };
    const o = v as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    const ms = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      sha: str(o.sha), lastOkAt: ms(o.lastOkAt), lastSentAt: ms(o.lastSentAt), lastGeneratedAt: str(o.lastGeneratedAt),
      pending: o.pending === true, halt: o.halt === 'no_scope' ? 'no_scope' : null, haltedAt: ms(o.haltedAt), rejectedSha: str(o.rejectedSha),
    };
  } catch {
    return { ...EMPTY };
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** 같은 내용이면 같은 해시: generated_at만 빼고 계산한다 */
export async function manifestHash(manifest: BoardManifest, sha256: Deps['sha256']): Promise<string> {
  const { generated_at: _ignored, ...rest } = manifest;
  void _ignored;
  return hex(await sha256(new TextEncoder().encode(JSON.stringify(rest))));
}

/**
 * 「동기화로 맞춘 뒤」 문. 이 기기의 세션이 Hub 동기화를 받아 합친 뒤의 상태일 때만 올린다:
 *  - 이번 실행에서 서버와 맞춰 봤고(checked) 서버에 더 새 문서(remote)·충돌(conflict)이 없을 때, 또는
 *  - 동기화 권한이 없는 연결(forbidden): 이 기기의 세션이 전부다.
 * 다른 Spotify 계정의 세션(blocked), 동기화 꺼짐(off), Spotify 로그인 전(아직 확인 못 함)에는 올리지 않는다.
 */
export function boardGateOpen(snap: Pick<HubSnapshot, 'connected' | 'status' | 'checked' | 'remote' | 'conflict'>): boolean {
  if (!snap.connected) return false;
  if (snap.status === 'forbidden') return true;
  if (snap.status === 'off' || snap.status === 'blocked') return false;
  return snap.checked && !snap.remote && !snap.conflict;
}

export type AttemptResult =
  | 'sent' | 'unchanged' | 'ignored' | 'skipped' | 'throttled' | 'rejected' | 'no_scope' | 'retry' | 'not_connected';

export interface BoardUploaderOptions {
  deps: Deps;
  getSession: () => SessionData;
  /** boardGateOpen(엔진 스냅숏). false면 아직 올리지 않는다 */
  ready: () => boolean;
  /** 다시 연결 안내가 필요한지 바뀌었을 때 */
  onState?: (s: { needsReconnect: boolean }) => void;
  /** Life Hub가 토큰을 거부해 연결이 끊겼을 때(기존 규칙: 401이 갱신 뒤에도 남거나 다른 403) */
  onNotConnected?: () => void;
  /** 400·413: 이 앱 쪽 버그. 개발자 콘솔에만 남긴다 */
  log?: (message: string) => void;
  /** fn은 그 시도의 Promise를 돌려준다 (테스트가 기다릴 수 있게) */
  setTimer?: (fn: () => unknown, ms: number) => () => void;
}

export function createBoardUploader(options: BoardUploaderOptions) {
  const { deps, getSession, ready } = options;
  const log = options.log ?? (message => console.error(message));
  const setTimer = options.setTimer ?? ((fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  });
  let running = false;
  /** 보내는 중에 들어온 시도: 끝난 뒤 10분이 차는 때 한 번 더 */
  let rerun = false;
  let cancelTimer: (() => void) | null = null;

  const read = () => readBoardState(deps.storage);
  /**
   * 권한 부족 멈춤이 풀렸는가: 새 토큰이 board scope를 가졌다고 알려졌거나, 멈춘 뒤에 다시 연결했다
   * (토큰 응답에 scope가 없어도 다시 연결하면 한 번은 시도한다. 여전히 권한이 없으면 다시 멈춘다).
   */
  const unhalted = (s: BoardState) => {
    const at = connectedAt(deps);
    return knownBoardScope(deps) || (at !== null && (s.haltedAt === null || at > s.haltedAt));
  };
  const write = (patch: Partial<BoardState>) => {
    try {
      deps.storage.setItem(BOARD_STATE_KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      /* 저장 실패는 전송을 막지 않는다 */
    }
    if ('halt' in patch) options.onState?.({ needsReconnect: (patch.halt ?? null) === 'no_scope' });
  };
  const arm = (ms: number, daily = false) => {
    cancelTimer?.();
    cancelTimer = setTimer(() => {
      cancelTimer = null;
      return attempt(daily);
    }, Math.max(1000, ms));
  };

  /**
   * 한 번 시도한다. daily: 마지막 성공이 하루가 넘었으면 내용이 같아도 보낸다(앱을 열 때만 true).
   * 던지지 않는다(앱의 다른 기능을 막지 않는다).
   */
  async function attempt(daily = false): Promise<AttemptResult> {
    if (running) {
      rerun = true;
      return 'skipped';
    }
    running = true;
    try {
      if (!isConnected(deps)) return 'skipped';
      let state = read();
      // 다시 연결해서 새 토큰이 board 권한을 가지면 멈춤을 푼다
      if (state.halt === 'no_scope' && unhalted(state)) {
        write({ halt: null, haltedAt: null });
        state = read();
      }
      if (state.halt) return 'no_scope';
      if (!ready()) return 'skipped';
      const session = getSession();
      if (!hasAnyRecord(session)) return 'skipped'; // 새 기기가 빈 목록으로 덮지 않게
      const now = deps.now();
      // 10분 제한을 목록을 만들기 전에 본다: 비교할 때마다 순위를 다시 계산하지 않게. 차는 때 한 번 다시 시도한다
      if (state.lastSentAt !== null && now - state.lastSentAt < MIN_INTERVAL_MS) {
        if (!state.pending) write({ pending: true });
        arm(state.lastSentAt + MIN_INTERVAL_MS - now, daily);
        return 'throttled';
      }
      const manifest = buildBoardTiles(session, now);
      // generated_at은 앞의 것보다 늘 커야 Hub가 받는다(기기 시계가 되돌아가도)
      const last = state.lastGeneratedAt ? Date.parse(state.lastGeneratedAt) : NaN;
      if (Number.isFinite(last) && last >= now) manifest.generated_at = new Date(last + 1000).toISOString();
      const sha = await manifestHash(manifest, deps.sha256);
      const stale = daily && (state.lastOkAt === null || now - state.lastOkAt >= DAILY_MS);
      if (sha === state.sha && !stale) {
        if (state.pending) write({ pending: false });
        return 'unchanged';
      }
      if (sha === state.rejectedSha) return 'rejected'; // 거절된 내용은 바뀌기 전까지 다시 보내지 않는다
      const body = JSON.stringify(manifest);
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
        log('[board] 보드 목록이 64 KiB를 넘어 올리지 않았어요.');
        write({ rejectedSha: sha, pending: false });
        return 'rejected';
      }
      cancelTimer?.();
      cancelTimer = null;
      // 보내기 전에 표시한다: 보내는 동안 또 바뀌면 notifyChange가 pending을 다시 세운다
      write({ lastSentAt: now, pending: false });
      let response: Response;
      try {
        response = await boardRequest(deps, body);
      } catch (e) {
        if (e instanceof LifeHubError && e.kind === 'no_board_scope') {
          write({ halt: 'no_scope', haltedAt: deps.now(), pending: true });
          return 'no_scope';
        }
        if (e instanceof LifeHubError && e.kind === 'not_connected') {
          options.onNotConnected?.();
          return 'not_connected';
        }
        write({ pending: true }); // 네트워크·토큰 서버 문제: 다음 기회에
        arm(MIN_INTERVAL_MS);
        return 'retry';
      }
      if (response.ok) {
        const parsed = (await response.json().catch(() => null)) as { ignored?: unknown } | null;
        write({ sha, lastOkAt: deps.now(), lastGeneratedAt: manifest.generated_at, rejectedSha: null });
        return parsed?.ignored === true ? 'ignored' : 'sent';
      }
      if (response.status === 400 || response.status === 413) {
        // 이 앱 쪽 버그이거나 기기 시계가 5분 넘게 빠름. 같은 내용으로 다시 보내지 않는다.
        log(`[board] Life Hub가 보드 목록을 받지 않았어요 (${response.status}).`);
        write({ rejectedSha: sha });
        return 'rejected';
      }
      write({ pending: true }); // 5xx 등: 다음 기회에
      arm(MIN_INTERVAL_MS);
      return 'retry';
    } catch {
      return 'retry';
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        // 이미 예약이 있으면 그것을 쓴다. 없으면 10분 창이 끝나는 때 (창 밖이면 곧바로)
        if (!cancelTimer) {
          const { lastSentAt } = read();
          arm(lastSentAt === null ? 0 : lastSentAt + MIN_INTERVAL_MS - deps.now());
        }
      }
    }
  }

  return {
    attempt,
    /** 타일에 영향을 줄 수 있는 변화. '보낼 것 있음'을 남기고 시도한다 */
    notifyChange(): Promise<AttemptResult> {
      if (!isConnected(deps)) return Promise.resolve('skipped');
      if (!read().pending) write({ pending: true });
      return attempt();
    },
    /** 앱을 열 때(그리고 동기화로 맞춘 직후): 남은 것과 하루 지난 것을 보낸다 */
    start(): Promise<AttemptResult> {
      return attempt(true);
    },
    needsReconnect: (): boolean => {
      const s = read();
      return s.halt === 'no_scope' && !unhalted(s);
    },
    dispose(): void {
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}

export type BoardUploader = ReturnType<typeof createBoardUploader>;
