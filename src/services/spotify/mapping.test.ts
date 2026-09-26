import { describe, expect, it } from 'vitest';
import { playlistFromItem, trackFromItem, uniqueTracks, userFromMe } from './mapping';

const savedItem = (id: string, extra: Record<string, unknown> = {}) => ({
  added_at: '2025-01-02T03:04:05Z',
  track: {
    id,
    name: `Song ${id}`,
    type: 'track',
    uri: `spotify:track:${id}`,
    duration_ms: 201000,
    artists: [{ name: 'A' }, { name: 'B' }, { bogus: true }],
    album: {
      name: 'Album',
      images: [
        { url: 'https://i/640', width: 640, height: 640 },
        { url: 'https://i/300', width: 300, height: 300 },
        { url: 'https://i/64', width: 64, height: 64 },
      ],
    },
    ...extra,
  },
});

describe('trackFromItem', () => {
  it('maps a saved-track item', () => {
    const t = trackFromItem(savedItem('x1'))!;
    expect(t).toMatchObject({
      id: 'x1', name: 'Song x1', artists: ['A', 'B'], album: 'Album',
      image: 'https://i/640', thumb: 'https://i/300', durationMs: 201000,
      addedAt: '2025-01-02T03:04:05Z', tier: null, rating: 1500, comparisons: 0,
    });
  });

  it('skips local files, removed tracks and podcast episodes', () => {
    expect(trackFromItem({ track: null })).toBeNull();
    expect(trackFromItem(savedItem('x', { is_local: true }))).toBeNull();
    expect(trackFromItem(savedItem('x', { type: 'episode' }))).toBeNull();
    expect(trackFromItem({ track: { name: 'no id' } })).toBeNull();
    expect(trackFromItem('garbage')).toBeNull();
  });

  it('tolerates missing artwork', () => {
    const t = trackFromItem(savedItem('x', { album: { name: 'N' } }))!;
    expect(t.image).toBe('');
    expect(t.thumb).toBeUndefined();
  });
});

describe('uniqueTracks', () => {
  it('drops duplicates and invalid entries', () => {
    const ts = uniqueTracks([savedItem('a'), savedItem('b'), savedItem('a'), { track: null }]);
    expect(ts.map(t => t.id)).toEqual(['a', 'b']);
  });
});

describe('userFromMe / playlistFromItem', () => {
  it('maps the profile', () => {
    expect(userFromMe({ id: 'u', display_name: null, images: [] })).toEqual({
      id: 'u', displayName: 'u', imageUrl: '',
    });
  });

  it('maps playlists with either tracks or items counters', () => {
    expect(playlistFromItem({ id: 'p', name: 'Mix', tracks: { total: 12 }, owner: { display_name: 'me' } }))
      .toMatchObject({ id: 'p', name: 'Mix', trackCount: 12, owner: 'me' });
    expect(playlistFromItem({ id: 'q', name: 'New', items: { total: 3 } })!.trackCount).toBe(3);
    expect(playlistFromItem(null)).toBeNull();
  });
});
