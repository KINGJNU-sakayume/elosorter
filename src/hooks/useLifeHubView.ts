import { lifeHubView, type LifeHubView } from '../components/lifeHubView';
import { useSave } from '../state/context';
import { useLoggedIn } from './useAuth';

/** 지금 Life Hub 상태 (A 연결 전 · B 연결됨 · C 확인 필요). 설정 섹션·설정 진입점 점·불러오기 화면 요약이 함께 쓴다 */
export function useLifeHubView(): LifeHubView {
  const { hub } = useSave();
  const loggedIn = useLoggedIn();
  return lifeHubView({ snap: hub.snapshot, loggedIn, unsaved: hub.unsaved });
}
