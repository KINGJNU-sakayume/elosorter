// Life Hub 동기화의 자동 업로드 시점 정책.

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
