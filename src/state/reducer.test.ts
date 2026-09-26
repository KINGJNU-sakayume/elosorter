import { describe, expect, it } from 'vitest';
import type { Track } from '../core/types';
import { createInitialState, reducer, type Action, type AppState } from './reducer';

function track(id: string): Track {
  return {
    id, name: `Song ${id}`, artists: ['A'], album: 'X', image: '', uri: `spotify:track:${id}`,
    addedAt: null, tier: null, rating: 1500, comparisons: 0, isNew: false,
  };
}

const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

function sortedSession(): AppState {
  let s = run(createInitialState(1), {
    type: 'newSession', source: 'liked', sourceName: null, tracks: ids.map(track),
  });
  ids.forEach((id, i) => { s = reducer(s, { type: 'assignTier', id, tier: ((i % 3) + 1) as 1 | 2 | 3 }); });
  return reducer(s, { type: 'setPhase', phase: 'sort' });
}

const byId = (s: AppState, id: string) => s.session.tracks.find(t => t.id === id)!;

describe('session lifecycle', () => {
  it('starts a new session in the tier phase', () => {
    const s = run(createInitialState(1), {
      type: 'newSession', source: 'liked', sourceName: null, tracks: [track('a'), track('b'), track('a')],
    });
    expect(s.phase).toBe('tier');
    expect(s.session.tracks.map(t => t.id)).toEqual(['a', 'b']);
    expect(s.revision).toBe(1);
  });

  it('refuses phases whose prerequisites are missing', () => {
    const s = run(createInitialState(1), { type: 'setPhase', phase: 'sort' });
    expect(s.phase).toBe('import');
  });

  it('claims an unowned session for the logged-in user', () => {
    const s = run(createInitialState(1),
      { type: 'newSession', source: 'liked', sourceName: null, tracks: [track('a')] },
      { type: 'setUser', user: { id: 'me', displayName: 'Me', imageUrl: '' } });
    expect(s.session.ownerId).toBe('me');
  });
});

describe('tier phase', () => {
  it('assigns, bulk-assigns and undoes in groups', () => {
    let s = run(createInitialState(1), {
      type: 'newSession', source: 'liked', sourceName: null, tracks: ids.map(track),
    });
    s = run(s, { type: 'assignTier', id: 't0', tier: 1 }, { type: 'assignRemaining', tier: 3 });
    expect(s.session.tracks.every(t => t.tier !== null)).toBe(true);
    expect(byId(s, 't0').rating).toBeGreaterThan(byId(s, 't1').rating);

    s = reducer(s, { type: 'undoTier' });
    expect(s.session.tracks.filter(t => t.tier === null)).toHaveLength(11);
    s = reducer(s, { type: 'undoTier' });
    expect(byId(s, 't0').tier).toBeNull();
    expect(byId(s, 't0').sigma).toBeUndefined();
  });
});

describe('sort phase', () => {
  it('picks a valid pair when entering the phase', () => {
    const s = sortedSession();
    expect(s.phase).toBe('sort');
    expect(s.curPair).not.toBeNull();
    expect(s.curPair![0]).not.toBe(s.curPair![1]);
  });

  it('records a choice, updates ratings and moves to a new pair', () => {
    const s = sortedSession();
    const [a, b] = s.curPair!;
    const next = reducer(s, { type: 'choose', pair: [a, b], score: 1 });
    expect(next.session.matches).toEqual([[a, b, 1]]);
    expect(next.session.compCount).toBe(1);
    expect(byId(next, a).comparisons).toBe(1);
    expect(byId(next, a).rating - byId(s, a).rating).toBeGreaterThan(0);
    expect(byId(next, b).rating - byId(s, b).rating).toBeLessThan(0);
    expect(next.curPair).not.toEqual([a, b]);
    expect(next.revision).toBe(s.revision + 1);
  });

  it('ignores a choice for a pair that is no longer on screen', () => {
    const s = sortedSession();
    const [a, b] = s.curPair!;
    const once = reducer(s, { type: 'choose', pair: [a, b], score: 1 });
    expect(reducer(once, { type: 'choose', pair: [a, b], score: 1 })).toBe(once);
  });

  it('undo restores ratings and shows the same pair again', () => {
    const s = sortedSession();
    const pair = s.curPair!;
    const undone = run(s, { type: 'choose', pair, score: 0.75 }, { type: 'undoChoose' });
    expect(undone.session.matches).toEqual([]);
    expect(undone.session.compCount).toBe(0);
    expect(undone.curPair).toEqual(pair);
    for (const t of s.session.tracks) {
      expect(byId(undone, t.id).rating).toBeCloseTo(t.rating, 1);
      expect(byId(undone, t.id).comparisons).toBe(0);
    }
  });

  it('skip moves on without recording anything', () => {
    const s = sortedSession();
    const skipped = reducer(s, { type: 'skip' });
    expect(skipped.session.matches).toEqual([]);
    expect(skipped.curPair).not.toEqual(s.curPair);
    expect(skipped.revision).toBe(s.revision);
  });

  it('is deterministic (pure) for the same state and action', () => {
    const s = sortedSession();
    const action: Action = { type: 'choose', pair: s.curPair!, score: 0.5 };
    expect(reducer(s, action)).toEqual(reducer(s, action));
  });

  it('clears the tier undo stack once comparisons start', () => {
    const s = sortedSession();
    expect(s.tierHistory.length).toBeGreaterThan(0);
    expect(reducer(s, { type: 'choose', pair: s.curPair!, score: 1 }).tierHistory).toEqual([]);
  });
});

