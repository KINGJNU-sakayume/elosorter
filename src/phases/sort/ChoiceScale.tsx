import Kbd from '../../components/ui/Kbd';
import { CHOICES, type Choice } from './choices';

/**
 * 응답 저울. 예전에는 같은 모양의 회색 버튼 다섯 개라 방향과 세기를 글자로만 읽어야 했다.
 * 지금은 모양이 뜻을 싣는다: 바깥쪽일수록 크고 진하면 "확실히", 가운데로 갈수록 작고 옅어져 "비슷함".
 * 부모(sort-fit)가 두 앨범 아트를 합친 폭이라 왼쪽 두 칸은 A 아래, 오른쪽 두 칸은 B 아래에 놓인다.
 *
 * 칸 안의 배치는 저울 자체의 폭(컨테이너 쿼리)에 따라 달라진다. 창 높이가 낮으면 아트와 함께
 * 저울도 좁아지므로 화면 폭이 아니라 저울 폭을 기준으로 삼는다.
 *   좁음: 배지 위·글자 아래 / 36rem부터: 한 줄 / 46rem부터: 단축키까지
 */
const SHAPE: Record<Choice['strength'], string> = {
  2: 'h-16 rounded-[14px] bg-sub-strong font-bold @[36rem]:rounded-2xl @[36rem]:px-4 @[54rem]:px-[18px] @[54rem]:text-[17px]',
  1: 'h-14 rounded-xl bg-sub font-semibold @[36rem]:h-[54px] @[36rem]:rounded-[14px] @[36rem]:px-3.5 @[54rem]:px-4',
  0: 'h-12 rounded-xl border border-line font-medium text-fg-2 @[36rem]:h-[46px] @[36rem]:px-3',
};

const BADGE: Record<1 | 2, string> = {
  2: 'size-[22px] bg-fg text-page text-xs @[54rem]:size-[26px] @[54rem]:text-[13px]',
  1: 'size-5 border-[1.5px] border-fg-2 text-[11px] @[36rem]:size-[22px] @[36rem]:text-xs',
};

/** 화면에 보이는 화살표 → aria-keyshortcuts가 요구하는 키 이름 */
const KEY_NAME: Record<string, string> = { '←': 'ArrowLeft', '→': 'ArrowRight', '↓': 'ArrowDown' };

export default function ChoiceScale({ onChoose }: { onChoose: (score: number) => void }) {
  return (
    <div
      role="group"
      aria-label="응답"
      className="@container grid shrink-0 grid-cols-[1.25fr_1fr_0.9fr_1fr_1.25fr] items-center gap-1.5 sm:gap-2"
    >
      {CHOICES.map(c => (
        <button
          key={c.score}
          type="button"
          onClick={() => onChoose(c.score)}
          aria-keyshortcuts={c.keys.map(k => KEY_NAME[k] ?? k).join(' ')}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[13px] leading-tight transition-[background-color,box-shadow,transform] hover:bg-accent-soft hover:inset-ring hover:inset-ring-accent-line active:scale-[0.97] @[36rem]:gap-2.5 @[36rem]:text-[15px] ${
            c.side === 'B' ? '@[36rem]:flex-row-reverse' : '@[36rem]:flex-row'
          } ${SHAPE[c.strength]}`}
        >
          {c.side && (
            <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full leading-none font-bold ${BADGE[c.strength]}`}>
              {c.side}
            </span>
          )}
          <span className="whitespace-nowrap">
            {c.side && <span className="sr-only">{c.side} </span>}
            {c.word}
          </span>
          <span className={`hidden gap-1 pointer-fine:@[46rem]:flex ${c.side === 'A' ? 'ml-auto' : c.side === 'B' ? 'mr-auto' : ''}`}>
            {c.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
          </span>
        </button>
      ))}
    </div>
  );
}
