// 재생 요청 줄. React·브라우저 API 없이 순서만 다룬다 (테스트: playQueue.test.ts).
//
// 빠르게 곡을 넘길 때 생기던 문제:
// - 요청이 여러 개 동시에 떠 있으면 먼저 보낸(지나간) 곡이 나중에 적용돼 화면과 다른 곡이 나온다.
// - 429(요청 제한)를 받은 지나간 곡들이 제각각 재시도하면서 제한을 계속 붙잡아, 지금 곡은 끝내 재생되지 않는다.
// 그래서 요청은 한 번에 하나만 보내고, 보내는 사이 다른 곡을 원하면 끝난 뒤 "마지막에 원한 곡"만 보낸다.
// 실패하면 곡을 넘기더라도 정해진 시간 동안은 아무것도 보내지 않고, 기다린 뒤 그때 원하는 곡을 보낸다.

export interface PlayQueueOptions {
  /** 재생 요청 한 번 (재시도 없이) */
  send: (uri: string) => Promise<void>;
  /** 기기 일시정지 */
  pause: () => void;
  /**
   * 실패 후 다음 요청까지 기다릴 시간(ms). null이면 다시 보내도 소용없는 오류.
   * streak은 곡과 상관없이 연속으로 실패한 횟수(0부터) — 요청 제한은 곡이 아니라 앱 전체에 걸리므로.
   */
  retryDelay: (error: unknown, streak: number) => number | null;
  /** 한 곡을 이만큼 보내도 안 되면 포기한다 (기본 4번) */
  maxAttempts?: number;
  /** 원하는 곡의 재생 요청이 성공했다 */
  onStart?: (uri: string) => void;
  /** 원하는 곡을 재생하지 못했다 (그사이 다른 곡으로 넘어갔으면 부르지 않는다) */
  onError?: (uri: string, error: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PlayQueue {
  /** 이 곡을 재생한다 (앞서 원한 곡은 아직 보내지 않았으면 버린다) */
  play: (uri: string) => void;
  /** 재생하지 않는다. 보내는 중인 요청이 있으면 끝난 뒤 멈춘다 */
  stop: () => void;
  /** 지금 재생하려는 곡. null = 멈춤 */
  readonly wanted: string | null;
  /** 요청을 보내는 중이거나 다시 보내려고 기다리는 중 */
  readonly busy: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createPlayQueue(options: PlayQueueOptions): PlayQueue {
  const { send, pause, retryDelay, maxAttempts = 4, onStart, onError, sleep = defaultSleep, now = Date.now } = options;
  let wanted: string | null = null;
  let busy = false;
  /** 이 시각까지는 어떤 곡도 보내지 않는다 */
  let holdUntil = 0;
  let streak = 0;

  async function pump(): Promise<void> {
    busy = true;
    /** 이번 차례에 마지막으로 재생을 시작시킨 곡 */
    let started: string | null = null;
    /** 연속으로 실패한 곡과 횟수. 곡이 바뀌면 새로 센다 (지나간 곡이 재시도 기회를 써 버리지 않게) */
    let failed: { uri: string; count: number } | null = null;
    try {
      while (wanted !== null && wanted !== started) {
        const hold = holdUntil - now();
        if (hold > 0) {
          await sleep(hold);
          continue; // 기다리는 사이 곡이 바뀌었으면 바뀐 곡을 보낸다
        }
        const uri: string = wanted;
        try {
          await send(uri);
          started = uri;
          streak = 0;
          failed = null;
          if (wanted === uri) onStart?.(uri);
        } catch (error) {
          const wait = retryDelay(error, streak);
          if (wait !== null) {
            holdUntil = now() + wait;
            streak++;
          }
          const count: number = (failed?.uri === uri ? failed.count : 0) + 1;
          failed = { uri, count };
          if (wait === null || count >= maxAttempts) {
            failed = null;
            if (wanted === uri) {
              wanted = null;
              onError?.(uri, error);
            }
          }
        }
      }
      // 보내는 사이 멈춤을 원했으면, 방금 시작된 곡을 멈춘다
      if (wanted === null && started !== null) pause();
    } finally {
      busy = false;
    }
  }

  return {
    play(uri) {
      wanted = uri;
      if (!busy) void pump();
    },
    stop() {
      wanted = null;
      pause();
    },
    get wanted() {
      return wanted;
    },
    get busy() {
      return busy;
    },
  };
}
