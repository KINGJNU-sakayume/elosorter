import { useState } from 'react';
import { CloudDownload, CloudUpload, FileDown, Link2, Link2Off, RefreshCw, Trash2 } from 'lucide-react';
import type { HubStatus, RemoteInfo } from '../services/lifehub/engine';
import { APP_URL } from '../services/lifehub/remote';
import { clearReplacedSession, hasReplacedSession, loadReplacedSession } from '../services/storage/localSession';
import { exportBackup } from '../services/download';
import { useAppState, useSave, useToast } from '../state/context';
import { fmtCount, fmtDateTime } from '../lib/format';
import { useLoggedIn } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { isCloudConfigured } from '../services/config';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import SyncSize from './SyncSize';

const STATUS_LABEL: Record<HubStatus, string> = {
  off: '꺼짐',
  idle: '켜짐',
  saving: '저장 중',
  conflict: '충돌',
  blocked: '차단',
  error: '오류',
  forbidden: '권한 없음',
  retry: '나중에 재시도',
  too_large: '너무 큼',
};

const STATUS_TONE: Record<HubStatus, string> = {
  off: 'bg-sub text-fg-2',
  idle: 'bg-accent-soft text-accent',
  saving: 'bg-sub text-fg-2',
  conflict: 'bg-warn-soft text-warn',
  blocked: 'bg-warn-soft text-warn',
  error: 'bg-danger-soft text-danger',
  forbidden: 'bg-warn-soft text-warn',
  retry: 'bg-warn-soft text-warn',
  too_large: 'bg-danger-soft text-danger',
};

const inputCls =
  'h-10 w-full rounded-[10px] bg-sub px-3 text-sm text-fg placeholder:text-fg-2 focus:ring-2 focus:ring-accent-line focus:outline-none';

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

/**
 * Life Hub 동기화: 연결/해제, 켜기/끄기, 상태, 마지막 동기화, 문서 크기, 지금 동기화, 충돌 해결.
 * 오류 문구에는 상태 코드와 고정 문구만 보인다 (세션 내용·토큰·응답 본문은 넣지 않는다).
 */
