import React, { useState, useEffect } from "react";
import { Play, Loader2, Heart, Download, Check, ChevronLeft, Music, Clock } from "lucide-react";
import { Track } from "../types";
import { aeroFetch } from "../lib/api";

interface Album {
  title: string;
  artist: string;
  thumbnail: string;
  releaseDate: string;
  genre: string;
}

interface AlbumViewProps {
  albumName: string;
  artistName: string;
  thumbnail?: string;
  onTrackSelect: (track: Track, context: Track[]) => void;
  likedTracks: Track[];
  onToggleLike: (track: Track) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onDownloadTracksBulk?: (tracks: Track[], sourceName: string) => void;
  onArtistClick: (artistName: string) => void;
  onAlbumClick: (albumName: string, artistName: string, thumbnail?: string) => void;
}

export default function AlbumView({
  albumName,
  artistName,
  thumbnail,
  onTrackSelect,
  likedTracks,
  onToggleLike,
  downloadedTracks,
  onDownloadTrack,
  onDownloadTracksBulk,
  onArtistClick,
  onAlbumClick
}: AlbumViewProps) {
  const [loading, setLoading] = useState(true);
  const [albumData, setAlbumData] = useState<{
    albumName: string;
    artistName: string;
    thumbnail: string;
    tracks: Track[];
  } | null>(null);
  const [otherAlbums, setOtherAlbums] = useState<Album[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    // Fetch current album tracks
    aeroFetch("/api/album/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumName, artistName })
    })
      .then(res => res.json())
      .then(data => {
        if (active && data.success) {
          setAlbumData(data);
          setLoading(false);
        } else if (active) {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to load album tracks:", err);
        if (active) setLoading(false);
      });

    // Fetch artist profile to display other albums
    aeroFetch("/api/artist/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistName })
    })
      .then(res => res.json())
      .then(data => {
        if (active && data.success && data.albums) {
          // Filter out the current album from the recommendations list
          const filtered = data.albums.filter(
            (alb: Album) => alb.title.toLowerCase() !== albumName.toLowerCase()
          );
          setOtherAlbums(filtered.slice(0, 5));
        }
      })
      .catch(err => {
        console.error("Failed to fetch artist other albums:", err);
      });

    return () => {
      active = false;
    };
  }, [albumName, artistName]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900 text-zinc-100 p-10">
        <Loader2 size={36} className="animate-spin text-violet-500 mb-3" />
        <p className="text-sm font-mono text-zinc-400">Resolving Album Tracks...</p>
      </div>
    );
  }

  if (!albumData || albumData.tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900 text-zinc-100 p-10 space-y-4">
        <p className="text-sm text-zinc-400">Could not resolve album details or tracks.</p>
        <button 
          onClick={() => onArtistClick(artistName)}
          className="flex items-center gap-2 text-violet-400 hover:text-white transition text-xs font-semibold"
        >
          <ChevronLeft size={16} /> Back to Artist Profile
        </button>
      </div>
    );
  }

  // Calculate total runtime of the album
  const calculateTotalDuration = () => {
    let totalSecs = 0;
    albumData.tracks.forEach(track => {
      const parts = track.duration.split(":").map(Number);
      if (parts.length === 2) {
        totalSecs += parts[0] * 60 + parts[1];
      }
    });
    const mins = Math.floor(totalSecs / 60);
    return `${mins} min`;
  };

  const albumYear = albumData.tracks[0]?.genre || "Music";

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 text-zinc-100 custom-scrollbar font-sans pb-28">
      {/* Back navigation header */}
      <div className="p-4 flex items-center border-b border-zinc-900/60 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <button 
          onClick={() => onArtistClick(artistName)}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition text-xs font-bold cursor-pointer"
        >
          <ChevronLeft size={16} /> {artistName}
        </button>
      </div>

      {/* Immersive Album Hero Banner */}
      <div className="relative p-6 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-6 overflow-hidden">
        {/* Cover image background blur */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-110 pointer-events-none"
          style={{ backgroundImage: `url(${albumData.thumbnail || thumbnail})` }}
        />
        
        {/* Real banner overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/20 to-transparent pointer-events-none" />
        
        <div className="w-40 h-40 md:w-56 md:h-56 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 shrink-0 z-10">
          <img 
            src={albumData.thumbnail || thumbnail} 
            alt={albumData.albumName} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <div className="text-center md:text-left space-y-2.5 z-10">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 rounded-full inline-block">
            Album
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
            {albumData.albumName}
          </h1>
          
          <div className="text-xs font-semibold text-zinc-400 flex flex-wrap items-center justify-center md:justify-start gap-1.5">
            <span 
              onClick={() => onArtistClick(artistName)}
              className="text-white hover:underline cursor-pointer font-bold"
            >
              {albumData.artistName}
            </span>
            <span>•</span>
            <span>{albumYear}</span>
            <span>•</span>
            <span>{albumData.tracks.length} songs</span>
            <span>•</span>
            <span className="text-zinc-500 font-medium">{calculateTotalDuration()}</span>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-10 max-w-5xl mx-auto">
        {/* Play & action bar */}
        <div className="flex items-center gap-4">
          <button 
            disabled={albumData.tracks.length === 0}
            onClick={() => onTrackSelect(albumData.tracks[0], albumData.tracks)}
            className="bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold p-4 rounded-full transition shadow-lg hover:scale-105 flex items-center justify-center cursor-pointer"
          >
            <Play size={24} fill="black" />
          </button>
          {onDownloadTracksBulk && albumData.tracks.length > 0 && (
            <button
              onClick={() => onDownloadTracksBulk(albumData.tracks, albumData.albumName)}
              className="bg-zinc-800 hover:bg-zinc-700 hover:text-violet-400 text-zinc-300 font-bold px-5 py-3 rounded-full transition shadow hover:scale-105 flex items-center gap-2 cursor-pointer border border-zinc-700/50 text-sm"
              title="Download all tracks in this album offline"
            >
              <Download size={16} />
              <span>Download Album</span>
            </button>
          )}
        </div>

        {/* Tracks Table */}
        <section className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 text-zinc-500 text-xs uppercase font-mono tracking-wider">
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3 w-20 text-center"><Clock size={14} className="mx-auto" /></th>
                  <th className="py-2.5 px-3 w-24 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {albumData.tracks.map((track, idx) => {
                  const isLiked = likedTracks.some(t => t.id === track.id);
                  const isDownloaded = downloadedTracks.some(t => t.id === track.id);

                  return (
                    <tr 
                      key={track.id}
                      className="hover:bg-zinc-900/60 border-b border-zinc-900/30 group transition-colors"
                    >
                      <td className="py-3 px-3 text-center text-xs font-bold text-zinc-500 align-middle">
                        <span className="group-hover:hidden">{idx + 1}</span>
                        <button
                          onClick={() => onTrackSelect(track, albumData.tracks)}
                          className="text-violet-400 hidden group-hover:inline-block cursor-pointer"
                        >
                          <Play size={12} fill="currentColor" />
                        </button>
                      </td>
                      
                      <td className="py-3 px-3 align-middle min-w-0">
                        <div className="min-w-0">
                          <p 
                            onClick={() => onTrackSelect(track, albumData.tracks)}
                            className="text-sm font-semibold text-zinc-200 truncate cursor-pointer hover:text-white transition"
                          >
                            {track.title}
                          </p>
                          <p 
                            onClick={() => onArtistClick(track.artist)}
                            className="text-xs text-zinc-500 truncate hover:underline cursor-pointer"
                          >
                            {track.artist}
                          </p>
                        </div>
                      </td>
                      
                      <td className="py-3 px-3 text-center align-middle font-mono text-zinc-500 text-xs">
                        {track.duration}
                      </td>
                      
                      <td className="py-3 px-3 text-center align-middle">
                        <div className="flex items-center justify-center gap-3 text-zinc-500">
                          <button 
                            onClick={() => onToggleLike(track)}
                            className={`hover:scale-110 transition cursor-pointer p-1 ${isLiked ? "text-violet-400" : "hover:text-zinc-300"}`}
                          >
                            <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
                          </button>
                          
                          <button 
                            onClick={() => onDownloadTrack(track)}
                            className={`hover:scale-110 transition cursor-pointer p-1 ${isDownloaded ? "text-violet-400" : "hover:text-zinc-300"}`}
                          >
                            {isDownloaded ? (
                              <Check size={14} className="stroke-[3]" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* More Albums Section */}
        {otherAlbums.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-zinc-900">
            <h2 className="text-lg font-bold text-white tracking-tight">
              More by {artistName}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {otherAlbums.map((album, idx) => (
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
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
