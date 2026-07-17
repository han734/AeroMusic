import React, { useState, useEffect } from "react";
import { Sparkles, Play, Award, Disc, User, Music, Share2, Clock, Check } from "lucide-react";
import { Track } from "../types";

interface ListeningStats {
  totalDuration: number; // in seconds
  songPlays: {
    [key: string]: {
      id: string;
      title: string;
      artist: string;
      album: string;
      thumbnail: string;
      genre: string;
      count: number;
    };
  };
  artistPlays: {
    [key: string]: number;
  };
  genrePlays: {
    [key: string]: number;
  };
}

interface AeroWrappedProps {
  onTrackSelect: (track: Track, context: Track[]) => void;
  tracksContext: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
}

export default function AeroWrapped({
  onTrackSelect,
  tracksContext,
  currentTrack,
  isPlaying,
  onPlayPauseToggle,
}: AeroWrappedProps) {
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [copied, setCopied] = useState(false);

  // Load stats from localStorage
  const loadStats = () => {
    try {
      const statsJson = localStorage.getItem("aero-listening-stats");
      if (statsJson) {
        setStats(JSON.parse(statsJson));
      }
    } catch (e) {
      console.error("Failed to load listening stats:", e);
    }
  };

  useEffect(() => {
    loadStats();
    // Poll stats every 2 seconds to make it truly real-time
    const interval = setInterval(loadStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const totalMinutes = stats ? Math.floor(stats.totalDuration / 60) : 0;
  const totalSecondsRemainder = stats ? Math.floor(stats.totalDuration % 60) : 0;

  // Compute top songs
  const topSongs = stats
    ? Object.values(stats.songPlays)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : [];

  // Compute top artists
  const topArtists = stats
    ? Object.entries(stats.artistPlays)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : [];

  // Compute top genres/languages
  const topGenres = stats
    ? Object.entries(stats.genrePlays)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : [];

  const maxGenreCount = topGenres.length > 0 ? topGenres[0].count : 1;

  // Handle playing a top song directly from the stats page
  const handlePlaySong = (song: any) => {
    const trackObj: Track = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || "Unknown Album",
      thumbnail: song.thumbnail || "",
      genre: song.genre || "Music"
    };
    onTrackSelect(trackObj, [trackObj]);
  };

  const handleCopyStats = () => {
    if (!stats) return;
    const topSongText = topSongs.length > 0 ? `🎵 Top Song: ${topSongs[0].title} by ${topSongs[0].artist}` : "";
    const topArtistText = topArtists.length > 0 ? `🎙️ Top Artist: ${topArtists[0].name}` : "";
    const topGenreText = topGenres.length > 0 ? `🎧 Top Language/Genre: ${topGenres[0].name}` : "";
    
    const textToCopy = `✨ My AeroWrapped Stats ✨\n⏱️ Listened for ${totalMinutes}m ${totalSecondsRemainder}s\n${topSongText}\n${topArtistText}\n${topGenreText}\nListen on AeroMusic! 🚀`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasStats = stats && (stats.totalDuration > 0 || Object.keys(stats.songPlays).length > 0);

  if (!hasStats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-indigo-950/20 via-zinc-950 to-violet-950/20 text-center select-none overflow-y-auto">
        <div className="w-16 h-16 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex items-center justify-center text-violet-400 mb-6 animate-bounce">
          <Sparkles size={32} />
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight mb-2">Your AeroWrapped is Cooking!</h2>
        <p className="text-zinc-400 text-sm max-w-sm leading-relaxed mb-6">
          We track your listening time and song play counts in real-time. Start spinning some tracks on the homepage or search, and your stats will appear here instantly!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gradient-to-br from-zinc-950 via-zinc-950 to-indigo-950/40 select-none custom-scrollbar">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-violet-400 font-mono text-xs font-bold tracking-widest uppercase mb-1">
            <Sparkles size={14} className="animate-spin animate-duration-3000" />
            <span>Real-time Listening Insights</span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">Your Aero<span className="text-violet-400">Wrapped</span></h2>
        </div>
        <button
          onClick={handleCopyStats}
          className="flex items-center gap-2 bg-white text-black font-semibold text-xs px-4 py-2.5 rounded-full hover:scale-105 transition shadow active:scale-95 cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-600" />
              <span>Copied to Clipboard!</span>
            </>
          ) : (
            <>
              <Share2 size={14} />
              <span>Share Insights</span>
            </>
          )}
        </button>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Card 1: Hero Listened Minutes */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl p-6 text-white shadow-lg flex flex-col justify-between relative overflow-hidden h-64 md:h-auto">
          {/* Glass design decoration */}
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-black/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center mb-6">
              <Clock size={20} />
            </div>
            <span className="text-xs font-mono font-bold tracking-wider opacity-85 uppercase">Listening Time</span>
            <div className="text-5xl font-black tracking-tight mt-2 flex items-baseline gap-1">
              <span>{totalMinutes}</span>
              <span className="text-lg font-medium opacity-85">m</span>
              <span>{totalSecondsRemainder}</span>
              <span className="text-lg font-medium opacity-85">s</span>
            </div>
          </div>
          <p className="text-xs opacity-75 leading-relaxed relative z-10 mt-6">
            Every second counts! Keep vibing to your favorite tracks to see this count grow in real-time.
          </p>
        </div>

        {/* Card 2: Interactive Top Songs */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur rounded-3xl p-6 shadow-md lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-violet-400" />
            <h3 className="text-md font-bold text-white">Your Top Songs</h3>
          </div>
          <div className="flex flex-col gap-3">
            {topSongs.map((song, idx) => {
              const isCurrent = currentTrack && currentTrack.id === song.id;
              return (
                <div 
                  key={song.id}
                  className={`flex items-center justify-between p-2.5 rounded-2xl border transition group ${
                    isCurrent ? "bg-violet-600/10 border-violet-500/30" : "bg-zinc-950/40 border-zinc-900/60 hover:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500">
                      #{idx + 1}
                    </span>
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-zinc-800">
                      <img src={song.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{song.title}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{song.artist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pl-2">
                    <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
                      {song.count} plays
                    </span>
                    <button
                      onClick={() => handlePlaySong(song)}
                      className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow opacity-90 hover:opacity-100 hover:scale-105 active:scale-95 transition cursor-pointer"
                      title="Play Song Now"
                    >
                      <Play size={13} fill="black" className="ml-0.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Secondary Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* Card 3: Top Artists */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur rounded-3xl p-6 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-violet-400" />
            <h3 className="text-md font-bold text-white">Top Artists</h3>
          </div>
          <div className="flex flex-col gap-3">
            {topArtists.map((artist, idx) => (
              <div 
                key={artist.name}
                className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950/40 border border-zinc-900/60 hover:border-zinc-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-white">{artist.name}</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-full">
                  {artist.count} tracks played
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: Top Genres / Languages */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur rounded-3xl p-6 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <Disc size={18} className="text-violet-400" />
            <h3 className="text-md font-bold text-white">Top Languages / Genres</h3>
          </div>
          <div className="flex flex-col gap-4">
            {topGenres.map((genre) => {
              const percentage = Math.round((genre.count / maxGenreCount) * 100);
              return (
                <div key={genre.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{genre.name}</span>
                    <span className="font-mono text-zinc-500 font-medium">{genre.count} plays</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Share Poster Card Display */}
      <div className="bg-gradient-to-r from-[#8a2be2]/10 via-[#4b0082]/10 to-[#0000ff]/10 border border-violet-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 w-60 h-60 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
          <div className="w-14 h-14 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
            <Sparkles size={24} className="animate-pulse" />
          </div>
          <div>
            <h4 className="text-md font-extrabold text-white">Share Your Sound Profile</h4>
            <p className="text-xs text-zinc-400 max-w-md leading-relaxed mt-1">
              Let your friends see your listening patterns on AeroMusic! Click 'Share Insights' above to copy a summary card of your stats directly.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
