import { LogOut, User } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useLogout } from '../../hooks/useAuth';
import { useAppState } from '../../state/context';

/** 좁은 화면용 계정 줄 (넓은 화면에서는 사이드바 아래에 있다) */
export default function AccountCard({ className = '' }: { className?: string }) {
  const { user } = useAppState();
  const logout = useLogout();

  return (
    <section className={`flex items-center gap-3 rounded-2xl bg-section p-4 ${className}`}>
      {user?.imageUrl ? (
        <img src={user.imageUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sub text-fg-2">
          <User size={18} aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{user?.displayName ?? '불러오는 중…'}</div>
        <div className="text-xs text-fg-2">Spotify 연결됨</div>
      </div>
      <Button size="sm" icon={LogOut} onClick={logout}>로그아웃</Button>
    </section>
  );
}
