import type { ReactNode } from 'react';
import { Layers, ListOrdered, Scale, Settings } from 'lucide-react';
import AppMark from '../../components/AppMark';
import SpotifyLogo from '../../components/SpotifyLogo';
import Button from '../../components/ui/Button';
import { useConfig } from '../../hooks/useConfig';
import { auth } from '../../services/spotify/auth';
import { useToast } from '../../state/context';

const STEPS = [
  { icon: Layers, title: '티어 분류', text: '곡마다 직감으로 최애·선호·보통 중 하나. 곡당 1초면 충분합니다.' },
  { icon: Scale, title: '1:1 비교', text: '두 곡 중 더 좋은 쪽을 고르면 순위가 점점 정밀해집니다.' },
  { icon: ListOrdered, title: '랭킹', text: '예상 정확도와 함께 내 취향 순위를 확인하고 내보냅니다.' },
];

function LoginButton() {
  const { clientId } = useConfig();
  const toast = useToast();
  return (
    <Button
      size="lg"
      className="bg-spotify! text-black! enabled:hover:brightness-105"
      disabled={!clientId}
      onClick={async () => {
        if (!(await auth.login())) toast('Spotify Client ID를 먼저 설정하세요', 'error');
      }}
    >
      <SpotifyLogo size={20} /> Spotify로 로그인
    </Button>
  );
}

function MissingClientId({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { clientId } = useConfig();
  if (clientId) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm">
      <span>Spotify Client ID가 설정되지 않았습니다.</span>
      <Button size="sm" icon={Settings} onClick={onOpenSettings}>설정 열기</Button>
    </div>
  );
}

/** 사용 순서 안내 (로그인했지만 아직 세션이 없을 때) */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="rounded-2xl bg-section p-4 sm:p-5">
      <h2 id="how-title" className="text-[15px] font-semibold">이렇게 진행돼요</h2>
      <ol className="mt-3 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sub text-fg-2">
              <s.icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold"><span className="text-fg-2 tabular-nums">{i + 1}. </span>{s.title}</div>
              <p className="text-[13px] leading-relaxed text-fg-2">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 처음 온 사람: 화면 전체를 쓰는 시작 화면 */
export function Welcome({ onOpenSettings, children }: { onOpenSettings: () => void; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
      {/* m-auto: 공간이 남으면 가운데, 모자라면 위에서부터 (justify-center는 넘칠 때 위가 잘린다) */}
      <div className="m-auto flex w-full max-w-5xl flex-col items-center text-center">
        <AppMark size={72} className="size-14 sm:size-[72px]" />
        <h1 className="mt-4 text-[28px] leading-tight font-bold tracking-tight sm:mt-5 sm:text-[40px]">내 음악 순위 만들기</h1>
        <p className="mt-2 max-w-lg text-[15px] text-fg-2 sm:text-[17px]">
          Spotify 좋아요 곡이나 플레이리스트를 불러와, 티어로 나누고 두 곡씩 비교해 나만의 순위를 만듭니다.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:mt-7">
          <LoginButton />
          <MissingClientId onOpenSettings={onOpenSettings} />
        </div>
        <ol className="mt-8 grid w-full gap-2 text-left sm:mt-12 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5 rounded-2xl bg-section p-4 sm:block sm:p-5">
              <s.icon size={22} className="mt-0.5 shrink-0 text-fg-2 sm:mt-0" aria-hidden />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold sm:mt-3">
                  <span className="text-fg-2 tabular-nums">{i + 1}. </span>{s.title}
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2 sm:mt-1">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {children && <div className="mt-4 w-full sm:mt-6">{children}</div>}
      </div>
    </div>
  );
}

/** 세션은 있지만 로그인하지 않은 경우의 로그인 안내 */
export default function LoginCard({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-section px-6 py-8 text-center md:h-full">
      <SpotifyLogo size={40} />
      <div>
        <h2 className="text-xl font-bold tracking-tight">Spotify에 로그인</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">
          로그인하면 곡을 들으면서 분류·비교하고, 새 음악을 불러오거나 Spotify와 동기화할 수 있습니다.
          로그인하지 않아도 이 브라우저의 세션으로 비교와 랭킹은 이어서 할 수 있습니다.
        </p>
      </div>
      <LoginButton />
      <MissingClientId onOpenSettings={onOpenSettings} />
    </section>
  );
}
