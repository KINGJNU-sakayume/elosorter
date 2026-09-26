// 시뮬레이션에서 비교할 전략들. 각 전략은 (다음 쌍 고르기 → 응답 기록 → 추정치) 순환을 구현한다.

import type { Match, Tier, Track } from '../src/core/types';
import type { Focus } from '../src/core/rating/pairing';
import { pickNextPair, rankingAccuracy, recomputeRatings } from '../src/core/rating/engine';
import type { Rng } from '../src/core/rating/rng';
import { answer, V1_FAST, V1_FINE, V2_SCALE, type Library, type Scale } from './oracle';
import {
  computeElo,
  FINE_MODE_THRESHOLD,
  getNextPair,
  initRating,
  pairKey,
  rememberPair,
  type LegacyTrack,
} from './legacy';

export interface Strategy {
  name: string;
  step(rng: Rng): void;
  estimate(): Map<string, number>;
  /** 앱이 화면에 보여주는 진행 지표 (v1: 정렬 안정도, v2: 예상 정확도) */
  progress(): number | null;
}

type StrategyFactory = (lib: Library) => Strategy;

/** v1 그대로: Elo + K 스케줄 + 경계 K=60 + 같은 티어 우선 페어링 + 빠른/세밀 모드 */
function legacyStrategy(name: string, boundaryBoost: boolean): StrategyFactory {
  return lib => {
    const tracks = new Map<string, LegacyTrack>(
      lib.ids.map(id => {
        const tier = lib.tiers.get(id)!;
        return [id, { id, tier, rating: initRating(tier), comparisons: 0 }];
      }),
    );
    const seen = new Set<string>();
    const deltas: number[] = [];
    let last = '';
    return {
      name,
      step(rng) {
        const pair = getNextPair([...tracks.values()], seen, last, rng);
        if (!pair) return;
        const [a, b] = pair.map(id => tracks.get(id)!);
        const scale = Math.abs(a.rating - b.rating) < FINE_MODE_THRESHOLD ? V1_FINE : V1_FAST;
        const s = answer(lib, a.id, b.id, scale, rng);
        const { newA, newB, avgDelta } = computeElo(a, b, s, boundaryBoost);
        tracks.set(a.id, { ...a, rating: newA, comparisons: a.comparisons + 1 });
        tracks.set(b.id, { ...b, rating: newB, comparisons: b.comparisons + 1 });
        last = pairKey(a.id, b.id);
        rememberPair(seen, last);
        deltas.push(avgDelta);
      },
      estimate: () => new Map([...tracks.values()].map(t => [t.id, t.rating])),
      // v1 SortPhase의 "정렬 안정도" = 1 − (최근 20회 평균 |Δ레이팅|) / 50
      progress() {
        if (deltas.length < 5) return null;
        const recent = deltas.slice(-20);
        const rsi = recent.reduce((x, y) => x + y, 0) / recent.length;
        return Math.max(0, Math.min(100, Math.round((1 - rsi / 50) * 100))) / 100;
      },
    };
  };
}

function toTrack(id: string, tier: Tier): Track {
  return {
    id, name: id, artists: [], album: '', image: '', uri: '', addedAt: null,
    tier, rating: 1500, comparisons: 0, isNew: false,
  };
}

/** 베이지안 BT 모델. pairing = 'active'(개선안) 또는 'legacy'(v1 페어링 규칙) */
function btStrategy(name: string, pairing: 'active' | 'legacy', scale: Scale, focus: Focus = 'all'): StrategyFactory {
  return lib => {
    let tracks = recomputeRatings(lib.ids.map(id => toTrack(id, lib.tiers.get(id)!)), []);
    const matches: Match[] = [];
    const seen = new Set<string>();
    let last: [string, string] | null = null;
    return {
      name,
      step(rng) {
        let pair: [string, string] | null;
        if (pairing === 'active') {
          pair = pickNextPair(tracks, matches, { rng, focus, avoid: last ?? [] });
        } else {
          const counts = new Map<string, number>();
          for (const [a, b] of matches) {
            counts.set(a, (counts.get(a) ?? 0) + 1);
            counts.set(b, (counts.get(b) ?? 0) + 1);
          }
          const pool = tracks.map(t => ({
            id: t.id, tier: t.tier!, rating: t.rating, comparisons: counts.get(t.id) ?? 0,
          }));
          pair = getNextPair(pool, seen, last ? pairKey(...last) : '', rng);
        }
        if (!pair) return;
        const s = answer(lib, pair[0], pair[1], scale, rng);
        matches.push([pair[0], pair[1], s]);
        seen.add(pairKey(...pair));
        last = pair;
        tracks = recomputeRatings(tracks, matches);
      },
      estimate: () => new Map(tracks.map(t => [t.id, t.rating])),
      progress: () => rankingAccuracy(tracks),
    };
  };
}

export const STRATEGIES: Record<string, StrategyFactory> = {
  'v1 (현재)': legacyStrategy('v1 (현재)', true),
  'v1 − 경계 K 제거': legacyStrategy('v1 − 경계 K 제거', false),
  'BT 모델 + v1 페어링': btStrategy('BT 모델 + v1 페어링', 'legacy', V2_SCALE),
  'BT 모델 + 능동 페어링 (개선안)': btStrategy('BT 모델 + 능동 페어링 (개선안)', 'active', V2_SCALE),
  '개선안 · 상위권 집중 모드': btStrategy('개선안 · 상위권 집중 모드', 'active', V2_SCALE, 'top'),
};
