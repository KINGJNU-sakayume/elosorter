import { useCallback, type ReactNode } from 'react';
import { useLoggedIn } from '../hooks/useAuth';
import { useToast } from '../state/context';
import { PlayerContext } from './context';
import { useSpotifyPlayer } from './useSpotifyPlayer';

export default function PlayerProvider({ children }: { children: ReactNode }) {
  const loggedIn = useLoggedIn();
  const toast = useToast();
  const onError = useCallback((message: string) => toast(message, 'error'), [toast]);
  const player = useSpotifyPlayer(loggedIn, onError);
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}