export default function LifeHubSync() {
  const save = useSave();
  const { hub } = save;
  const snap = hub.snapshot;
  const { session } = useAppState();
  const toast = useToast();
  const confirm = useConfirm();
  const loggedIn = useLoggedIn();
  const cfg = useConfig();
  const [busy, setBusy] = useState<'load' | 'overwrite' | 'sync' | null>(null);
  const [replaced, setReplaced] = useState(hasReplacedSession);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);

  const hasLocal = session.tracks.length > 0;
  const pending = snap.conflict ?? snap.remote;
  const needsReconnect = snap.enabled && !snap.connected;

  const toggle = async () => {
    if (snap.enabled) {
      await hub.engine.setEnabled(false);
      toast(isCloudConfigured(cfg) ? 'Life Hub 동기화를 껐습니다. Supabase 백업으로 돌아갑니다' : 'Life Hub 동기화를 껐습니다');
      return;
    }
    if (isCloudConfigured(cfg)) {
      const ok = await confirm({
        title: 'Life Hub 동기화를 켤까요?',
        message: '첫 저장이 성공하면 이 앱은 Supabase에는 더 이상 쓰지 않습니다 (읽기는 남습니다). 동기화를 끄면 Supabase 백업으로 돌아갑니다. 백업 파일은 언제든 쓸 수 있습니다.',
        confirmLabel: '켜기',
      });
      if (!ok) return;
    }
    void hub.engine.setEnabled(true);
  };

  const sync = async () => {
    setBusy('sync');
    try { await hub.syncNow(); } finally { setBusy(null); }
  };

  const loadCloud = async () => {
    if (hasLocal) {
      const ok = await confirm({
        title: 'Life Hub의 버전으로 바꿀까요?',
        message: `이 기기의 세션(${fmtCount(session.tracks.length)}곡 · 비교 ${fmtCount(session.compCount)}회)이 Life Hub의 버전으로 바뀝니다. 받은 문서를 확인한 뒤에만 바꾸고, 바꾸기 전의 이 기기 세션은 백업으로 남겨 두어 파일로 내려받을 수 있습니다.`,
        confirmLabel: '클라우드 것 쓰기',
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

  const downloadReplaced = () => {
    const previous = loadReplacedSession();
    if (previous) exportBackup(previous);
  };

  const label = snap.deviceLabel ?? '';

  return (
    <section aria-label="Life Hub 동기화" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Life Hub 동기화</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[snap.status]}`} role="status">
          {STATUS_LABEL[snap.status]}
          {snap.status === 'idle' && hub.unsaved > 0 ? ` · 대기 ${hub.unsaved}` : ''}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-fg-2">
        여러 기기에서 같은 세션을 이어서 하도록 내 Life Hub의 비공개 저장소에 세션을 보관합니다. 이 기기의 저장이 먼저이고,
        동기화에 실패해도 이 기기의 세션은 그대로입니다. 백업 파일은 그대로 쓸 수 있습니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {snap.connected ? (
          <>
            <span className="text-[13px]">연결됨</span>
            <Button size="sm" variant="quiet" icon={Link2Off} onClick={async () => {
              const ok = await confirm({
                title: 'Life Hub 연결을 끊을까요?',
                message: '연결을 끊으면 동기화도 꺼지고 (Supabase를 설정했다면 그쪽 백업으로 돌아갑니다), 이 기기의 세션은 그대로 남습니다.',
                confirmLabel: '연결 끊기',
                tone: 'danger',
              });
              if (ok) { hub.disconnect(); toast('Life Hub 연결을 끊었습니다'); }
            }}>연결 해제</Button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-fg-2">연결 안 됨</span>
            <Button size="sm" variant="primary" icon={Link2} disabled={!hub.connectAvailable} onClick={() => void hub.connect()}>Life Hub 연결</Button>
          </>
        )}
        <Button size="sm" variant={snap.enabled ? 'secondary' : 'primary'} disabled={!snap.connected || !loggedIn} onClick={() => void toggle()}>
          {snap.enabled ? '동기화 끄기' : '동기화 켜기'}
        </Button>
        <Button size="sm" icon={RefreshCw} loading={busy === 'sync' || snap.status === 'saving'} disabled={!snap.enabled || !snap.connected || !loggedIn} onClick={() => void sync()}>
          지금 동기화
        </Button>
      </div>

      {!hub.connectAvailable && !snap.connected && (
        <p className="text-xs leading-relaxed text-fg-2">
          연결은 배포된 주소(<code className="font-mono break-all text-fg">{APP_URL}</code>)에서만 시작할 수 있습니다.
        </p>
      )}
      {snap.connected && !loggedIn && <p className="text-xs text-fg-2">Spotify에 로그인하면 동기화를 켤 수 있습니다 (세션 주인 확인에 쓰입니다).</p>}
      {needsReconnect && (
        <p role="alert" className="rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-xs leading-relaxed text-warn">
          동기화는 켜져 있지만 Life Hub 연결이 끊겼습니다. 다시 연결하거나 동기화를 끄세요. 연결이 없는 동안에는 Supabase에도 쓰지 않습니다.
        </p>
      )}
      {snap.detail && snap.status !== 'idle' && snap.status !== 'conflict' && (
        <p role="alert" className="rounded-[10px] bg-sub px-3.5 py-2.5 text-xs leading-relaxed">{snap.detail}</p>
      )}
      {snap.enabled && (
        <p className="text-xs text-fg-2">
          마지막 동기화: {snap.lastSyncAt ? fmtDateTime(new Date(snap.lastSyncAt).toISOString()) : '아직 없음'}
        </p>
      )}

      {snap.conflict && (
        <div role="alert" className="rounded-xl bg-warn-soft p-3.5">
          <p className="text-[13px] font-semibold">Life Hub에 다른 버전이 있습니다</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
            다른 기기에서 저장했거나 이 기기가 맞춘 적 없는 버전입니다. 자동 저장을 멈춰 두었습니다 — 어느 쪽을 쓸지 골라 주세요.
          </p>
          <RemoteSummary info={snap.conflict} title="Life Hub" />
          <p className="mt-1 text-[13px] tabular-nums">
            <span className="font-semibold">이 기기</span> {fmtCount(session.tracks.length)}곡 · 분류 {fmtCount(session.tracks.filter(t => t.tier !== null).length)} · 비교 {fmtCount(session.compCount)}회
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={CloudDownload} loading={busy === 'load'} onClick={() => void loadCloud()}>클라우드 것 쓰기</Button>
            <Button size="sm" variant="danger" icon={CloudUpload} loading={busy === 'overwrite'} onClick={() => void overwrite()}>이 기기로 덮어쓰기</Button>
            <Button size="sm" variant="quiet" icon={FileDown} disabled={!hasLocal} onClick={() => exportBackup(session)}>이 기기 세션 내려받기</Button>
          </div>
        </div>
      )}

      {!snap.conflict && snap.remote && (
        <div className="rounded-xl bg-accent-soft p-3.5">
          <p className="text-[13px] font-semibold">Life Hub에 더 새 버전이 있습니다</p>
          <RemoteSummary info={snap.remote} title="Life Hub" />
          <p className="mt-1 text-xs text-fg-2">이 기기에는 보내지 않은 변경이 없습니다. 자동으로 바꾸지 않으니 필요할 때 불러오세요.</p>
          <div className="mt-3">
            <Button size="sm" variant="primary" icon={CloudDownload} loading={busy === 'load'} onClick={() => void loadCloud()}>클라우드 것 쓰기</Button>
          </div>
        </div>
      )}
      {!pending && snap.status === 'idle' && snap.enabled && !hasLocal && (
        <p className="text-xs text-fg-2">Life Hub에 아직 문서가 없고 이 기기에도 세션이 없습니다.</p>
      )}

      {replaced && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sub p-3">
          <p className="min-w-0 flex-1 text-xs leading-relaxed">Life Hub의 버전으로 바꾸기 전의 이 기기 세션이 백업으로 남아 있습니다.</p>
          <Button size="sm" icon={FileDown} onClick={downloadReplaced}>내려받기</Button>
          <Button size="sm" variant="quiet" icon={Trash2} onClick={async () => {
            const ok = await confirm({ title: '남겨 둔 세션을 지울까요?', message: '파일로 내려받지 않았다면 되돌릴 수 없습니다.', confirmLabel: '지우기', tone: 'danger' });
            if (ok) { clearReplacedSession(); setReplaced(false); }
          }}>지우기</Button>
        </div>
      )}

      <SyncSize />

      <div>
        <label htmlFor="hub-device" className="mb-1.5 block text-[13px] font-semibold">
          이 기기 이름 <span className="font-normal text-fg-2">(선택)</span>
        </label>
        <input
          id="hub-device"
          className={inputCls}
          value={labelDraft ?? label}
          maxLength={40}
          placeholder={snap.effectiveLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={e => setLabelDraft(e.target.value)}
          onBlur={() => { if (labelDraft !== null) { hub.engine.setDeviceLabel(labelDraft); setLabelDraft(null); } }}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-fg-2">충돌 안내에 어느 기기가 저장했는지 보여 주는 이름입니다. 영문·숫자·기호 40자까지, 비우면 기본 이름({snap.effectiveLabel})을 씁니다.</p>
      </div>

      {save.writesStopped && (
        <p className="text-xs leading-relaxed text-fg-2">
          Life Hub 저장이 성공해서 Supabase에는 더 이상 쓰지 않습니다. 동기화를 끄면 Supabase 백업으로 돌아갑니다. (Supabase 항목은 5단계에서 정리 예정)
        </p>
      )}
    </section>
  );
}
