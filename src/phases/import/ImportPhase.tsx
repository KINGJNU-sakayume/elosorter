import { TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/confirm';
import { useLoggedIn } from '../../hooks/useAuth';
import { useAppDispatch, useAppState, useSave } from '../../state/context';
import AccountCard from './AccountCard';
import CloudBackup from './CloudBackup';
import FileBackup from './FileBackup';
import LoginCard, { HowItWorks, Welcome } from './LoginCard';
import SessionCard from './SessionCard';
import SourcePicker from './SourcePicker';
import SyncBanners from './SyncBanners';

/** 다른 Spotify 계정으로 만든 로컬 세션: 클라우드에 섞여 올라가지 않도록 멈추고 선택을 묻는다 */
function OwnerBanner() {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-warn-soft p-4 text-sm sm:flex-row sm:items-center">
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

/**
 * 불러오기. 넓은 화면은 한 화면에 맞춘 두 열: 왼쪽 세션·백업, 오른쪽 음악 고르기(목록만 안에서 스크롤).
 * 좁은 화면은 한 열로 쌓고 넘치면 스크롤한다.
 */
export default function ImportPhase({ onOpenSettings }: { onOpenSettings: () => void }) {
  const loggedIn = useLoggedIn();
  const { session } = useAppState();
  const save = useSave();
  const hasSession = session.tracks.length > 0;

  if (!loggedIn && !hasSession) {
    return (
      <Welcome onOpenSettings={onOpenSettings}>
        <section aria-label="백업" className="@container mx-auto w-full max-w-lg rounded-2xl bg-section text-left">
          <FileBackup />
        </section>
      </Welcome>
    );
  }

  return (
    <div className="h-full overflow-y-auto md:overflow-hidden">
      <div className="flex min-h-full flex-col gap-4 px-4 py-4 sm:px-6 md:h-full lg:gap-6 lg:px-10 lg:pt-8 lg:pb-10">
        <h1 className="sr-only text-[28px] leading-tight font-bold tracking-tight lg:not-sr-only">불러오기</h1>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(19rem,5fr)_7fr] md:gap-5 lg:grid-cols-[minmax(22rem,5fr)_7fr] lg:gap-8">
          <div className="flex min-h-0 flex-col gap-4 md:overflow-y-auto">
            {loggedIn && <AccountCard className="lg:hidden" />}
            {save.cloud === 'blocked' && <OwnerBanner />}
            {hasSession && <SyncBanners />}
            {hasSession ? <SessionCard /> : <HowItWorks />}
            {!loggedIn && <div className="md:hidden"><LoginCard onOpenSettings={onOpenSettings} /></div>}
            <section aria-label="백업" className="@container divide-y divide-line overflow-hidden rounded-2xl bg-section">
              {loggedIn && <CloudBackup onOpenSettings={onOpenSettings} />}
              <FileBackup />
            </section>
          </div>
          {loggedIn
            ? <SourcePicker />
            : <div className="hidden md:block"><LoginCard onOpenSettings={onOpenSettings} /></div>}
        </div>
      </div>
    </div>
  );
}
