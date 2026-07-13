export interface Track {
  id: string; // YouTube Video ID
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: string;
  genre: string;
  offlineReady?: boolean;
  offlineFile?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  coverUrl?: string;
  icon?: string;
}

export interface DJMessage {
  id: string;
  sender: 'user' | 'dj';
  text: string;
  timestamp: string;
  curatedTracks?: Track[];
}

export interface UserProfile {
  username: string;
  avatar: string;
  bio: string;
  tier: string;
  playlistsPublic: boolean;
  likedSongsPublic: boolean;
  playlists: Playlist[];
  likedTracks: Track[];
}
