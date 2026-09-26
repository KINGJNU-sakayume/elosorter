import { TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/confirm';
import { useLoggedIn } from '../../hooks/useAuth';
import { useAppDispatch, useAppState, useSave } from '../../state/context';
import AccountCard from './AccountCard';
import BackupCard from './BackupCard';
import CloudCard from './CloudCard';
import LoginCard from './LoginCard';
import SessionCard from './SessionCard';
import SourcePicker from './SourcePicker';
import SyncBanners from './SyncBanners';

/** 다른 Spotify 계정으로 만든 로컬 세션: 클라우드에 섞여 올라가지 않도록 멈추고 선택을 묻는다 */
function OwnerBanner() {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-sm sm:flex-row sm:items-center">
      <TriangleAlert className="hidden shrink-0 text-warn sm:block" aria-hidden />
      <p className="flex-1">
        이 브라우저의 세션은 <strong>다른 Spotify 계정</strong>으로 만든 것입니다. 섞이지 않도록 클라우드 백업을 멈췄습니다.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => dispatch({ type: 'claimSession' })}>내 세션으로 쓰기</Button>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: '이 세션을 닫을까요?',
              message: '이 브라우저에서 세션이 지워집니다. 원래 계정의 클라우드 백업은 남아 있습니다.',
              confirmLabel: '닫기',
              tone: 'danger',
            });
            if (ok) dispatch({ type: 'reset' });
          }}
        >
          세션 닫기
        </Button>
      </div>
    </div>
  );
}

export default function ImportPhase({ onOpenSettings }: { onOpenSettings: () => void }) {
  const loggedIn = useLoggedIn();
  const { session } = useAppState();
  const save = useSave();
  const hasSession = session.tracks.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:py-10">
      {loggedIn ? <AccountCard /> : <LoginCard hasSession={hasSession} onOpenSettings={onOpenSettings} />}
      {save.cloud === 'blocked' && <OwnerBanner />}
      {hasSession && <SyncBanners />}
      {hasSession && <SessionCard />}
      {loggedIn && <SourcePicker />}
      {loggedIn && <CloudCard onOpenSettings={onOpenSettings} />}
      <BackupCard />
    </div>
  );
}
