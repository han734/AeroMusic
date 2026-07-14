import React from "react";
import { motion } from "motion/react";
import { Play, Pause, SkipBack, SkipForward, Maximize2, Shuffle, Repeat, Heart, Check, Download, Volume2, VolumeX } from "lucide-react";
import { Track } from "../types";

interface MiniPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: boolean;
  likedTracks: Track[];
  downloadedTracks: Track[];
  onPlayPauseToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolumeChange: (vol: number) => void;
  onSeek: (secs: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleLike: (track: Track) => void;
  onDownloadTrack: (track: Track) => void;
  onRestore: () => void;
}

export default function MiniPlayer({
  currentTrack,
  isPlaying,
  volume,
  progress,
  duration,
  shuffle,
  repeat,
  likedTracks,
  downloadedTracks,
  onPlayPauseToggle,
  onNext,
  onPrevious,
  onVolumeChange,
  onSeek,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onDownloadTrack,
  onRestore,
}: MiniPlayerProps) {
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const percentProgress = duration > 0 ? (progress / duration) * 100 : 0;
  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const isDownloaded = currentTrack ? downloadedTracks.some((t) => t.id === currentTrack.id) : false;

  if (!currentTrack) return null;

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.05}
      initial={{ opacity: 0, scale: 0.9, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 50 }}
      className="fixed bottom-28 right-8 z-50 w-80 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] select-none text-white font-sans cursor-grab active:cursor-grabbing"
    >
      {/* Top Bar / Drag Handle */}
      <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Mini Player</span>
        </div>
        <button
          onClick={onRestore}
          className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer p-1 rounded-md hover:bg-zinc-900"
          title="Restore main interface"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Track info & Artwork */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-zinc-800 relative shadow-inner">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold truncate text-zinc-100">{currentTrack.title}</h4>
          <p className="text-[10px] text-zinc-400 truncate">{currentTrack.artist}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggleLike(currentTrack)}
            className={`transition cursor-pointer p-1 rounded-md hover:bg-zinc-900 ${
              isLiked ? "text-violet-500 scale-105" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Interactive progress line */}
      <div className="space-y-1 mb-3">
        <div className="relative group py-1.5 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
          />
          <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden relative">
            <div
              className="absolute left-0 top-0 bottom-0 bg-violet-500 group-hover:bg-violet-400 rounded-full"
              style={{ width: `${percentProgress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 font-semibold px-0.5">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Control Buttons row */}
      <div className="flex items-center justify-between px-1">
        {/* Shuffle */}
        <button
          onClick={onToggleShuffle}
          className={`transition cursor-pointer p-1 rounded-md hover:bg-zinc-900 ${
            shuffle ? "text-violet-500" : "text-zinc-500"
          }`}
        >
          <Shuffle size={13} />
        </button>

        <div className="flex items-center gap-3">
          {/* Previous */}
          <button
            onClick={onPrevious}
            className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer p-1 rounded-md hover:bg-zinc-900"
          >
            <SkipBack size={15} fill="currentColor" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={onPlayPauseToggle}
            className="bg-violet-500 hover:bg-violet-400 text-black p-2 rounded-full transition duration-200 shadow-md flex items-center justify-center cursor-pointer scale-105 hover:scale-110 active:scale-95"
          >
            {isPlaying ? (
              <Pause size={14} fill="black" />
            ) : (
              <Play size={14} fill="black" className="ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer p-1 rounded-md hover:bg-zinc-900"
          >
            <SkipForward size={15} fill="currentColor" />
          </button>
        </div>

        {/* Repeat */}
        <button
          onClick={onToggleRepeat}
          className={`transition cursor-pointer p-1 rounded-md hover:bg-zinc-900 ${
            repeat ? "text-violet-500" : "text-zinc-500"
          }`}
        >
          <Repeat size={13} />
        </button>
      </div>

      {/* Volume Bar and Info footer */}
      <div className="mt-3 pt-2.5 border-t border-zinc-900 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1.5 group/vol flex-1">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 50 : 0)}
            className="text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
          >
            {volume === 0 ? <VolumeX size={11} /> : <Volume2 size={11} />}
          </button>
          <div className="flex-1 relative py-1 flex items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
            />
            <div className="w-full h-0.5 bg-zinc-900 rounded-full relative overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 bg-zinc-400 group-hover/vol:bg-violet-400 rounded-full"
                style={{ width: `${volume}%` }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => onDownloadTrack(currentTrack)}
          className={`transition cursor-pointer p-1 rounded-md hover:bg-zinc-900 ${
            isDownloaded ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
          title={isDownloaded ? "Downloaded" : "Download MP3"}
        >
          {isDownloaded ? <Check size={11} className="stroke-[3]" /> : <Download size={11} />}
        </button>
      </div>
    </motion.div>
  );
}
