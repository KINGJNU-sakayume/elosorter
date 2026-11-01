import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimEmbed, pauseActiveEmbed, releaseEmbed, stopEmbed } from './embedPlayback';

afterEach(() => pauseActiveEmbed());

describe('single active Spotify embed', () => {
  it('pauses A before B can play', () => {
    const a = { pause: vi.fn() };
    const b = { pause: vi.fn() };
    claimEmbed(a);
    claimEmbed(b);
    expect(a.pause).toHaveBeenCalledOnce();
    expect(b.pause).not.toHaveBeenCalled();
    pauseActiveEmbed();
    expect(b.pause).toHaveBeenCalledOnce();
  });

  it('ignores stale pause events from an already replaced controller', () => {
    const a = { pause: vi.fn() };
    const b = { pause: vi.fn() };
    claimEmbed(a);
    claimEmbed(b);
    releaseEmbed(a);
    pauseActiveEmbed();
    expect(b.pause).toHaveBeenCalledOnce();
  });

  it('stops and releases an owned embed on unmount', () => {
    const a = { pause: vi.fn() };
    claimEmbed(a);
    stopEmbed(a);
    pauseActiveEmbed();
    expect(a.pause).toHaveBeenCalledOnce();
  });
});
