import { describe, expect, it, vi } from 'vitest';
import { compactMatches, recomputeRatings } from '../rating/engine';
import { createInitialState, reducer, type Action, type AppState } from '../../state/reducer';
import { migrateV1, parseSession, serializeSession, type SessionData } from './schema';
import {
  measureSyncDocument, parseSyncDocument, serializeSyncBody, SYNC_LIMIT_BYTES, syncContentKey, syncSizeOfBody,
  toSyncDocument, utf8Bytes,
} from './syncDoc';
import { syntheticSession } from './synthetic';

const SCORES = [0, 0.25, 0.5, 0.75, 1];

/** 앱과 같은 경로로 세션을 만든다: 비교를 하나씩 쌓으며 웜 스타트 추정치가 누적된다 */
function play(tracks: number, comparisons: number, seed: number): AppState {
  const base = syntheticSession({ tracks, matches: 0, seed });
  let state = createInitialState(seed, base);
  const step = (a: Action) => { state = reducer(state, a); };
  step({ type: 'setPhase', phase: 'sort' });
  for (let k = 0; k < comparisons && state.curPair; k++) {
    step({ type: 'choose', pair: state.curPair, score: SCORES[(k * 7 + seed) % SCORES.length] });
  }
  return state;
}

/** 서버를 거친 것처럼: JSON 문자열 → 파싱 → 앱이 불러올 때 하는 계산 */
const viaServer = (s: SessionData) => parseSyncDocument(JSON.parse(serializeSyncBody(s)))!;

const ratings = (s: SessionData) => s.tracks.map(t => [t.id, t.rating, t.sigma] as const);

describe('sync document shape', () => {
  const s = syntheticSession({ tracks: 40, matches: 60, seed: 7 });
  const doc = toSyncDocument(s);

  it('keeps what the Hub checks: version 2 and a tracks array', () => {
    expect(doc.version).toBe(2);
    expect(Array.isArray(doc.tracks)).toBe(true);
  });

  it('leaves out only the derived track values; everything else of serializeSession stays', () => {
    const full = serializeSession(s) as Record<string, unknown>;
    const { tracks: docTracks, ...docRest } = doc;
    const { tracks: fullTracks, ...fullRest } = full;
    expect(docRest).toEqual(fullRest);
    for (const t of docTracks as Record<string, unknown>[]) {
      expect(t).not.toHaveProperty('rating');
      expect(t).not.toHaveProperty('sigma');
    }
    (fullTracks as Record<string, unknown>[]).forEach((t, i) => {
      const { rating, sigma, ...rest } = t;
      void rating; void sigma;
      expect((docTracks as unknown[])[i]).toEqual(rest);
    });
  });

  it('is plain JSON text (not compressed)', () => {
    const body = serializeSyncBody(s);
    expect(body.startsWith('{')).toBe(true);
    expect(JSON.parse(body).tracks).toHaveLength(40);
  });

  it('is smaller than the full serialization', () => {
    expect(serializeSyncBody(s).length).toBeLessThan(JSON.stringify(serializeSession(s)).length);
  });
});

describe('round trip: session → sync document → session', () => {
  it('recomputes the left-out values exactly, after incremental play, tier changes and undo', () => {
    let state = play(120, 400, 11);
    const step = (a: Action) => { state = reducer(state, a); };
    const first = state.session.tracks.find(t => t.tier === 3)!;
    step({ type: 'retier', id: first.id, tier: 1 });
    step({ type: 'undoChoose' });
    step({ type: 'undoChoose' });
    const live = state.session;
    expect(live.tracks.some(t => t.sigma !== undefined)).toBe(true);
    expect(ratings(viaServer(live))).toEqual(ratings(live));
    expect(viaServer(live)).toEqual({ ...live, tracks: live.tracks });
  });

  it('recomputes exactly with compacted comparisons (per-track priors)', () => {
    const base = syntheticSession({ tracks: 50, matches: 600, seed: 5 });
    const { tracks, matches } = compactMatches(base.tracks, base.matches, 200);
    expect(tracks.some(t => t.prior)).toBe(true);
    const live: SessionData = { ...base, tracks, matches };
    expect(ratings(viaServer(live))).toEqual(ratings(live));
  });

  it('recomputes exactly for a migrated v1 session (explicit priors, no matches)', () => {
    const track = (id: string, tier: 1 | 2 | 3 | null, rating: number, comparisons: number) => ({
      id, name: id, artists: [], album: '', image: '', uri: `spotify:track:${id}`, addedAt: null, tier, rating, comparisons, isNew: false,
    });
    const migrated = migrateV1({
      tracks: [track('a', 1, 1890, 12), track('b', 2, 1702, 9), track('c', 3, 1420, 5), track('d', 3, 1365, 0), track('u', null, 1500, 0)],
      compCount: 26, currentSource: 'liked', seenPairs: [],
    });
    const live = { ...migrated, tracks: recomputeRatings(migrated.tracks, migrated.matches) };
    expect(ratings(viaServer(live))).toEqual(ratings(live));
  });

  it('does not depend on randomness: the same document always gives the same values', () => {
    const live = play(60, 150, 3).session;
    const body = serializeSyncBody(live);
    const random = vi.spyOn(Math, 'random');
    const a = parseSyncDocument(JSON.parse(body))!;
    const b = parseSyncDocument(JSON.parse(body))!;
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(ratings(a)).toEqual(ratings(b));
    expect(ratings(a)).toEqual(ratings(live));
  });

  it('keeps every other session field', () => {
    const live = { ...play(30, 60, 2).session, ownerId: 'someone', sourceName: '내 플레이리스트', syncVersion: 4 };
    const back = viaServer(live);
    expect(back).toEqual(live);
  });
});

