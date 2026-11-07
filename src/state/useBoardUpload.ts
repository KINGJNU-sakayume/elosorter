import { useEffect, useRef, useState } from 'react';
import type { SessionData } from '../core/session/schema';
import { boardGateOpen, createBoardUploader } from '../services/lifehub/boardUpload';
import type { HubSnapshot } from '../services/lifehub/engine';
import { browserDeps } from '../services/lifehub/remote';

/** 세션 변경 뒤 알림을 미루는 시간. useLocalPersistence의 디바운스(300ms)보다 길어야 한다 */
const NOTIFY_DELAY_MS = 1000;

interface Options {
  session: SessionData;
  /**
   * 이 기기의 마지막 저장 시각(useLocalPersistence). 앱 상태의 session.savedAt은 불러올 때 값에서 바뀌지 않으므로
   * 타일 날짜는 이것으로 쓴다.
   */
  savedAt: string | null;
  snapshot: HubSnapshot;
  /** Life Hub가 토큰을 거부해 연결이 끊겼을 때 (엔진 상태를 다시 읽게 한다) */
  onNotConnected: () => void;
}

/**
 * 보드 타일 목록 업로드를 앱 상태에 잇는다. 판단(언제·올릴지)은 services/lifehub/boardUpload.ts가 한다.
 *  - 동기화로 이번 실행에서 서버와 맞춘 뒤(boardGateOpen)가 되면 한 번 시도한다: 남은 것, 하루 지난 것.
 *  - 세션이 바뀌면 1초 뒤(저장이 끝나 날짜가 맞은 뒤) '보낼 것 있음'을 남기고 시도한다 (10분에 한 번 이하).
 *  - 탭이 다시 보이면 한 번 더 시도한다 (하루 지난 것).
 * 실패는 다른 기능을 막지 않는다. 권한 부족이면 needsReconnect만 켠다 (토큰은 그대로).
 */
export function useBoardUpload({ session, savedAt, snapshot, onNotConnected }: Options): { needsReconnect: boolean } {
  const gate = boardGateOpen(snapshot);
  const latest = useRef({ session, savedAt, gate, onNotConnected });
  useEffect(() => {
    latest.current = { session, savedAt, gate, onNotConnected };
  });
  const [, setTick] = useState(0);

  // 호스트 함수는 업로더가 효과·타이머에서만 부른다. 렌더 중에는 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [uploader] = useState(() => createBoardUploader({
    deps: browserDeps(),
    getSession: () => ({ ...latest.current.session, savedAt: latest.current.savedAt ?? latest.current.session.savedAt }),
    ready: () => latest.current.gate,
    onState: () => setTick(n => n + 1),
    onNotConnected: () => latest.current.onNotConnected(),
  }));
  useEffect(() => () => uploader.dispose(), [uploader]);

  // 동기화로 맞춘 뒤(앱을 연 뒤 첫 확인, 다시 연결한 뒤 등): 남은 것과 하루 지난 것
  useEffect(() => {
    if (gate) void uploader.start();
  }, [gate, uploader]);

  // 타일에 영향을 줄 수 있는 변화. 로컬 저장(300ms 디바운스)이 끝난 뒤에 보아 날짜가 이번 저장을 따르게 한다
  useEffect(() => {
    const timer = setTimeout(() => { void uploader.notifyChange(); }, NOTIFY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, uploader]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void uploader.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [uploader]);

  return { needsReconnect: snapshot.connected && uploader.needsReconnect() };
}
