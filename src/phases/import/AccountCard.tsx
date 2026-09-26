import { LogOut, User } from 'lucide-react';
import Button from '../../components/ui/Button';
import { auth } from '../../services/spotify/auth';
import { useAppDispatch, useAppState, useToast } from '../../state/context';

export default function AccountCard() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const toast = useToast();

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
      {user?.imageUrl ? (
        <img src={user.imageUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sub text-fg-3">
          <User size={18} aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{user?.displayName ?? '불러오는 중…'}</div>
        <div className="text-xs text-fg-2">Spotify 연결됨</div>
      </div>
      <Button
        size="sm"
        icon={LogOut}
        onClick={() => {
          auth.logout();
          dispatch({ type: 'setUser', user: null });
          toast('로그아웃했습니다. 이 브라우저의 세션은 그대로 남아 있습니다');
        }}
      >
        로그아웃
      </Button>
    </section>
  );
}
