import type { SessionData } from '../../core/session/schema';

export function sourceLabel(session: Pick<SessionData, 'source' | 'sourceName'>): string {
  if (session.source === 'liked') return '좋아요 표시한 곡';
  if (session.source) return session.sourceName ?? '플레이리스트';
  return '불러온 곡';
}
