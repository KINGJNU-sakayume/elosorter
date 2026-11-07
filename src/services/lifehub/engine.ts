// Life Hub 동기화 엔진: "언제·무엇을 보낼지" 판단과 충돌 모델 (life-hub docs/P6_SYNC.md 6·7절).
//
// elosorter의 세션은 한 번에 한 기기에서 고쳐 쓰는 문서 하나라서, 병합 없이 기존 충돌 모델을 쓰되
// savedAt·syncedAt 비교 대신 서버 version을 쓴다:
//  - 세션의 syncVersion = 이 기기 사본이 기반한 서버 version. 쓰기는 If-Match: "<syncVersion>",
//    서버에 문서가 없으면 If-None-Match: * (protocol.ts).
//  - 서버 version이 syncVersion과 다르면 다른 기기가 쓴 것이다.
//      · 이 기기에 보내지 않은 변경이 없으면 → 'remote': 요약을 보여 주고 고르게 한다 (자동으로 바꾸지 않는다).
//      · 보내지 않은 변경이 있으면 → 'conflict': "클라우드 것 쓰기 / 이 기기로 덮어쓰기"를 묻는다.
//    conflict에서는 절대 자동 업로드하지 않는다.
//  - 덮어쓰기는 conflict가 보여준 서버 version으로 If-Match를 건다 → 그 사이 또 다른 쓰기가 있으면 다시 conflict.
//  - 클라우드 것 쓰기는 GET으로 받은 문서를 parseSession으로 검사한 뒤에만 바꾸고, 바꾸기 전 로컬 세션은 따로 남긴다.
//  - ownerId(Spotify 사용자 id)가 다르면 'blocked': 올리지 않는다.
//  - 폴링은 없다: 앱 시작과 탭이 다시 보일 때(check), 변경 뒤(push)에만 요청한다. 타이머는 호출하는 쪽(훅)이 정한다.
// 오류 문구에는 고정 문구와 상태 코드만 넣는다.

import { summarize, type SessionData, type SessionSummary } from '../../core/session/schema';
import { SYNC_LIMIT_BYTES, serializeSyncBody, syncContentKey, syncSizeOfBody } from '../../core/session/syncDoc';
import { getDocument, getMeta, putDocument, sha256Hex, type Failure, type RemoteMeta } from './protocol';
import { isConnected, mayHaveSyncScope, type Deps } from './remote';
import { defaultDeviceLabel, readState, sanitizeDeviceLabel, updateState, type PendingWrite } from './state';

export type HubStatus =
  | 'off'        // 꺼짐 (켜지 않았거나 연결되지 않음)
  | 'idle'       // 켜짐
  | 'saving'     // 저장 중
  | 'conflict'   // 충돌: 고를 때까지 올리지 않는다
  | 'blocked'    // 다른 Spotify 계정의 세션
  | 'error'      // 오류: 재시도하지 않는다 (400·415·428 등)
  | 'forbidden'  // 권한 없음 (동기화 scope)
  | 'retry'      // 나중에 재시도 (네트워크·5xx)
  | 'too_large'; // 너무 큼

/** 서버 문서 요약 (충돌·"클라우드가 더 새로움" 안내용) */
export interface RemoteInfo {
  version: number;
  writtenAt: string;
  device: string | null;
  sizeBytes: number | null;
  /** 문서를 받아 오지 못했으면 null */
  summary: SessionSummary | null;
}

export interface HubSnapshot {
  status: HubStatus;
  enabled: boolean;
  connected: boolean;
  everSucceeded: boolean;
  lastSyncAt: number | null;
  /** 서버에 이 기기보다 새 문서가 있다 (보내지 않은 변경은 없음) */
  remote: RemoteInfo | null;
  /** 서버에 다른 문서가 있고 이 기기에도 보내지 않은 변경이 있다 */
  conflict: RemoteInfo | null;
  /** 상태 코드와 고정 문구만 */
  detail: string | null;
  deviceLabel: string | null;
  effectiveLabel: string;
  /**
   * 이번 실행에서 서버와 한 번이라도 맞춰 봤다 (meta 확인·업로드·받아오기 성공). 메모리에만 둔다.
   * 보드 업로드는 이것이 true이고 remote·conflict가 없을 때만 한다: 받기 전의 옛 상태를 올리지 않게.
   */
  checked: boolean;
}

