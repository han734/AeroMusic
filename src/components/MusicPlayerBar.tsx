import { useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Heart, Music, Tv, Video, Loader2, ListMusic, Download, Check, Minimize2, Maximize2, FileText } from "lucide-react";
import { Track } from "../types";

interface MusicPlayerBarProps {
  currentTrack: Track | null;
  tracksContext: Track[];
  isPlaying: boolean;
  volume: number;
  progress: number; // in seconds
  duration: number; // in seconds
  shuffle: boolean;
  repeat: boolean;
  showVideo: boolean;
  likedTracks: Track[];
  onPlayPauseToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (seconds: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleShowVideo: () => void;
  onToggleLike: (track: Track) => void;
  onQueueTrackSelect: (track: Track) => void;
  setActiveTab: (tab: string) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  isMiniPlayer: boolean;
  onToggleMiniPlayer: () => void;
  isExtendedPlayer: boolean;
  onToggleExtendedPlayer: () => void;
  onArtistClick?: (artistName: string) => void;
  onClearQueue?: () => void;
  activeVideoIdOverride?: string | null;
  onToggleMv?: (enabled: boolean) => Promise<void>;
}

export default function MusicPlayerBar({
  currentTrack,
  tracksContext,
  isPlaying,
  volume,
  progress,
  duration,
  shuffle,
  repeat,
  showVideo,
  likedTracks,
  onPlayPauseToggle,
  onNext,
  onPrevious,
  onVolumeChange,
  onSeek,
  onToggleShuffle,
  onToggleRepeat,
  onToggleShowVideo,
  onToggleLike,
  onQueueTrackSelect,
  setActiveTab,
  downloadedTracks,
  onDownloadTrack,
  isMiniPlayer,
  onToggleMiniPlayer,
  isExtendedPlayer,
  onToggleExtendedPlayer,
  onArtistClick,
  onClearQueue,
  activeVideoIdOverride,
  onToggleMv,
}: MusicPlayerBarProps) {
  
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const [showQueue, setShowQueue] = useState(false);
  const [loadingMv, setLoadingMv] = useState(false);
  const currentIndex = currentTrack ? tracksContext.findIndex((t) => t.id === currentTrack.id) : -1;
  const upcomingTracks = currentIndex >= 0 ? tracksContext.slice(currentIndex + 1, currentIndex + 4) : tracksContext.slice(0, 3);
  const remainingCount = currentIndex >= 0 ? Math.max(0, tracksContext.length - (currentIndex + 1) - upcomingTracks.length) : Math.max(0, tracksContext.length - upcomingTracks.length);
  const percentProgress = duration > 0 ? (progress / duration) * 100 : 0;
  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;

  return (
    <footer
      id="spotify-player-bar"
      className="bg-transparent md:bg-zinc-950/80 border-none md:border-t md:border-zinc-900/60 p-0 md:px-3 md:py-3 select-none text-white font-sans z-40 backdrop-none md:backdrop-blur-md"
    >
      {/* ───────────────────────────────────────────────────────────────────────
          DESKTOP LAYOUT (Spotify / YT Music 3-Column Aligned Row)
          ─────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-between w-full gap-4">
        {/* Left Column: Artwork, Titles, Actions */}
        <div className="flex items-center gap-3 w-[30%] min-w-[200px] max-w-[320px]">
          {currentTrack ? (
            <>
              <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-zinc-800 shadow shadow-black/40">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p 
                  className="text-sm font-semibold truncate hover:text-violet-400 hover:underline cursor-pointer" 
                  onClick={() => onToggleExtendedPlayer()}
                  title="Expand to Fullscreen View"
                >
                  {currentTrack.title}
                </p>
                <p 
                  className="text-zinc-400 text-xs truncate hover:text-zinc-200 cursor-pointer" 
                  onClick={() => onArtistClick && onArtistClick(currentTrack.artist)}
                >
                  {currentTrack.artist}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onToggleLike(currentTrack)}
                  className={`transition p-2 rounded-full hover:bg-zinc-900 ${isLiked ? "text-violet-500" : "text-zinc-400 hover:text-zinc-200"}`}
                  title={isLiked ? "Unlike Song" : "Like Song"}
                >
                  <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => onDownloadTrack(currentTrack)}
                  className={`transition p-2 rounded-full hover:bg-zinc-900 ${downloadedTracks.some((t) => t.id === currentTrack.id) ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
                  title={downloadedTracks.some((t) => t.id === currentTrack.id) ? "Downloaded" : "Download"}
                >
                  {downloadedTracks.some((t) => t.id === currentTrack.id) ? <Check size={16} /> : <Download size={16} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-lg bg-zinc-900/50 flex items-center justify-center border border-zinc-800 text-zinc-700">
                <Music size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-500 truncate">No Song Selected</p>
                <p className="text-zinc-600 text-xs truncate">Ready to spin tracks</p>
              </div>
            </>
          )}
        </div>

        {/* Center Column: Control Buttons & Seekbar */}
        <div className="flex-1 max-w-[45%] md:max-w-2xl flex flex-col items-center gap-1.5">
          {/* Controls buttons row */}
          <div className="flex items-center gap-5">
            <button
              onClick={onToggleShuffle}
              disabled={!currentTrack}
              className={`transition p-2 rounded-full hover:bg-zinc-900 disabled:opacity-40 ${shuffle ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
              title="Shuffle"
            >
              <Shuffle size={15} />
            </button>
            <button
              onClick={onPrevious}
              disabled={!currentTrack}
              className="p-2 rounded-full hover:bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-40"
              title="Previous"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={onPlayPauseToggle}
              disabled={!currentTrack}
              className="p-3 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition shadow disabled:opacity-40 cursor-pointer flex items-center justify-center"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={18} fill="black" /> : <Play size={18} fill="black" className="ml-0.5" />}
            </button>
            <button
              onClick={onNext}
              disabled={!currentTrack}
              className="p-2 rounded-full hover:bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-40"
              title="Next"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={onToggleRepeat}
              disabled={!currentTrack}
              className={`transition p-2 rounded-full hover:bg-zinc-900 disabled:opacity-40 ${repeat ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
              title="Repeat"
            >
              <Repeat size={15} />
            </button>
          </div>

          {/* Seekbar timeline row */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] font-mono text-zinc-500 w-10 text-right select-none">
              {formatTime(progress)}
            </span>
            <div className="flex-1 min-w-0 relative group py-2 flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={progress}
                onChange={(e) => onSeek(Number(e.target.value))}
                disabled={!currentTrack}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className="w-full h-1 bg-zinc-700 rounded-full relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-violet-500 group-hover:bg-violet-400 rounded-full"
                  style={{ width: `${percentProgress}%` }}
                />
              </div>
              <div
                className="absolute w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition shadow -translate-x-1/2 pointer-events-none"
                style={{ left: `${percentProgress}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-500 w-10 text-left select-none">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Column: Volume & Utilities */}
        <div className="flex items-center justify-end gap-2 w-[30%] min-w-[200px]">
          <button
            onClick={onToggleShowVideo}
            disabled={!currentTrack}
            className={`p-2 rounded-full hover:bg-zinc-900 transition ${showVideo && !activeVideoIdOverride ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
            title="Toggle Video Feed"
          >
            <Video size={16} />
          </button>
          <button
            onClick={async () => {
              if (onToggleMv) {
                setLoadingMv(true);
                const isMvActive = !!activeVideoIdOverride;
                await onToggleMv(!isMvActive);
                setLoadingMv(false);
              }
            }}
            disabled={loadingMv || !onToggleMv || !currentTrack}
            className={`p-2 rounded-full flex items-center justify-center transition hover:bg-zinc-900 ${activeVideoIdOverride ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"} disabled:opacity-50`}
            title="Watch Official Music Video"
          >
            {loadingMv ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Tv size={16} />
            )}
          </button>
          <button
            onClick={() => setShowQueue((prev) => !prev)}
            disabled={!currentTrack}
            className={`p-2 rounded-full hover:bg-zinc-900 transition ${showQueue ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
            title={showQueue ? "Hide queue" : "Show queue"}
          >
            <ListMusic size={16} />
          </button>
          <button
            onClick={() => setActiveTab("lyrics")}
            disabled={!currentTrack}
            className="p-2 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition"
            title="Lyrics"
          >
            <FileText size={16} />
          </button>
          <button
            onClick={onToggleMiniPlayer}
            disabled={!currentTrack}
            className="p-2 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition"
            title="Mini Player"
          >
            <Minimize2 size={16} />
          </button>
          <button
            onClick={onToggleExtendedPlayer}
            disabled={!currentTrack}
            className="p-2 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition mr-2"
            title="Extended Player"
          >
            <Maximize2 size={16} />
          </button>

          {/* Volume Control widget */}
          <div className="flex items-center gap-1.5 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/40 rounded-full px-2.5 py-1.5 transition">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 50 : 0)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-20 h-1 bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          MOBILE LAYOUT (Floating Spotify-Style Compact miniplayer Card)
          ─────────────────────────────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col w-full">
        {currentTrack ? (
          <div 
            className="bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-xl rounded-xl p-2.5 shadow-lg shadow-black/40 flex items-center justify-between relative overflow-hidden cursor-pointer"
            onClick={() => onToggleExtendedPlayer()}
          >
            {/* Left side: Artwork & Metadata */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-zinc-800">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{currentTrack.title}</p>
                <p className="text-zinc-400 text-[10px] truncate">{currentTrack.artist}</p>
              </div>
            </div>

            {/* Right side: Touch Action Controls */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onToggleLike(currentTrack)}
                className={`p-2 rounded-full ${isLiked ? "text-violet-500" : "text-zinc-400"}`}
              >
                <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <button
                onClick={onPlayPauseToggle}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow"
              >
                {isPlaying ? <Pause size={15} fill="black" /> : <Play size={15} fill="black" className="ml-0.5" />}
              </button>
              <button
                onClick={onNext}
                className="p-2 rounded-full text-zinc-300 hover:text-white"
              >
                <SkipForward size={16} />
              </button>
            </div>

            {/* Integrated Edge-Running Bottom Progress Line */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-800/50">
              <div
                className="h-full bg-violet-500 rounded-r-full"
                style={{ width: `${percentProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/60 border border-zinc-800/50 backdrop-blur rounded-xl p-3 text-center text-xs text-zinc-500">
            No song selected. Ready to spin tracks!
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          UP NEXT QUEUE CONTAINER (Shared below, toggleable on desktop/mobile)
          ─────────────────────────────────────────────────────────────────────── */}
      {currentTrack && showQueue && (
        <div className="mt-3 border-t border-zinc-900/50 pt-3">
          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-2">
            <div className="flex items-center gap-2">
              <span>Up next</span>
              <span className="text-zinc-700">•</span>
              <span>{tracksContext.length} tracks</span>
            </div>
            {onClearQueue && (
              <button
                onClick={onClearQueue}
                className="hover:text-red-400 transition text-[9px] font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 cursor-pointer"
              >
                Clear Queue
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {upcomingTracks.length > 0 ? (
              upcomingTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => onQueueTrackSelect(track)}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-left text-sm text-white hover:border-violet-500"
                >
                  <div className="font-semibold truncate">{track.title}</div>
                  <div className="text-zinc-500 text-[11px] truncate">{track.artist}</div>
                </button>
              ))
            ) : (
              <div className="col-span-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-sm text-zinc-500">
                No queued tracks. Use search, playlists, or add a track to start a queue.
              </div>
            )}
            {remainingCount > 0 && (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/90 p-3 text-xs text-zinc-400">
                +{remainingCount} more
              </div>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
