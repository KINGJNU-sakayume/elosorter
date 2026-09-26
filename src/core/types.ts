// 도메인 타입. React/브라우저 API에 의존하지 않는 순수 데이터 정의만 둔다.

export type Tier = 1 | 2 | 3;
export const TIERS: readonly Tier[] = [1, 2, 3];

export function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3;
}

/**
 * 비교 결과 한 건. 저장 용량을 줄이려고 튜플로 둔다.
 * scoreA: 왼쪽(a) 곡의 점수 — 1 = a 확실히 우세, 0.5 = 비슷, 0 = b 확실히 우세.
 */
export type Match = [a: string, b: string, scoreA: number];

/**
 * 곡별 명시적 사전분포. 티어 사전분포 평균에서의 오프셋과 표준편차(Elo 단위).
 * v1 세션에서 옮겨온 곡(비교 기록은 없고 레이팅만 있음)이나
 * 오래된 비교 기록을 압축할 때 사용한다.
 */
export interface TrackPrior {
  offset: number;
  sd: number;
}

export interface Track {
  id: string;
  name: string;
  artists: string[];
  album: string;
  /** 큰 앨범 아트 (비교/분류 화면) */
  image: string;
  /** 작은 앨범 아트 (목록용). 레거시 데이터에는 없을 수 있음 */
  thumb?: string;
  uri: string;
  addedAt: string | null;
  durationMs?: number;
  tier: Tier | null;
  /** 사후 평균 레이팅 (Elo 척도). 티어·비교 기록에서 계산되는 파생값 */
  rating: number;
  /** 사후 표준편차 (Elo 척도). 작을수록 순위가 확실하다. 파생값 */
  sigma?: number;
  comparisons: number;
  /** 동기화로 새로 들어온 곡 표시 */
  isNew: boolean;
  prior?: TrackPrior;
}

/** 곡 목록의 출처: 좋아요 곡 또는 특정 플레이리스트 */
export type Source = 'liked' | `playlist:${string}`;
