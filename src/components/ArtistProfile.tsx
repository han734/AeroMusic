import React, { useState, useEffect } from "react";
import { Play, Sparkles, Loader2, Check, Music } from "lucide-react";
import { Track } from "../types";
import { aeroFetch } from "../lib/api";

interface Album {
  title: string;
  artist: string;
  thumbnail: string;
  releaseDate: string;
  genre: string;
}

interface ArtistProfileProps {
  artistName: string;
  onTrackSelect: (track: Track, context: Track[]) => void;
  likedTracks: Track[];
  onToggleLike: (track: Track) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onAlbumClick: (albumName: string, artistName: string, thumbnail?: string) => void;
}

export default function ArtistProfile({
  artistName,
  onTrackSelect,
  likedTracks,
  onToggleLike,
  downloadedTracks,
  onDownloadTrack,
  onAlbumClick
}: ArtistProfileProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    artistName: string;
    artistImageUrl: string;
    popularTracks: Track[];
    albums: Album[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    aeroFetch("/api/artist/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistName })
    })
      .then(res => res.json())
      .then(data => {
        if (active && data.success) {
          setProfile(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to load artist profile:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [artistName]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] text-zinc-100 p-10">
        <Loader2 size={36} className="animate-spin text-violet-500 mb-3" />
        <p className="text-sm font-mono text-zinc-400">Loading Artist Profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] text-zinc-100 p-10">
        <p className="text-sm text-zinc-400">Could not resolve artist details.</p>
      </div>
    );
  }

  // Deterministic monthly listeners/followers
  let hash = 0;
  for (let i = 0; i < artistName.length; i++) {
    hash = (hash << 5) - hash + artistName.charCodeAt(i);
    hash |= 0;
  }
  const monthlyListeners = (Math.abs(hash) % 18000000 + 400000).toLocaleString();

  return (
    <div className="flex-1 overflow-y-auto bg-[#121212] text-zinc-100 custom-scrollbar font-sans pb-28">
      {/* Immersive Artist Hero Banner */}
      <div className="relative h-64 md:h-80 bg-zinc-900 overflow-hidden flex items-end">
        {/* Cover image background blur */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
          style={{ backgroundImage: `url(${profile.artistImageUrl})` }}
        />
        
        {/* Real banner overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/40 to-transparent" />
        
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-6 w-full z-10">
          <div className="w-32 h-32 md:w-44 md:h-44 rounded-full overflow-hidden shadow-2xl border-4 border-zinc-900/60 shrink-0">
            <img 
              src={profile.artistImageUrl} 
              alt={profile.artistName} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          
          <div className="text-center md:text-left space-y-2.5">
            <div className="flex items-center justify-center md:justify-start gap-1.5 text-xs font-semibold text-sky-400">
              <span className="bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check size={10} className="stroke-[3]" /> Verified Artist
              </span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
              {profile.artistName}
            </h1>
            
            <p className="text-xs font-medium text-zinc-400">
              <span className="text-zinc-200 font-bold">{monthlyListeners}</span> monthly listeners
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-10 max-w-5xl mx-auto">
        {/* Actions bar */}
        <div className="flex items-center gap-4">
          <button 
            disabled={profile.popularTracks.length === 0}
            onClick={() => onTrackSelect(profile.popularTracks[0], profile.popularTracks)}
            className="bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold p-4 rounded-full transition shadow-lg hover:scale-105 flex items-center justify-center cursor-pointer"
          >
            <Play size={24} fill="black" />
          </button>
          
          <button className="border border-zinc-800 hover:border-zinc-700 text-sm font-semibold px-5 py-2 rounded-full transition cursor-pointer text-zinc-300">
            Follow
          </button>
        </div>

        {/* Popular Tracks Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Popular Tracks</h2>
          <div className="space-y-1">
            {profile.popularTracks.length > 0 ? (
              profile.popularTracks.map((track, idx) => {
                const isLiked = likedTracks.some(t => t.id === track.id);
                const isDownloaded = downloadedTracks.some(t => t.id === track.id);

                return (
                  <div 
                    key={track.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800/40 transition group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="w-4 text-center text-xs font-bold text-zinc-500 group-hover:hidden">
                        {idx + 1}
                      </span>
                      <button
                        onClick={() => onTrackSelect(track, profile.popularTracks)}
                        className="w-4 text-center justify-center items-center text-violet-400 hidden group-hover:flex cursor-pointer"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>

                      <div className="w-10 h-10 bg-zinc-800 rounded overflow-hidden shrink-0">
                        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white transition">
                          {track.title}
                        </p>
                        <button 
                          onClick={() => onAlbumClick(track.album, track.artist, track.thumbnail)}
                          className="text-xs text-zinc-500 hover:underline truncate block text-left"
                        >
                          {track.album}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-500">
                      {/* Likes/Downloads */}
                      <button 
                        onClick={() => onToggleLike(track)}
                        className={`hover:scale-110 transition cursor-pointer ${isLiked ? "text-violet-400" : "text-zinc-600 hover:text-zinc-400"}`}
                      >
                        <span className="text-xs">♥</span>
                      </button>
                      
                      <button 
                        onClick={() => onDownloadTrack(track)}
                        className={`hover:scale-110 transition cursor-pointer ${isDownloaded ? "text-violet-400" : "text-zinc-600 hover:text-zinc-400"}`}
                      >
                        <span className="text-xs">⬇</span>
                      </button>

                      <span className="text-xs font-mono font-medium text-zinc-500 w-10 text-right">
                        {track.duration}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-zinc-500 p-2">No tracks resolved.</p>
            )}
          </div>
        </section>

        {/* Albums Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {profile.albums.length > 0 ? (
              profile.albums.map((album, idx) => (
                <div 
                  key={`${album.title}-${idx}`}
                  onClick={() => onAlbumClick(album.title, album.artist, album.thumbnail)}
                  className="bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800/80 p-4 rounded-xl transition group cursor-pointer space-y-3"
                >
                  <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden shadow-md relative">
                    <img 
                      src={album.thumbnail} 
                      alt={album.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                      referrerPolicy="no-referrer"
                    />
                    {/* Hover play button */}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200">
                      <div className="bg-violet-500 text-black p-3 rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition duration-200">
                        <Play size={16} fill="black" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-zinc-200 truncate group-hover:text-white transition">
                      {album.title}
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">
                      {album.releaseDate} • Album
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 p-2">No albums resolved.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
