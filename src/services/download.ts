import { parseSession, serializeSession, type SessionData } from '../core/session/schema';

function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 revoke하면 일부 브라우저(Firefox 등)에서 다운로드가 취소된다
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const today = (): string => new Date().toISOString().slice(0, 10);

export function exportBackup(session: SessionData): void {
  downloadFile(
    `elo-sorter-backup-${today()}.json`,
    JSON.stringify({ ...serializeSession(session), savedAt: new Date().toISOString() }),
    'application/json',
  );
}

export async function readBackup(file: File): Promise<SessionData> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON 파일이 아닙니다');
  }
  const session = parseSession(json);
  if (!session || !session.tracks.length) throw new Error('ELO Sorter 백업 파일이 아닙니다');
  return session;
}

/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다 */
export function exportCsv(filename: string, rows: (string | number)[][]): void {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
  downloadFile(filename, '\uFEFF' + csv, 'text/csv;charset=utf-8');
}

