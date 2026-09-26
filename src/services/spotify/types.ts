export interface SpotifyUser {
  id: string;
  displayName: string;
  imageUrl: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  trackCount: number;
  owner: string;
}
