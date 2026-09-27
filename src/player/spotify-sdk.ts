// Spotify Web Playback SDK 타입 (필요한 부분만). SDK는 index.html에서 로드한다.

export interface SdkPlaybackState {
  paused: boolean;
  track_window?: {
    current_track?: { uri?: string; linked_from?: { uri?: string | null } | null } | null;
  };
}

export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  togglePlay(): Promise<void>;
  activateElement?(): Promise<void>;
  addListener(event: 'ready' | 'not_ready', cb: (data: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (state: SdkPlaybackState | null) => void): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    cb: (error: { message: string }) => void,
  ): boolean;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
    __spotifySdkReady?: boolean;
  }
}