describe('ranking edits', () => {
  it('retier drops the explicit prior and changes the rating', () => {
    const s = sortedSession();
    const t = s.session.tracks.find(x => x.tier === 3)!;
    const withPrior: AppState = {
      ...s,
      session: {
        ...s.session,
        tracks: s.session.tracks.map(x => (x.id === t.id ? { ...x, prior: { offset: 40, sd: 60 } } : x)),
      },
    };
    const next = reducer(withPrior, { type: 'retier', id: t.id, tier: 1 });
    expect(byId(next, t.id).tier).toBe(1);
    expect(byId(next, t.id).prior).toBeUndefined();
    expect(byId(next, t.id).rating).toBeGreaterThan(byId(s, t.id).rating);
  });
});

describe('sync', () => {
  it('absorbs new tracks as untiered and removes deleted ones with their matches', () => {
    let s = sortedSession();
    const pair = s.curPair!;
    s = reducer(s, { type: 'choose', pair, score: 1 });
    const remote = [...ids.filter(id => id !== pair[0]).map(track), track('new1')];
    remote[0] = { ...remote[0], thumb: 'https://i/300' };
    s = reducer(s, { type: 'syncDetected', remote, at: '2026-01-01T00:00:00Z' });
    // 이미 있던 곡은 메타데이터만 갱신되고 티어는 유지된다
    expect(byId(s, remote[0].id).thumb).toBe('https://i/300');
    expect(byId(s, remote[0].id).tier).not.toBeNull();
    expect(s.pendingNew.map(t => t.id)).toEqual(['new1']);
    expect(s.pendingRemovedIds).toEqual([pair[0]]);
    expect(s.session.lastSyncedAt).toBe('2026-01-01T00:00:00Z');

    s = run(s, { type: 'absorbNew' }, { type: 'applyRemoval' });
    expect(byId(s, 'new1')).toMatchObject({ tier: null, isNew: true });
    expect(s.session.tracks.find(t => t.id === pair[0])).toBeUndefined();
    expect(s.session.matches).toEqual([]);
    expect(s.curPair).not.toContain(pair[0]);
  });
});

describe('cloud bookkeeping', () => {
  it('marks a cloud load as synced and a file import as unsynced', () => {
    const s = sortedSession();
    const cloudCopy = { ...s.session, savedAt: '2026-02-02T00:00:00.000Z' };
    const fromCloud = reducer(s, { type: 'hydrate', session: cloudCopy, origin: 'cloud' });
    expect(fromCloud.cloudRevision).toBe(fromCloud.revision);
    expect(fromCloud.session.syncedAt).toBe('2026-02-02T00:00:00.000Z');
    const fromFile = reducer(s, { type: 'hydrate', session: s.session, origin: 'file' });
    expect(fromFile.cloudRevision).toBeLessThan(fromFile.revision);
    expect(fromFile.session.syncedAt).toBeNull();
  });

  it('records the synced cloud version without creating a new change', () => {
    const s = sortedSession();
    const saved = reducer(s, { type: 'cloudSaved', revision: s.revision, savedAt: '2026-03-03T00:00:00.000Z' });
    expect(saved.revision).toBe(s.revision);
    expect(saved.cloudRevision).toBe(s.revision);
    expect(saved.session.syncedAt).toBe('2026-03-03T00:00:00.000Z');
  });
});

describe('enrichDurations', () => {
  it('fills only missing durations', () => {
    let s = sortedSession();
    s = { ...s, session: { ...s.session, tracks: s.session.tracks.map(t => (t.id === 't1' ? { ...t, durationMs: 1000 } : t)) } };
    const next = reducer(s, { type: 'enrichDurations', items: [{ id: 't0', durationMs: 5 }, { id: 't1', durationMs: 9 }] });
    expect(byId(next, 't0').durationMs).toBe(5);
    expect(byId(next, 't1').durationMs).toBe(1000);
    // 메타데이터 보강은 클라우드 업로드 대상 변경으로 치지 않는다
    expect(next.revision).toBe(s.revision);
  });
});