export interface HubHost {
  /** 지금 앱이 들고 있는 세션 */
  session(): SessionData;
  revision(): number;
  /** Life Hub에 아직 올라가지 않은 변경 수 */
  unsaved(): number;
  /** 로그인한 Spotify 사용자 id. 로그아웃 상태면 null */
  userId(): string | null;
  /** 대기 중인 로컬 저장을 바로 하고 저장 시각을 돌려준다 */
  flushLocal(): string | null;
  /** 업로드 성공: 이 version을 기준으로 삼고, 보낸 시점(revision)까지의 변경은 올라갔다 */
  saved(info: { version: number; revision: number }): void;
  /** 기준 version만 바꾼다 (내용은 그대로) */
  rebase(version: number): void;
  /** 로컬 세션을 서버 문서로 바꾼다. session.syncVersion은 이미 서버 version이다 */
  adopt(session: SessionData): void;
  /** 바꾸기 전 로컬 세션을 수동 백업으로 내려받을 수 있게 남긴다 */
  stash(session: SessionData): void;
  /** 보낼 변경이 있다고 표시해 업로드를 예약한다 */
  markDirty(): void;
}

export type PushOutcome = 'ok' | 'skipped' | 'conflict' | 'too_large' | 'no_permission' | 'not_connected' | 'error' | 'retry';
export type PushMode = 'auto' | 'manual' | 'overwrite';
export type LoadCloudOutcome = 'ok' | 'none' | 'too_large' | 'no_permission' | 'not_connected' | 'error' | 'retry' | 'skipped';

export interface EngineOptions {
  deps: Deps;
  host: HubHost;
  userAgent?: string;
}

type Halt = 'too_large' | 'no_permission' | 'error';

