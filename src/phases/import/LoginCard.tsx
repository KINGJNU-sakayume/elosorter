import { Layers, Settings, Swords, Trophy } from 'lucide-react';
import SpotifyLogo from '../../components/SpotifyLogo';
import Button from '../../components/ui/Button';
import { useConfig } from '../../hooks/useConfig';
import { auth } from '../../services/spotify/auth';
import { useToast } from '../../state/context';

const STEPS = [
  { icon: Layers, title: '티어 분류', text: '곡마다 직감으로 1·2·3 중 하나. 곡당 1초면 충분합니다.' },
  { icon: Swords, title: '1:1 비교', text: '두 곡 중 더 좋은 쪽을 고르면 순위가 점점 정밀해집니다.' },
  { icon: Trophy, title: '랭킹', text: '예상 정확도와 함께 내 취향 순위를 확인하고 내보냅니다.' },
];

export default function LoginCard({ hasSession, onOpenSettings }: { hasSession: boolean; onOpenSettings: () => void }) {
  const { clientId } = useConfig();
  const toast = useToast();

  return (
    <section className="rounded-2xl border border-line bg-card px-5 py-8 text-center sm:px-8 sm:py-10">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-spotify">
        <SpotifyLogo size={30} />
      </div>
      <h1 className="text-xl font-bold sm:text-2xl">Spotify로 시작하기</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
        좋아요 곡이나 플레이리스트를 불러와 나만의 음악 순위를 만듭니다.
        {hasSession && ' 이 브라우저에 저장된 세션은 로그인하지 않아도 이어서 비교하거나 볼 수 있습니다(재생 제외).'}
      </p>

      <Button
        variant="primary"
        size="lg"
        className="mt-6 !border-spotify !bg-spotify !text-black"
        disabled={!clientId}
        onClick={async () => {
          if (!(await auth.login())) toast('Spotify Client ID를 먼저 설정하세요', 'error');
        }}
      >
        <SpotifyLogo /> Spotify로 로그인
      </Button>

      {!clientId && (
        <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-2 rounded-xl border border-warn-line bg-warn-soft p-3 text-sm text-fg-2">
          Spotify Client ID가 설정되지 않았습니다.
          <Button size="sm" icon={Settings} onClick={onOpenSettings}>설정 열기</Button>
        </div>
      )}

      <ol className="mt-8 grid gap-3 text-left sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-section p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <s.icon size={16} className="text-accent" aria-hidden />
              <span className="font-mono text-xs text-fg-3">{i + 1}</span> {s.title}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
