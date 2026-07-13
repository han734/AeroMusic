import React, { useState, useEffect } from "react";
import { Search, Music, Sparkles, AlertCircle, Play, Pause, Heart, Loader2, Download, Check } from "lucide-react";
import { Track } from "../types";
import { aeroFetch } from "../lib/api";

interface SearchDashboardProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, tracksContext: Track[]) => void;
  onPlayPauseToggle: () => void;
  likedTracks: Track[];
  onToggleLike: (track: Track) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumName: string, artistName: string, thumbnail?: string) => void;
  onUserProfileClick?: (username: string) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
}

export default function SearchDashboard({
  currentTrack,
  isPlaying,
  onTrackSelect,
  onPlayPauseToggle,
  likedTracks,
  onToggleLike,
  downloadedTracks,
  onDownloadTrack,
  onArtistClick,
  onAlbumClick,
  onUserProfileClick,
  globalSearchQuery,
  setGlobalSearchQuery,
}: SearchDashboardProps) {
  const searchQuery = globalSearchQuery;
  const setSearchQuery = setGlobalSearchQuery;
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSearch = async (queryToSearch: string) => {
    const q = queryToSearch || searchQuery;
    if (!q || q.trim() === "") return;

    setLoading(true);
    setErrorMsg("");
    setSearched(true);

    // Run track search and user search in parallel
    const trackSearchPromise = (async () => {
      try {
        const response = await aeroFetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q.trim() }),
        });
        const data = await response.json();
        if (data.success && data.tracks) {
          setResults(data.tracks);
        } else {
          setErrorMsg(data.error || "Search failed.");
        }
      } catch (e: any) {
        console.error("Search fetch error:", e);
        setErrorMsg("Failed to connect to search service.");
      }
    })();

    const userSearchPromise = (async () => {
      try {
        const response = await aeroFetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
        const data = await response.json();
        if (data.success && data.users) {
          setUserResults(data.users);
        }
      } catch (e) {
        console.error("User search error:", e);
      }
    })();

    await Promise.all([trackSearchPromise, userSearchPromise]);
    setLoading(false);
  };

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.trim() === "") {
      setResults([]);
      setUserResults([]);
      setSearched(false);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      handleSearch(globalSearchQuery);
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [globalSearchQuery]);

  const isTrackLiked = (track: Track) => {
    return likedTracks.some((t) => t.id === track.id);
  };

  return (
    <div id="search-dashboard" className="flex-1 overflow-y-auto p-6 text-white bg-[#121212] select-none relative custom-scrollbar">
      
      {/* Immersive Dynamic Backdrop Glow (Apple Music Style) */}
      {currentTrack && (
        <div className="absolute top-0 left-0 right-0 h-[450px] overflow-hidden pointer-events-none opacity-[0.18] filter blur-[110px] transition-all duration-1000 z-0">
          <img 
            src={currentTrack.thumbnail} 
            className="w-full h-full object-cover scale-150" 
            alt="" 
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#121212]/50 to-[#121212]" />
        </div>
      )}

      {/* Header Search Info */}
      <div className="max-w-2xl mb-8 relative z-10">
        <h3 className="text-2xl font-extrabold tracking-tight">Search</h3>
        {!searchQuery && (
          <p className="text-xs text-zinc-400 mt-1.5 leading-normal">
            Type anything in the top search bar above to search for tracks, artists, and albums in real time.
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 relative z-10">
          <Loader2 className="animate-spin text-violet-400 mb-4" size={32} />
          <p className="text-sm font-semibold">Searching catalog...</p>
          <p className="text-xs text-zinc-500 mt-1">Finding top audio feeds for your search.</p>
        </div>
      )}



      {/* Search results */}
      {searched && !loading && (
        <div className="space-y-6 relative z-10">
          
          {/* Profiles Section */}
          {userResults.length > 0 && (
            <div className="bg-zinc-900/25 border border-zinc-800/40 rounded-2xl p-5 shadow">
              <h4 className="text-xs font-mono font-extrabold text-zinc-500 uppercase tracking-widest mb-4">Profiles</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {userResults.map((user) => (
                  <div
                    key={user.username}
                    onClick={() => onUserProfileClick?.(user.username)}
                    className="bg-zinc-950/20 hover:bg-zinc-900/60 border border-zinc-900/40 hover:border-zinc-800/80 p-4 rounded-2xl flex flex-col items-center text-center gap-3 transition cursor-pointer select-none group hover:scale-[1.02] duration-200"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0 text-2xl relative shadow-md">
                      {user.avatar.startsWith("data:image") ? (
                        <img src={user.avatar} className="w-full h-full object-cover" alt="" />
                      ) : (
                        user.avatar
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="font-bold text-zinc-200 text-sm truncate group-hover:text-violet-400 transition leading-none">
                        {user.username}
                      </p>
                      <span className={`text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border mt-2 inline-block leading-none ${
                        user.tier === "VIP" 
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/25" 
                          : (user.tier === "Aero+" || user.tier === "Premium")
                            ? "bg-violet-500/10 text-violet-400 border-violet-500/25" 
                            : "bg-zinc-800 text-zinc-500 border-zinc-800"
                      }`}>
                        {user.tier === "Free" ? "Standard" : (user.tier === "Premium" ? "Aero+" : user.tier)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5 shadow">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-zinc-200">Track Results</h4>
              <button
                onClick={() => {
                  setSearched(false);
                  setSearchQuery("");
                  setResults([]);
                  setUserResults([]);
                }}
                className="text-xs text-zinc-500 hover:text-white transition font-semibold"
              >
                Clear Results
              </button>
            </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-amber-400/90 bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg mb-4 text-xs font-medium">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {results.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <Music size={40} className="mx-auto mb-3 opacity-30 animate-pulse" />
              <p className="text-sm font-semibold">No direct streams found for "{searchQuery}"</p>
              <p className="text-xs text-zinc-600 mt-1">Try refining your terms, or type an artist name.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {results.map((track, idx) => {
                const isSelected = currentTrack?.id === track.id;
                const liked = isTrackLiked(track);

                return (
                  <div
                    key={track.id + "-" + idx}
                    className={`flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-800/30 transition border-b border-zinc-900/40 last:border-0 group ${
                      isSelected ? "bg-zinc-800/20 text-violet-400" : ""
                    }`}
                  >
                    {/* Thumbnail & Play Overlay */}
                    <div className="w-12 h-12 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-zinc-700/20 relative group-hover:scale-105 transition shadow">
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <button
                          onClick={() => {
                            if (isSelected) {
                              onPlayPauseToggle();
                            } else {
                              onTrackSelect(track, results);
                            }
                          }}
                          className="bg-white text-black p-1.5 rounded-full hover:scale-110 active:scale-95 transition cursor-pointer"
                        >
                          {isSelected && isPlaying ? (
                            <Pause size={14} fill="black" />
                          ) : (
                            <Play size={14} fill="black" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-semibold truncate cursor-pointer hover:underline text-sm md:text-base ${
                          isSelected ? "text-violet-400" : "text-white"
                        }`}
                        onClick={() => onTrackSelect(track, results)}
                      >
                        {track.title}
                      </p>
                      <p className="text-zinc-500 text-xs truncate">
                        <span 
                          onClick={() => onArtistClick && onArtistClick(track.artist)}
                          className="hover:underline cursor-pointer hover:text-zinc-300 transition"
                        >
                          {track.artist}
                        </span> • <span 
                          onClick={() => onAlbumClick && onAlbumClick(track.album || "Single", track.artist, track.thumbnail)}
                          className="text-zinc-600 font-mono hover:underline cursor-pointer hover:text-zinc-400 transition"
                        >
                          {track.album}
                        </span>
                      </p>
                    </div>

                    {/* Playable Indicator */}
                    <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 bg-zinc-800/40 border border-zinc-800 px-2 py-0.5 rounded">
                      <Sparkles size={11} className="text-violet-500" />
                      <span>Stream Verified</span>
                    </div>

                    {/* Duration */}
                    <div className="font-mono text-xs text-zinc-500 w-12 text-right">
                      {track.duration}
                    </div>

                    {/* Like & Play Quick button */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onToggleLike(track)}
                        className={`transition cursor-pointer p-1.5 rounded-full hover:bg-zinc-800/50 ${
                          liked ? "text-violet-500 scale-110" : "text-zinc-600 hover:text-zinc-300"
                        }`}
                        title={liked ? "Unlike Song" : "Like Song"}
                      >
                        <Heart size={16} fill={liked ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={() => onDownloadTrack(track)}
                        className={`transition cursor-pointer p-1.5 rounded-full hover:bg-zinc-800/50 ${
                          downloadedTracks.some((t) => t.id === track.id)
                            ? "text-violet-400"
                            : "text-zinc-600 hover:text-zinc-300"
                        }`}
                        title={downloadedTracks.some((t) => t.id === track.id) ? "Downloaded for Offline Playback" : "Download MP3 / Offline"}
                      >
                        {downloadedTracks.some((t) => t.id === track.id) ? (
                          <Check size={16} className="stroke-[3]" />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
