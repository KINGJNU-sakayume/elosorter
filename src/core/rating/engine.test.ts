import { describe, expect, it } from 'vitest';
import type { Match, Tier, Track } from '../types';
import {
  compactMatches,
  countTiers,
  pickNextPair,
  rankTracks,
  rankingAccuracy,
  recomputeRatings,
  tierOnlyAccuracy,
} from './engine';
import { tierPriors } from './priors';
import { createRng } from './rng';

function track(id: string, tier: Tier | null): Track {
  return {
    id, name: id, artists: ['x'], album: 'y', image: '', uri: `spotify:track:${id}`,
    addedAt: null, tier, rating: 1500, comparisons: 0, isNew: false,
  };
}

const library = (): Track[] => [
  track('a', 1), track('b', 2), track('c', 2), track('d', 3), track('e', 3), track('u', null),
];

describe('recomputeRatings', () => {
  it('uses the tier prior for tracks without comparisons', () => {
    const tracks = recomputeRatings(library(), []);
    const priors = tierPriors(countTiers(tracks));
    expect(tracks[0].rating).toBeCloseTo(priors[1].mean, 1);
    expect(tracks[0].sigma).toBeCloseTo(priors[1].sd, 1);
    expect(tracks[1].rating).toBe(tracks[2].rating);
    // 미분류 곡은 레이팅을 받지 않는다
    expect(tracks[5].rating).toBe(1500);
    expect(tracks[5].sigma).toBeUndefined();
  });

  it('returns the same array when nothing changes', () => {
    const once = recomputeRatings(library(), []);
    expect(recomputeRatings(once, [])).toBe(once);
  });

  it('a comparison reorders tracks and removing it restores the ratings exactly', () => {
    const base = recomputeRatings(library(), []);
    const matches: Match[] = [['c', 'b', 1]];
    const after = recomputeRatings(base, matches);
    const byId = (ts: Track[], id: string) => ts.find(t => t.id === id)!;
    expect(byId(after, 'c').rating).toBeGreaterThan(byId(after, 'b').rating);
    expect(byId(after, 'c').sigma!).toBeLessThan(byId(base, 'c').sigma!);

    const undone = recomputeRatings(after, []);
    for (const t of base) {
      expect(byId(undone, t.id).rating).toBeCloseTo(t.rating, 1);
    }
  });

  it('lets evidence cross tier boundaries', () => {
    let tracks = recomputeRatings(library(), []);
    const matches: Match[] = [];
    for (let i = 0; i < 6; i++) matches.push(['d', 'b', 1], ['d', 'c', 1], ['d', 'a', 0.75]);
    tracks = recomputeRatings(tracks, matches);
    const ranked = rankTracks(tracks).map(t => t.id);
    expect(ranked.indexOf('d')).toBeLessThan(ranked.indexOf('b'));
  });
});

describe('compactMatches', () => {
  it('folds old comparisons into priors without moving ratings much', () => {
    const rng = createRng(5);
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const tracks0 = ids.map((id, i) => track(id, ((i % 3) + 1) as Tier));
    const matches: Match[] = Array.from({ length: 200 }, () => {
      const a = ids[Math.floor(rng() * ids.length)];
      let b = ids[Math.floor(rng() * ids.length)];
      while (b === a) b = ids[Math.floor(rng() * ids.length)];
      return [a, b, rng() < 0.6 ? 1 : 0];
    });
    const full = recomputeRatings(tracks0, matches);
    const compacted = compactMatches(full, matches, 50);
    expect(compacted.matches).toHaveLength(50);
    expect(compacted.tracks.some(t => t.prior)).toBe(true);
    for (let i = 0; i < ids.length; i++) {
      expect(Math.abs(compacted.tracks[i].rating - full[i].rating)).toBeLessThan(25);
    }
  });
});

describe('pickNextPair', () => {
  it('only pairs classified tracks and never pairs a track with itself', () => {
    const tracks = recomputeRatings(library(), []);
    for (let seed = 0; seed < 30; seed++) {
      const pair = pickNextPair(tracks, [], { rng: createRng(seed) })!;
      expect(pair[0]).not.toBe(pair[1]);
      expect(pair).not.toContain('u');
    }
  });

  it('returns null with fewer than two classified tracks', () => {
    expect(pickNextPair([track('a', 1), track('b', null)], [], { rng: createRng(1) })).toBeNull();
  });
});

describe('rankTracks / rankingAccuracy', () => {
  it('ranks classified tracks by rating and reports accuracy above chance', () => {
    const tracks = recomputeRatings(library(), [['e', 'd', 1]]);
    const ranked = rankTracks(tracks);
    expect(ranked).toHaveLength(5);
    expect(ranked[0].id).toBe('a');
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].rating).toBeGreaterThanOrEqual(ranked[i].rating);
    }
    const acc = rankingAccuracy(tracks)!;
    expect(acc).toBeGreaterThan(0.5);
    expect(acc).toBeLessThan(1);
  });
});

describe('tierOnlyAccuracy', () => {
  it('matches the ranking accuracy while there are no comparisons', () => {
    const tracks = recomputeRatings(library(), []);
    expect(tierOnlyAccuracy(tracks)!).toBeCloseTo(rankingAccuracy(tracks)!, 4);
  });

  it('stays put as comparisons accumulate, so it can serve as the baseline', () => {
    const before = tierOnlyAccuracy(recomputeRatings(library(), []))!;
    const matches: Match[] = [['b', 'c', 1], ['d', 'e', 1], ['b', 'c', 1], ['d', 'e', 1]];
    const tracks = recomputeRatings(library(), matches);
    expect(tierOnlyAccuracy(tracks)!).toBeCloseTo(before, 10);
    expect(rankingAccuracy(tracks)!).toBeGreaterThan(before);
  });

  it('ignores per-track priors and unclassified tracks', () => {
    const plain = recomputeRatings(library(), []);
    const withPrior = plain.map(t => (t.id === 'b' ? { ...t, prior: { offset: 120, sd: 40 } } : t));
    expect(tierOnlyAccuracy(withPrior)).toBe(tierOnlyAccuracy(plain));
    expect(tierOnlyAccuracy([track('a', 1), track('u', null)])).toBeNull();
  });
});
