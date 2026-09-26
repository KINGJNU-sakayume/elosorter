import { describe, expect, it } from 'vitest';
import { rankTracks, recomputeRatings } from '../rating/engine';
import { migrateV1, parseSession, serializeSession, summarize, type SessionData } from './schema';

// v1(커밋 8720872)이 localStorage에 남기던 모양 그대로
const v1Track = (id: string, tier: 1 | 2 | 3 | null, rating: number, comparisons: number) => ({
  id, name: `Song ${id}`, artists: ['Artist'], image: `https://i.scdn.co/image/${id}`,
  album: 'Album', uri: `spotify:track:${id}`, addedAt: '2024-01-01T00:00:00Z',
  tier, rating, comparisons, isNew: false, durationMs: 200000,
});

const v1Session = {
  tracks: [
    v1Track('a1', 1, 1890, 12),
    v1Track('a2', 1, 1829, 0),
    v1Track('b1', 2, 1702, 9),
    v1Track('b2', 2, 1580, 7),
    v1Track('b3', 2, 1605, 0),
    v1Track('c1', 3, 1420, 5),
    v1Track('c2', 3, 1310, 6),
    v1Track('c3', 3, 1365, 0),
    v1Track('u1', null, 1500, 0),
  ],
  compCount: 20,
  rsiDeltas: [12, 30, 8],
  currentSource: 'liked',
  seenPairs: ['a1|a2', 'b1|b2', 'not a key'],
  lastPairKey: 'b1|b2',
  savedAt: '2025-05-01T10:00:00.000Z',
};

describe('v1 migration', () => {
  it('keeps metadata and turns compared tracks into explicit priors', () => {
    const s = parseSession(v1Session)!;
    expect(s.version).toBe(2);
    expect(s.source).toBe('liked');
    expect(s.compCount).toBe(20);
    expect(s.matches).toEqual([]);
    expect(s.legacySeen).toEqual(['a1|a2', 'b1|b2']);
    const a1 = s.tracks.find(t => t.id === 'a1')!;
    expect(a1.prior!.offset).toBeCloseTo(1890 - 1829, 6);
    expect(a1.prior!.sd).toBeGreaterThan(0);
    expect(s.tracks.find(t => t.id === 'a2')!.prior).toBeUndefined();
    expect(s.tracks.find(t => t.id === 'u1')!.tier).toBeNull();
  });

  it('preserves the existing v1 ranking', () => {
    const s = migrateV1(v1Session);
    const ranked = rankTracks(recomputeRatings(s.tracks, s.matches)).map(t => t.id);
    const v1Order = v1Session.tracks
      .filter(t => t.tier !== null)
      .sort((x, y) => y.rating - x.rating)
      .map(t => t.id);
    expect(ranked).toEqual(v1Order);
  });
});

describe('parseSession', () => {
  it('round-trips a v2 session through JSON', () => {
    const migrated = parseSession(v1Session)!;
    const tracks = recomputeRatings(migrated.tracks, []);
    const session: SessionData = {
      ...migrated,
      ownerId: 'user1',
      tracks,
      matches: [['b1', 'b2', 0.75], ['c1', 'c2', 1]],
      compCount: 22,
    };
    const back = parseSession(JSON.parse(JSON.stringify(serializeSession(session))))!;
    expect(back).toEqual(session);
  });

  it('drops malformed tracks, duplicates and dangling matches', () => {
    const s = parseSession({
      version: 2,
      tracks: [{ id: 'x', tier: 2 }, { id: 'x', tier: 3 }, { name: 'no id' }, null, { id: 'y', tier: 9 }],
      matches: [['x', 'y', 1], ['x', 'ghost', 1], ['x', 'x', 1], ['x', 'y', 7], 'junk'],
      compCount: -3,
      source: 'playlist:../../etc',
    })!;
    expect(s.tracks.map(t => t.id)).toEqual(['x', 'y']);
    expect(s.tracks[0].tier).toBe(2);
    expect(s.tracks[1].tier).toBeNull();
    expect(s.matches).toEqual([['x', 'y', 1]]);
    expect(s.compCount).toBe(1);
    expect(s.source).toBeNull();
  });

  it('rejects unknown shapes and versions', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('text')).toBeNull();
    expect(parseSession({ version: 99, tracks: [] })).toBeNull();
    expect(parseSession({ foo: 1 })).toBeNull();
  });
});

describe('summarize', () => {
  it('counts tracks and classified tracks', () => {
    const s = parseSession(v1Session)!;
    expect(summarize(s)).toMatchObject({ trackCount: 9, tieredCount: 8, compCount: 20, source: 'liked' });
  });
});