export function createHubEngine({ deps, host, userAgent = '' }: EngineOptions) {
  const listeners = new Set<() => void>();
  let snapshot: HubSnapshot | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let saving = false;
  let halt: Halt | null = null;
  let haltStatus: number | null = null;
  /** 이 기기의 문서가 한도를 넘는다 (요청 없이 판단). 서버가 413을 준 것(halt)과 다르게, 다음 시도 때 다시 잰다 */
  let oversize = false;
  let retry = false;
  let conflict: RemoteInfo | null = null;
  let remote: RemoteInfo | null = null;
  /** 서버에 문서가 없는데 이 기기에는 있다: 내용이 그대로여도 다시 만들어야 한다 */
  let recreate = false;
  /** 이번 실행에서 서버와 맞춰 봤다 (HubSnapshot.checked) */
  let checked = false;

  const state = () => readState(deps.storage);
  const effectiveLabel = () => sanitizeDeviceLabel(state().deviceLabel) ?? defaultDeviceLabel(userAgent);
  const keyOf = (s: SessionData) => sha256Hex(deps, syncContentKey(s));

  const isBlocked = () => {
    const owner = host.session().ownerId;
    const user = host.userId();
    return !!(user && owner && owner !== user);
  };

  /** 요청을 보내도 되는 상태인가 (Spotify 로그인 + Life Hub 연결·허용 + 켜짐 + 내 세션) */
  const ready = () => state().enabled && isConnected(deps) && mayHaveSyncScope(deps) && host.userId() !== null && !isBlocked();

  const detailFor = (status: HubStatus): string | null => {
    switch (status) {
      case 'forbidden': return '권한 없음 — 다시 연결하면서 동기화를 허용해 주세요.';
      case 'too_large': return halt === 'too_large'
        ? 'Life Hub가 문서 크기를 받아들이지 않았어요 (413). 자동 동기화를 멈췄어요.'
        : `동기화 문서가 한도(${Math.round(SYNC_LIMIT_BYTES / 1024)} KiB)를 넘어 자동 동기화를 하지 않아요.`;
      case 'error': return haltStatus === null ? 'Life Hub의 문서를 읽을 수 없어요.' : `요청이 거절됐어요 (상태 ${haltStatus}). 자동 재시도를 멈췄어요.`;
      case 'retry': return '네트워크나 서버 문제로 저장하지 못했어요. 이 기기의 세션은 그대로이고 나중에 다시 시도해요.';
      case 'blocked': return '다른 Spotify 계정의 세션이라 올리지 않아요.';
      case 'conflict': return '서버에 다른 버전이 있어 자동 저장을 멈췄어요. 어느 쪽을 쓸지 골라 주세요.';
      case 'idle': return state().enabled && host.userId() === null ? 'Spotify에 로그인하면 동기화를 시작해요.' : null;
      default: return null;
    }
  };

  const compute = (): HubSnapshot => {
    const st = state();
    const connected = isConnected(deps);
    let status: HubStatus;
    if (!st.enabled || !connected) status = 'off';
    else if (isBlocked()) status = 'blocked';
    else if (conflict) status = 'conflict';
    else if (halt === 'no_permission' || !mayHaveSyncScope(deps)) status = 'forbidden';
    else if (halt === 'too_large' || oversize) status = 'too_large';
    else if (halt === 'error') status = 'error';
    else if (saving) status = 'saving';
    else if (retry) status = 'retry';
    else status = 'idle';
    return {
      status, enabled: st.enabled, connected, everSucceeded: st.everSucceeded, lastSyncAt: st.lastSyncAt,
      remote, conflict, detail: detailFor(status), deviceLabel: st.deviceLabel, effectiveLabel: effectiveLabel(),
      checked,
    };
  };

  const notify = () => {
    const next = compute();
    if (snapshot && JSON.stringify(snapshot) === JSON.stringify(next)) return;
    snapshot = next;
    listeners.forEach(l => l());
  };

  /** 한 번에 하나씩. 앞의 작업이 실패해도 다음 작업은 한다 */
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const info = (meta: RemoteMeta, session: SessionData | null): RemoteInfo => ({
    version: meta.version, writtenAt: meta.writtenAt, device: meta.device, sizeBytes: meta.sizeBytes,
    summary: session ? summarize(session) : null,
  });

  /** 요청 실패를 상태로 바꾸고 결과 이름을 돌려준다. 로컬 세션은 건드리지 않는다 */
  const fail = (f: Failure): Exclude<PushOutcome, 'ok' | 'skipped' | 'conflict'> => {
    switch (f.kind) {
      case 'retry': retry = true; return 'retry';
      case 'too_large': halt = 'too_large'; return 'too_large';
      case 'no_permission': halt = 'no_permission'; return 'no_permission';
      case 'not_connected': return 'not_connected'; // 토큰이 지워졌다: 상태는 '꺼짐'으로 보인다
      case 'error': halt = 'error'; haltStatus = f.status; return 'error';
    }
  };

  const succeed = (patch: { everSucceeded?: boolean; syncedKey: string }) => {
    updateState(deps.storage, { ...patch, pending: null, lastSyncAt: deps.now() });
    checked = true;
    conflict = null;
    remote = null;
    retry = false;
    recreate = false;
  };

  /**
   * 앞서 응답을 못 받은 쓰기(pending)가 서버에 반영됐는지 meta로 확인한다. 어느 쪽이든 pending은 비운다.
   * 반영됐다면 그 쓰기는 성공이었으니 돌려준다 (everSucceeded도 켠다).
   */
  function takeLanded(meta: RemoteMeta | null): PendingWrite | null {
    const pending = state().pending;
    if (!pending) return null;
    const landed = !!meta && meta.sha256 === pending.sha256;
    updateState(deps.storage, { pending: null, ...(landed ? { everSucceeded: true } : {}) });
    return landed ? pending : null;
  }

  /** 반영된 내 쓰기를 기준으로 삼는다. 그 뒤 고친 것이 없으면 true (올릴 것이 없다) */
  async function adoptLanded(landed: PendingWrite, meta: RemoteMeta, s: SessionData): Promise<boolean> {
    updateState(deps.storage, { syncedKey: landed.key, lastSyncAt: deps.now() });
    host.rebase(meta.version);
    const clean = (await keyOf(s)) === landed.key;
    if (clean) host.saved({ version: meta.version, revision: host.revision() });
    return clean;
  }

  /**
   * 서버 문서(meta)가 이 기기의 기준 version과 다를 때: 문서를 받아 내용이 같으면 조용히 기준만 맞추고,
   * 다르면 보내지 않은 변경이 있는지에 따라 conflict / remote로 둔다. 문서를 못 받아도 판단은 version과 변경 여부로 한다.
   */
  async function inspectRemote(s: SessionData, meta: RemoteMeta): Promise<'identical' | 'conflict' | 'remote' | 'gone'> {
    const hasLocal = s.tracks.length > 0;
    const dirty = hasLocal && (await keyOf(s)) !== state().syncedKey;
    const doc = await getDocument(deps);
    if (doc.ok && !doc.found) return 'gone';
    const found = doc.ok ? doc.found : null;
    if (found && hasLocal && (await keyOf(found.session)) === (await keyOf(s))) {
      // 다른 기기가 쓴 것이 이 기기와 내용이 같다: 기준만 맞춘다
      host.saved({ version: found.meta.version, revision: host.revision() });
      updateState(deps.storage, { syncedKey: await keyOf(s), lastSyncAt: deps.now() });
      conflict = null;
      remote = null;
      return 'identical';
    }
    const shown = info(found?.meta ?? meta, found?.session ?? null);
    if (dirty) { conflict = shown; remote = null; return 'conflict'; }
    remote = shown;
    conflict = null;
    return 'remote';
  }

  /** 앱 시작·탭이 다시 보일 때: 서버 meta를 보고 판단한다. 보내지는 않는다 (보낼 것이 있으면 업로드를 예약만 한다) */
  async function runCheck(): Promise<void> {
    if (!ready()) { notify(); return; }
    let s = host.session();
    const hasLocal = s.tracks.length > 0;
    const m = await getMeta(deps);
    if (!m.ok) { fail(m); notify(); return; }
    retry = false;
    checked = true;
    const landed = takeLanded(m.meta);
    if (landed && m.meta) {
      // 응답을 잃었던 내 쓰기가 반영돼 있었다: 그것을 기준으로 삼는다
      if (await adoptLanded(landed, m.meta, s)) { conflict = null; remote = null; notify(); return; }
      s = { ...s, syncVersion: m.meta.version };
    }
    if (m.meta === null) {
      // 서버에 문서가 없다: 이 기기에 세션이 있으면 첫 쓰기(또는 삭제된 문서 복구)를 예약한다
      conflict = null;
      remote = null;
      if (hasLocal) {
        recreate = true;
        if (host.unsaved() === 0) host.markDirty();
      }
    } else if (m.meta.version === s.syncVersion) {
      conflict = null;
      remote = null;
      if (hasLocal && host.unsaved() === 0 && (await keyOf(s)) !== state().syncedKey) host.markDirty();
    } else {
      const result = await inspectRemote(s, m.meta);
      if (result === 'gone') { recreate = hasLocal; if (hasLocal && host.unsaved() === 0) host.markDirty(); }
    }
    notify();
  }

  /** 서버에 쓴다. mode: auto(타이머) / manual(지금 동기화) / overwrite(충돌에서 "이 기기로 덮어쓰기") */
  async function runPush(mode: PushMode): Promise<PushOutcome> {
    if (!ready()) return 'skipped';
    // conflict에서는 자동으로 올리지 않는다. 덮어쓰기는 conflict일 때만 한다.
    if (mode === 'overwrite' ? !conflict : conflict) return 'skipped';
    if (mode === 'auto' && halt) return 'skipped';
    const s0 = host.session();
    if (!s0.tracks.length) return 'skipped';

    const savedAt = host.flushLocal() ?? new Date().toISOString();
    const revision = host.revision();
    const s: SessionData = { ...s0, savedAt };
    const body = serializeSyncBody(s);
    const size = syncSizeOfBody(body);
    oversize = size.tooLarge;
    if (size.tooLarge) { notify(); return 'too_large'; } // 요청하지 않는다. 잘라 내거나 일부만 올리지도 않는다
    const key = await keyOf(s);
    const sha = await sha256Hex(deps, body);

    // 서버에 더 새 문서가 있다고 알고 있는데 이 기기에서도 고쳤다: 보내지 않고 충돌로 올린다
    if (mode !== 'overwrite' && remote && key !== state().syncedKey) {
      conflict = remote;
      remote = null;
      notify();
      return 'conflict';
    }

    saving = true;
    retry = false;
    notify();
    try {
      let base: number | null = mode === 'overwrite' ? conflict!.version : s.syncVersion;

      // 앞서 응답을 못 받은 쓰기가 있으면, 다시 보내기 전에 서버가 그 본문을 가졌는지 본다
      if (state().pending) {
        const m = await getMeta(deps);
        if (!m.ok) return fail(m);
        const landed = takeLanded(m.meta);
        if (landed && m.meta) {
          const clean = await adoptLanded(landed, m.meta, s);
          if (mode !== 'overwrite') {
            if (clean) {
              succeed({ syncedKey: key });
              return 'ok';
            }
            base = m.meta.version;
          }
        }
      }

      // 보낼 것이 없다 (저장 시각만 바뀌었다)
      if (mode !== 'overwrite' && !recreate && base !== null && key === state().syncedKey) {
        host.saved({ version: base, revision });
        return 'skipped';
      }

      // 기준 version이 없는데(처음 켰거나 파일에서 불러왔다) 서버에 문서가 있으면 덮어쓰지 않는다
      if (mode !== 'overwrite' && base === null) {
        const m = await getMeta(deps);
        if (!m.ok) return fail(m);
        if (m.meta) {
          const result = await inspectRemote(s, m.meta);
          if (result !== 'gone') return result === 'conflict' ? 'conflict' : 'skipped'; // gone: 그 사이 삭제됨 → 아래에서 첫 쓰기
        }
      }

      updateState(deps.storage, { pending: { sha256: sha, base, key } });
      const r = await putDocument(deps, { body, base, label: effectiveLabel() });
      if (r.ok) {
        succeed({ everSucceeded: true, syncedKey: key });
        halt = null;
        haltStatus = null;
        host.saved({ version: r.version, revision });
        return 'ok';
      }
      if (r.kind === 'retry') { retry = true; return 'retry'; } // pending을 남겨 둔다: 다음에 보내기 전에 확인한다
      updateState(deps.storage, { pending: null });
      if (r.kind === 'conflict') {
        const result = r.current ? await inspectRemote(s, r.current) : 'gone';
        // 그 사이 내용이 같아졌거나 삭제됐으면 충돌이 아니다
        if (result === 'identical') return 'ok';
        if (result === 'gone') { recreate = true; host.markDirty(); return 'retry'; }
        return result === 'conflict' ? 'conflict' : 'skipped';
      }
      return fail(r);
    } finally {
      saving = false;
      notify();
    }
  }

  /** "클라우드 것 쓰기": GET으로 받은 문서를 검사한 뒤 로컬 세션을 바꾼다 */
  async function runUseCloud(): Promise<LoadCloudOutcome> {
    if (!state().enabled || !isConnected(deps) || !mayHaveSyncScope(deps) || host.userId() === null) return 'skipped';
    saving = true;
    notify();
    try {
      const doc = await getDocument(deps);
      if (!doc.ok) return fail(doc);
      if (!doc.found) return 'none';
      const local = host.session();
      if (local.tracks.length) host.stash(local); // 바꾸기 전 로컬 세션을 남긴다
      const adopted: SessionData = { ...doc.found.session, syncVersion: doc.found.meta.version };
      host.adopt(adopted);
      updateState(deps.storage, { syncedKey: await keyOf(adopted), pending: null, lastSyncAt: deps.now() });
      checked = true;
      conflict = null;
      remote = null;
      retry = false;
      halt = null;
      oversize = false;
      recreate = false;
      return 'ok';
    } finally {
      saving = false;
      notify();
    }
  }

  /** 확인이 이미 줄에 있거나 도는 중이면 그 결과를 같이 기다린다 (시작·탭 복귀·켜기가 겹쳐도 한 번만) */
  let checking: Promise<void> | null = null;
  const check = (): Promise<void> => (checking ??= enqueue(runCheck).finally(() => { checking = null; }));

  return {
    getSnapshot: (): HubSnapshot => (snapshot ??= compute()),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** 저장된 상태·연결이 바뀌었다 (연결·해제, 다른 탭의 변경) */
    refresh: notify,
    check,
    push: (mode: PushMode = 'auto') => enqueue(() => runPush(mode)),
    loadCloud: () => enqueue(runUseCloud),
    overwrite: () => enqueue(() => runPush('overwrite')),
    /** "지금 동기화": 멈춘 상태(오류·재시도·너무 큼)를 풀고 서버를 확인한 뒤 보낼 것이 있으면 보낸다. 충돌은 풀지 않는다 */
    syncNow: () => enqueue(async () => {
      halt = null;
      haltStatus = null;
      retry = false;
      await runCheck();
      if (!conflict && ready()) await runPush('manual');
    }),
    /** 켜면 서버 확인까지 끝난 뒤에 resolve */
    setEnabled(on: boolean): Promise<void> {
      updateState(deps.storage, { enabled: on });
      halt = null;
      haltStatus = null;
      retry = false;
      oversize = false;
      conflict = null;
      remote = null;
      recreate = false;
      notify();
      return on ? check() : Promise.resolve();
    },
    setDeviceLabel(label: string | null) {
      updateState(deps.storage, { deviceLabel: sanitizeDeviceLabel(label) });
      notify();
    },
    /** 연결(또는 재연결) 직후: 권한 때문에 멈췄던 것을 풀고 확인한다 */
    notifyConnected() {
      if (halt === 'no_permission') halt = null;
      notify();
      return check();
    },
  };
}

export type HubEngine = ReturnType<typeof createHubEngine>;
