import React from 'react';
import { Playlist } from '../types';
import { getPlaceholderUrl } from '../lib/api';

interface PlaylistCoverProps {
  playlist: Playlist;
  className?: string;
}

export default function PlaylistCover({ playlist, className = "w-full h-full object-cover" }: PlaylistCoverProps) {
  const tracks = playlist.tracks || [];
  
  // If the playlist has 4 or more tracks, render a 2x2 collage
  if (tracks.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-[1px] bg-zinc-800 ${className} overflow-hidden rounded-lg`}>
        {tracks.slice(0, 4).map((track, idx) => (
          <img
            key={`${track.id}-${idx}`}
            src={getPlaceholderUrl(track.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100")}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ))}
      </div>
    );
  }
  
  // Fallback to coverUrl or the first track's thumbnail
  const fallbackSrc = playlist.coverUrl || (tracks[0]?.thumbnail) || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop";
  return (
    <img
      src={getPlaceholderUrl(fallbackSrc)}
      alt={playlist.name}
      className={`${className} rounded-lg`}
      referrerPolicy="no-referrer"
    />
  );
}