describe('parseSyncDocument', () => {
  it('rejects anything that is not a version-2 session document', () => {
    expect(parseSyncDocument(null)).toBeNull();
    expect(parseSyncDocument([])).toBeNull();
    expect(parseSyncDocument({ version: 2 })).toBeNull();
    expect(parseSyncDocument({ version: 1, tracks: [] })).toBeNull();
    // v1 모양(version 없음)은 Hub가 보증하지 않으므로 서버 문서로는 받지 않는다
    expect(parseSyncDocument({ tracks: [{ id: 'a' }] })).toBeNull();
  });

  it('filters malformed tracks the same way parseSession does', () => {
    const s = parseSyncDocument({ version: 2, tracks: [{ id: 'x', tier: 2 }, { name: 'no id' }, { id: 'x', tier: 3 }], matches: [] })!;
    expect(s.tracks.map(t => t.id)).toEqual(['x']);
    expect(parseSession({ version: 2, tracks: [{ id: 'x' }] })).not.toBeNull();
  });
});

describe('size', () => {
  it('counts UTF-8 bytes: Hangul is 3 bytes per character', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('가나다')).toBe(9);
    expect(utf8Bytes('😀')).toBe(4);
  });

  it('limit is 900 KiB = 921,600 bytes; only strictly larger is too large', () => {
    expect(SYNC_LIMIT_BYTES).toBe(921_600);
    expect(syncSizeOfBody('a'.repeat(921_600))).toEqual({ bytes: 921_600, limit: 921_600, tooLarge: false });
    expect(syncSizeOfBody('a'.repeat(921_601)).tooLarge).toBe(true);
    // 글자 수로는 한도 아래지만 바이트로는 넘는다
    expect(syncSizeOfBody('가'.repeat(307_201)).tooLarge).toBe(true);
    expect(syncSizeOfBody('가'.repeat(307_200)).tooLarge).toBe(false);
  });

  it('measureSyncDocument measures exactly the body that would be sent', () => {
    const s = syntheticSession({ tracks: 30, matches: 20, seed: 9 });
    expect(measureSyncDocument(s).bytes).toBe(utf8Bytes(serializeSyncBody(s)));
  });
});

describe('syncContentKey', () => {
  const s = syntheticSession({ tracks: 20, matches: 30, seed: 4 });

  it('ignores save time and sync bookkeeping, and key order', () => {
    const moved = { ...s, savedAt: '2030-01-01T00:00:00.000Z', syncVersion: 9 };
    expect(syncContentKey(moved)).toBe(syncContentKey(s));
    const reordered = { ...s, tracks: s.tracks.map(t => Object.fromEntries(Object.entries(t).reverse()) as typeof t) };
    expect(syncContentKey(reordered)).toBe(syncContentKey(s));
  });

  it('changes when the content changes', () => {
    expect(syncContentKey({ ...s, matches: [...s.matches, [s.tracks[0].id, s.tracks[1].id, 1]] })).not.toBe(syncContentKey(s));
    expect(syncContentKey({ ...s, tracks: s.tracks.map((t, i) => (i === 0 ? { ...t, tier: null } : t)) })).not.toBe(syncContentKey(s));
  });

  it('is the same for a session and the same session read back from a sync document', () => {
    const live = play(40, 80, 6).session;
    expect(syncContentKey(viaServer(live))).toBe(syncContentKey(live));
  });
});
