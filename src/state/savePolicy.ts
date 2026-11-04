// 자동 저장 시점 정책. Supabase 백업과 Life Hub 동기화가 같은 규칙을 쓴다.

/** 이만큼 변경이 쌓이면 바로 업로드, 아니면 마지막 변경 후 IDLE_MS 뒤에 업로드 */
export const SAVE_EVERY = 10;
export const IDLE_MS = 15_000;
/** 업로드가 오류로 끝난 뒤 다시 시도하는 간격 */
export const RETRY_MS = 30_000;

/** 다음 자동 업로드까지의 지연(ms). 올릴 수 없거나 올릴 것이 없으면 null */
export function autoSaveDelay({ canSave, unsaved, failed }: { canSave: boolean; unsaved: number; failed: boolean }): number | null {
  if (!canSave || unsaved <= 0) return null;
  return failed ? RETRY_MS : unsaved >= SAVE_EVERY ? 0 : IDLE_MS;
}

/**
 * Supabase elo_state에 써도 되는가. Life Hub 동기화가 켜져 있고 쓰기가 한 번이라도 성공했으면 그 뒤로 쓰지 않는다.
 * 동기화를 끄면 다시 쓴다 (이것이 롤백 경로다). 읽기는 이 규칙과 무관하게 남는다 (5단계의 일회성 복사용).
 */
export const supabaseWritesAllowed = (hub: { enabled: boolean; everSucceeded: boolean }): boolean => !(hub.enabled && hub.everSucceeded);
