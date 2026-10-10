import { auth } from '../services/spotify/auth';
import { useToast } from '../state/context';

/**
 * 로그인 전 안내 한 줄. 예전에는 곡마다 비활성 재생 버튼과 같은 문구가 반복됐다
 * (비교 화면에서는 두 번씩, 좁은 화면에서는 잘려서).
 */
export default function LoginHint({ doing, className = '' }: { doing: '비교' | '분류'; className?: string }) {
  const toast = useToast();
  return (
    <p className={`flex min-w-0 items-center gap-x-1 text-[13px] text-fg-2 ${className}`}>
      <span className="min-w-0 flex-1 truncate lg:flex-none">로그인하면 들으면서 {doing}할 수 있어요</span>
      <button
        type="button"
        onClick={async () => {
          if (!(await auth.login())) toast('Spotify Client ID를 먼저 설정하세요', 'error');
        }}
        className="flex h-7 shrink-0 items-center rounded-md px-2 font-semibold text-accent hover:bg-sub pointer-coarse:h-11"
      >
        Spotify 로그인
      </button>
    </p>
  );
}
