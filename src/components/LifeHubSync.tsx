import { useState } from 'react';
import { CloudDownload, CloudUpload, FileDown, Link2, Link2Off, RefreshCw, Trash2 } from 'lucide-react';
import type { SessionData } from '../core/session/schema';
import type { HubSnapshot, RemoteInfo } from '../services/lifehub/engine';
import { clearReplacedSession, hasReplacedSession, loadReplacedSession } from '../services/storage/localSession';
import { exportBackup } from '../services/download';
import { useAppState, useSave, useToast } from '../state/context';
import { fmtCount, fmtDateTime } from '../lib/format';
import { useLoggedIn } from '../hooks/useAuth';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import SyncSize from './SyncSize';
import { LIFEHUB_SECTION_ID, lifeHubView, type LifeHubView } from './lifeHubView';

const inputCls =
  'h-10 w-full rounded-[10px] bg-sub px-3 text-sm text-fg placeholder:text-fg-2 focus:ring-2 focus:ring-accent-line focus:outline-none';

function StatusDot({ dot }: { dot: LifeHubView['dot'] }) {
  if (!dot) return null;
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${dot === 'warn' ? 'bg-warn' : 'bg-accent'}`} />;
}

function StatusLine({ view }: { view: LifeHubView }) {
  return (
    <p role="status" className="flex items-center gap-2 text-[13px]">
      <StatusDot dot={view.dot} />
      <span className={view.kind === 'C' ? 'font-semibold text-warn' : ''}>{view.line}</span>
    </p>
  );
}

/** 불러오기 화면 백업 칸의 한 줄 요약: 상태 줄과 같은 문구 + 오른쪽 끝 「설정」 */
export function LifeHubStatusLine({ view, onOpenSettings }: { view: LifeHubView; onOpenSettings: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <StatusDot dot={view.dot} />
      <span className={`min-w-0 flex-1 ${view.kind === 'C' ? 'font-semibold text-warn' : view.kind === 'A' ? 'text-fg-2' : ''}`}>
        {view.line}
      </span>
      <span className="shrink-0">
        <span className="text-fg-2">· </span>
        <button type="button" onClick={onOpenSettings} className="font-semibold text-accent underline-offset-2 hover:underline">
          설정
        </button>
      </span>
    </div>
  );
}

function RemoteSummary({ info, title }: { info: RemoteInfo; title: string }) {
  const s = info.summary;
  return (
    <p className="mt-1 text-[13px] tabular-nums">
      <span className="font-semibold">{title}</span>{' '}
      {s ? <>{fmtCount(s.trackCount)}곡 · 분류 {fmtCount(s.tieredCount)} · 비교 {fmtCount(s.compCount)}회 · </> : '내용을 확인하지 못했습니다 · '}
      <span className="text-fg-2">
        {fmtDateTime(info.writtenAt)}{info.device ? ` · ${info.device}` : ''} · 버전 {info.version}
      </span>
    </p>
  );
}

type Busy = 'load' | 'overwrite' | 'sync' | null;

export interface LifeHubPanelProps {
  view: LifeHubView;
  snap: HubSnapshot;
  session: SessionData;
  loggedIn: boolean;
  connectAvailable: boolean;
  replaced: boolean;
  /** 보드 업로드 권한이 없는 옛 연결: 다시 연결 안내 (동기화는 그대로) */
  boardNeedsReconnect?: boolean;
  busy: Busy;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onLoadCloud: () => void;
  onOverwrite: () => void;
  onDeviceLabel: (label: string) => void;
  onDownloadReplaced: () => void;
  onClearReplaced: () => void;
}

/** 원인별 경고 상자 문장 (C). 연결 끊김·권한 없음은 공통 규격 문구, 나머지는 기존 안내 */
const CAUSE_TEXT = {
  disconnected: 'Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.',
  forbidden: '동기화 권한이 없는 연결입니다. 한 번 다시 연결하면 제안과 동기화가 함께 켜집니다.',
} as const;

export const BOARD_RECONNECT_TEXT = '보드에 올리려면 Life Hub에 다시 연결해 주세요. 동기화와 이 기기의 기록은 그대로입니다.';

/** 설정의 「Life Hub」 섹션 화면 (컨텍스트 없이 그린다) */
export function LifeHubPanel(p: LifeHubPanelProps) {
  const { view, snap, session } = p;
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const hasLocal = session.tracks.length > 0;
  const syncing = p.busy === 'sync' || snap.status === 'saving';
  const serverVersion = (snap.conflict ?? snap.remote)?.version ?? session.syncVersion;

  const disconnectButton = (
    <Button size="sm" icon={Link2Off} onClick={p.onDisconnect}>연결 해제</Button>
  );
  const reconnectButton = (
    <Button size="sm" variant="primary" icon={Link2} disabled={!p.connectAvailable} onClick={p.onConnect}>다시 연결</Button>
  );
  // 연결 끊김·동기화 권한 없음 안내에는 이미 다시 연결 버튼이 있다
  const showBoardNote = !!p.boardNeedsReconnect && snap.connected
    && !(view.kind === 'C' && (view.cause === 'disconnected' || view.cause === 'forbidden'));
  const boardNote = showBoardNote && (
    <div className="rounded-xl bg-sub p-3.5">
      <p className="text-xs leading-relaxed">{BOARD_RECONNECT_TEXT}</p>
      <div className="mt-3">{reconnectButton}</div>
    </div>
  );
  const notDeployed = !p.connectAvailable && (
    <p className="text-xs leading-relaxed text-fg-2">배포된 주소에서만 연결할 수 있어요.</p>
  );

  const advanced = (
    <details className="rounded-xl border border-line">
      <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-semibold select-none">고급</summary>
      <div className="space-y-4 px-3.5 pb-3.5">
        <div>
          <label htmlFor="hub-device" className="mb-1.5 block text-[13px] font-semibold">
            이 기기 이름 <span className="font-normal text-fg-2">(선택)</span>
          </label>
          <input
            id="hub-device"
            className={inputCls}
            value={labelDraft ?? snap.deviceLabel ?? ''}
            maxLength={40}
            placeholder={snap.effectiveLabel}
            autoComplete="off"
            spellCheck={false}
            onChange={e => setLabelDraft(e.target.value)}
            onBlur={() => { if (labelDraft !== null) { p.onDeviceLabel(labelDraft); setLabelDraft(null); } }}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-fg-2">충돌 안내에 어느 기기가 저장했는지 보여 주는 이름입니다. 영문·숫자·기호 40자까지, 비우면 기본 이름({snap.effectiveLabel})을 씁니다.</p>
        </div>
        {serverVersion != null && <p className="text-[13px] tabular-nums">서버 버전 {serverVersion}</p>}
        <SyncSize />
        {p.replaced && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sub p-3">
            <p className="min-w-0 flex-1 text-xs leading-relaxed">Life Hub의 버전으로 바꾸기 전의 이 기기 세션이 백업으로 남아 있습니다.</p>
            <Button size="sm" icon={FileDown} onClick={p.onDownloadReplaced}>내려받기</Button>
            <Button size="sm" variant="quiet" icon={Trash2} onClick={p.onClearReplaced}>지우기</Button>
          </div>
        )}
      </div>
    </details>
  );

  let body;
  if (view.kind === 'A') {
    body = (
      <>
        <p className="text-xs leading-relaxed text-fg-2">이 앱의 세션을 다른 기기와 맞춥니다.</p>
        <div>
          <Button size="sm" variant="primary" icon={Link2} disabled={!p.connectAvailable} onClick={p.onConnect}>Life Hub 연결</Button>
        </div>
        {notDeployed}
      </>
    );
  } else if (view.kind === 'B') {
    body = (
      <>
        <StatusLine view={view} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={RefreshCw} loading={syncing} disabled={!p.loggedIn} onClick={p.onSync}>지금 동기화</Button>
          {disconnectButton}
        </div>
        {boardNote}
        {snap.remote && (
          <div className="rounded-xl bg-accent-soft p-3.5">
            <p className="text-[13px] font-semibold">Life Hub에 더 새 버전이 있습니다</p>
            <RemoteSummary info={snap.remote} title="Life Hub" />
            <p className="mt-1 text-xs text-fg-2">이 기기에는 보내지 않은 변경이 없습니다. 자동으로 바꾸지 않으니 필요할 때 불러오세요.</p>
            <div className="mt-3">
              <Button size="sm" variant="primary" icon={CloudDownload} loading={p.busy === 'load'} onClick={p.onLoadCloud}>Life Hub 버전 쓰기</Button>
            </div>
          </div>
        )}
        {!snap.remote && snap.status === 'idle' && p.loggedIn && !hasLocal && (
          <p className="text-xs text-fg-2">Life Hub에 아직 문서가 없고 이 기기에도 세션이 없습니다.</p>
        )}
        {advanced}
      </>
    );
  } else {
    let box;
    switch (view.cause) {
      case 'disconnected':
      case 'forbidden':
        box = (
          <>
            <p className="text-xs leading-relaxed">{CAUSE_TEXT[view.cause]}</p>
            <div className="mt-3">{reconnectButton}</div>
            {notDeployed && <div className="mt-2">{notDeployed}</div>}
          </>
        );
        break;
      case 'conflict':
        box = snap.conflict && (
          <>
            <p className="text-[13px] font-semibold">Life Hub에 다른 버전이 있습니다</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
              다른 기기에서 저장했거나 이 기기가 맞춘 적 없는 버전입니다. 자동 저장을 멈춰 두었습니다 — 어느 쪽을 쓸지 골라 주세요.
            </p>
            <RemoteSummary info={snap.conflict} title="Life Hub" />
            <p className="mt-1 text-[13px] tabular-nums">
              <span className="font-semibold">이 기기</span> {fmtCount(session.tracks.length)}곡 · 분류 {fmtCount(session.tracks.filter(t => t.tier !== null).length)} · 비교 {fmtCount(session.compCount)}회
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={CloudDownload} loading={p.busy === 'load'} onClick={p.onLoadCloud}>Life Hub 버전 쓰기</Button>
              <Button size="sm" variant="danger" icon={CloudUpload} loading={p.busy === 'overwrite'} onClick={p.onOverwrite}>이 기기 버전으로 덮어쓰기</Button>
              <Button size="sm" variant="quiet" icon={FileDown} disabled={!hasLocal} onClick={() => exportBackup(session)}>이 기기 세션 내려받기</Button>
            </div>
          </>
        );
        break;
      case 'error':
        box = (
          <>
            <p className="text-xs leading-relaxed">{snap.detail}</p>
            <div className="mt-3">
              <Button size="sm" icon={RefreshCw} loading={syncing} onClick={p.onSync}>지금 동기화</Button>
            </div>
          </>
        );
        break;
      default: // blocked, too_large: 기존 안내만
        box = <p className="text-xs leading-relaxed">{snap.detail}</p>;
    }
    body = (
      <>
        <StatusLine view={view} />
        <div role="alert" className="rounded-xl bg-warn-soft p-3.5">{box}</div>
        {boardNote}
        <div>{disconnectButton}</div>
        {snap.connected && advanced}
      </>
    );
  }

  return (
    <section id={LIFEHUB_SECTION_ID} aria-labelledby="lifehub-title" className="scroll-mt-4 space-y-3">
      <h3 id="lifehub-title" className="text-[15px] font-semibold">Life Hub</h3>
      {body}
    </section>
  );
}

/**
 * 설정 모달의 「Life Hub」 섹션: 연결·해제, 상태, 지금 동기화, 충돌 해결, 고급(기기 이름·서버 버전·문서 크기).
 * 앱에서 Life Hub 연결·해제 버튼은 여기에만 있다. 동기화를 켜고 끄는 스위치는 없다 (연결 + 로그인이면 켜짐).
 * 오류 문구에는 상태 코드와 고정 문구만 보인다 (세션 내용·토큰·응답 본문은 넣지 않는다).
 */
export default function LifeHubSync() {
  const { hub } = useSave();
  const snap = hub.snapshot;
  const { session } = useAppState();
  const toast = useToast();
  const confirm = useConfirm();
  const loggedIn = useLoggedIn();
  const [busy, setBusy] = useState<Busy>(null);
  const [replaced, setReplaced] = useState(hasReplacedSession);
  const view = lifeHubView({ snap, loggedIn, unsaved: hub.unsaved });
  const hasLocal = session.tracks.length > 0;

  const sync = async () => {
    setBusy('sync');
    try { await hub.syncNow(); } finally { setBusy(null); }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Life Hub 연결을 끊을까요?',
      message: '연결을 끊으면 동기화도 멈춥니다. 이 기기의 세션은 그대로 남고, 이후에는 이 기기와 백업 파일에만 저장됩니다.',
      confirmLabel: '연결 끊기',
      tone: 'danger',
    });
    if (ok) { hub.disconnect(); toast('Life Hub 연결을 끊었습니다'); }
  };

  const loadCloud = async () => {
    if (hasLocal) {
      const ok = await confirm({
        title: 'Life Hub의 버전으로 바꿀까요?',
        message: `이 기기의 세션(${fmtCount(session.tracks.length)}곡 · 비교 ${fmtCount(session.compCount)}회)이 Life Hub의 버전으로 바뀝니다. 받은 문서를 확인한 뒤에만 바꾸고, 바꾸기 전의 이 기기 세션은 백업으로 남겨 두어 파일로 내려받을 수 있습니다.`,
        confirmLabel: 'Life Hub 버전 쓰기',
      });
      if (!ok) return;
    }
    setBusy('load');
    try {
      const result = await hub.loadCloud();
      setReplaced(hasReplacedSession());
      if (result === 'ok') toast('Life Hub의 세션으로 바꿨습니다', 'success');
      else if (result === 'none') toast('Life Hub에 불러올 세션이 없습니다', 'error');
      else if (result === 'error') toast('받은 문서를 확인할 수 없어 바꾸지 않았습니다. 이 기기의 세션은 그대로입니다', 'error');
      else toast('Life Hub에서 받지 못했습니다. 이 기기의 세션은 그대로입니다', 'error');
    } finally {
      setBusy(null);
    }
  };

  const overwrite = async () => {
    const ok = await confirm({
      title: '이 기기 버전으로 덮어쓸까요?',
      message: 'Life Hub에 있는 다른 기기의 최신 버전이 이 기기의 세션으로 바뀝니다 (이전 버전은 Life Hub에 몇 개 남지만 이 앱에서 되돌리는 화면은 아직 없습니다). 그 사이 또 다른 기기가 저장했다면 덮어쓰지 않고 다시 묻습니다.',
      confirmLabel: '덮어쓰기',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('overwrite');
    try {
      const result = await hub.overwrite();
      if (result === 'ok') toast('Life Hub에 저장했습니다', 'success');
      else if (result === 'conflict') toast('그 사이 다른 기기가 또 저장했습니다. 다시 골라 주세요', 'error');
      else toast('저장하지 못했습니다. 이 기기의 세션은 그대로입니다', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <LifeHubPanel
      view={view}
      snap={snap}
      session={session}
      loggedIn={loggedIn}
      connectAvailable={hub.connectAvailable}
      replaced={replaced}
      boardNeedsReconnect={hub.boardNeedsReconnect}
      busy={busy}
      onConnect={() => void hub.connect()}
      onDisconnect={() => void disconnect()}
      onSync={() => void sync()}
      onLoadCloud={() => void loadCloud()}
      onOverwrite={() => void overwrite()}
      onDeviceLabel={label => hub.engine.setDeviceLabel(label)}
      onDownloadReplaced={() => {
        const previous = loadReplacedSession();
        if (previous) exportBackup(previous);
      }}
      onClearReplaced={async () => {
        const ok = await confirm({ title: '남겨 둔 세션을 지울까요?', message: '파일로 내려받지 않았다면 되돌릴 수 없습니다.', confirmLabel: '지우기', tone: 'danger' });
        if (ok) { clearReplacedSession(); setReplaced(false); }
      }}
    />
  );
}
