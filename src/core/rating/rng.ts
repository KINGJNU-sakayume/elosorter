// 시드 기반 난수. 리듀서를 순수 함수로 유지하려고 무작위성을 시드로 주입한다
// (StrictMode의 이중 호출에서도 같은 결과가 나와야 한다).

export type Rng = () => number;

/** mulberry32 — 32비트 시드, [0, 1) 균등분포 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 액션 페이로드에 실을 새 시드 (이벤트 핸들러에서만 호출) */
export function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
