import { describe, expect, it } from 'vitest';
import { createPlayQueue, type PlayQueueOptions } from './playQueue';

interface Pending {
  uri: string;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/**
 * send가 돌려준 약속을 테스트에서 직접 끝낸다. 시계는 가짜: sleep이 끝나면 그만큼 흐른다.
 * manualSleep이면 wake()를 불러야 sleep이 끝난다.
 */
function harness(overrides: Partial<PlayQueueOptions> = {}, { manualSleep = false } = {}) {
  const sent: Pending[] = [];
  const events: string[] = [];
  const waits: number[] = [];
  let clock = 0;
  let wake = () => {};
  let inFlight = 0;
  let maxInFlight = 0;
  const queue = createPlayQueue({
    send: uri => new Promise<void>((resolve, reject) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const done = <T,>(fn: (v: T) => void) => (v: T) => { inFlight--; fn(v); };
      sent.push({ uri, resolve: done(resolve), reject: done(reject) });
    }),
    pause: () => events.push('pause'),
    retryDelay: () => null,
    onStart: uri => events.push(`start ${uri}`),
    onError: uri => events.push(`error ${uri}`),
    now: () => clock,
    sleep: ms => {
      waits.push(ms);
      if (!manualSleep) {
        clock += ms;
        return Promise.resolve();
      }
      return new Promise<void>(resolve => { wake = () => { clock += ms; resolve(); }; });
    },
    ...overrides,
  });
  return {
    queue,
    sent,
    events,
    waits,
    uris: () => sent.map(s => s.uri),
    wake: () => wake(),
    maxInFlight: () => maxInFlight,
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const tooMany = new Error('429');

describe('createPlayQueue', () => {
  it('보내는 중에 여러 곡을 원하면 끝난 뒤 마지막 곡만 보낸다', async () => {
    const h = harness();
    h.queue.play('a');
    h.queue.play('b');
    h.queue.play('c');
    h.queue.play('d');
    expect(h.uris()).toEqual(['a']);

    h.sent[0].resolve();
    await flush();
    expect(h.uris()).toEqual(['a', 'd']);
    h.sent[1].resolve();
    await flush();

    expect(h.events).toEqual(['start d']);
    expect(h.maxInFlight()).toBe(1);
    expect(h.queue.busy).toBe(false);
    expect(h.queue.wanted).toBe('d');
  });

  it('보내는 사이 원래 곡으로 돌아오면 다시 보내지 않는다', async () => {
    const h = harness();
    h.queue.play('a');
    h.queue.play('b');
    h.queue.play('a');
    h.sent[0].resolve();
    await flush();
    expect(h.uris()).toEqual(['a']);
    expect(h.events).toEqual(['start a']);
  });

  it('보내는 중에 멈추면 요청이 끝난 뒤 멈춘다', async () => {
    const h = harness();
    h.queue.play('a');
    h.queue.stop();
    expect(h.events).toEqual(['pause']);
    h.sent[0].resolve();
    await flush();
    expect(h.events).toEqual(['pause', 'pause']);
    expect(h.queue.wanted).toBeNull();
  });

  it('멈췄다가 다른 곡을 원하면 그 곡만 보낸다', async () => {
    const h = harness();
    h.queue.play('a');
    h.queue.stop();
    h.queue.play('b');
    h.sent[0].resolve();
    await flush();
    h.sent[1].resolve();
    await flush();
    expect(h.uris()).toEqual(['a', 'b']);
    expect(h.events).toEqual(['pause', 'start b']);
  });

  it('재시도는 기다리는 동안 바뀐 최신 곡으로 한다', async () => {
    const h = harness({ retryDelay: () => 4000 }, { manualSleep: true });
    h.queue.play('a');
    h.sent[0].reject(tooMany);
    await flush();
    expect(h.waits).toEqual([4000]);

    h.queue.play('b');
    h.queue.play('c');
    h.wake();
    await flush();
    expect(h.uris()).toEqual(['a', 'c']);
    h.sent[1].resolve();
    await flush();
    expect(h.events).toEqual(['start c']);
  });

  it('실패한 뒤 기다리는 동안에는 곡을 넘겨도 아무것도 보내지 않는다', async () => {
    const h = harness({ retryDelay: () => 5000 }, { manualSleep: true });
    h.queue.play('a');
    h.sent[0].reject(tooMany);
    await flush();
    // 사용자가 멈췄다가(다음 곡으로 넘김) 새 곡을 원해도 대기는 이어진다
    h.queue.stop();
    h.queue.play('b');
    h.queue.stop();
    h.queue.play('c');
    await flush();
    expect(h.uris()).toEqual(['a']);
    h.wake();
    await flush();
    expect(h.uris()).toEqual(['a', 'c']);
  });

  it('대기는 줄이 멈춘 뒤에 새로 원한 곡에도 적용된다', async () => {
    const h = harness({ retryDelay: () => 5000 }, { manualSleep: true });
    h.queue.play('a');
    h.sent[0].reject(tooMany);
    await flush();
    h.queue.stop();
    h.wake();
    await flush();
    expect(h.queue.busy).toBe(false);

    // 시계는 5000ms 흘렀으니 바로 보낸다
    h.queue.play('b');
    expect(h.uris()).toEqual(['a', 'b']);
  });

  it('연속 실패 횟수는 곡과 상관없이 늘고, 포기 기준은 곡마다 센다', async () => {
    const streaks: number[] = [];
    const h = harness(
      { retryDelay: (_e, streak) => { streaks.push(streak); return 1000 * 2 ** streak; }, maxAttempts: 2 },
      { manualSleep: true },
    );
    h.queue.play('a');
    h.sent[0].reject(tooMany);
    await flush();
    h.queue.play('b');
    h.wake();
    await flush();
    h.sent[1].reject(tooMany);
    await flush();
    h.wake();
    await flush();
    h.sent[2].resolve();
    await flush();

    expect(h.uris()).toEqual(['a', 'b', 'b']);
    expect(streaks).toEqual([0, 1]);
    expect(h.waits).toEqual([1000, 2000]);
    expect(h.events).toEqual(['start b']);
  });

  it('지금 원하는 곡이 실패하면 알리고, 지나간 곡의 실패는 알리지 않는다', async () => {
    const h = harness();
    h.queue.play('a');
    h.queue.play('b');
    h.sent[0].reject(new Error('403'));
    await flush();
    expect(h.events).toEqual([]);
    expect(h.uris()).toEqual(['a', 'b']);

    h.sent[1].reject(new Error('403'));
    await flush();
    expect(h.events).toEqual(['error b']);
    expect(h.queue.wanted).toBeNull();
    expect(h.queue.busy).toBe(false);
  });

  it('한 곡을 정해진 횟수만큼 보내도 안 되면 포기한다', async () => {
    const h = harness({ retryDelay: () => 10, maxAttempts: 3 });
    h.queue.play('a');
    for (let i = 0; i < 3; i++) {
      h.sent[i].reject(new Error('503'));
      await flush();
    }
    expect(h.sent).toHaveLength(3);
    expect(h.events).toEqual(['error a']);
    expect(h.queue.busy).toBe(false);
  });
});
