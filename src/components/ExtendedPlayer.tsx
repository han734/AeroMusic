import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, SkipBack, SkipForward, Minimize2, Shuffle, Repeat, Heart, Check, Download, Volume2, VolumeX, Music, Languages, Loader2, ListMusic, Sparkles, Tv } from "lucide-react";
import { Track } from "../types";
import { aeroFetch } from "../lib/api";

interface ExtendedPlayerProps {
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
  onClose: () => void;
  onArtistClick?: (artistName: string) => void;
  activeVideoIdOverride?: string | null;
  showVideo?: boolean;
  onToggleMv?: (enabled: boolean) => Promise<void>;
}

export default function ExtendedPlayer({
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
  onClose,
  onArtistClick,
  activeVideoIdOverride,
  showVideo,
  onToggleMv,
}: ExtendedPlayerProps) {
  const [loadingMv, setLoadingMv] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [translation, setTranslation] = useState("");
  const [lang, setLang] = useState(""); // empty means original
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lyricsTab, setLyricsTab] = useState<"original" | "translation">("original");

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const [syncOffset, setSyncOffset] = useState<number>(0);

  // Load saved offset for the track when currentTrack changes
  useEffect(() => {
    if (currentTrack) {
      const saved = localStorage.getItem(`aero-sync-offset-${currentTrack.id}`);
      if (saved) {
        setSyncOffset(parseFloat(saved));
      } else {
        setSyncOffset(0);
      }
    } else {
      setSyncOffset(0);
    }
  }, [currentTrack]);

  const handleOffsetChange = (newOffset: number) => {
    setSyncOffset(newOffset);
    if (currentTrack) {
      localStorage.setItem(`aero-sync-offset-${currentTrack.id}`, String(newOffset));
    }
  };

  // Equalizer frequencies simulation
  const [eqBars, setEqBars] = useState<number[]>(Array(18).fill(20));

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setEqBars(Array(18).fill(0).map(() => Math.floor(Math.random() * 80) + 15));
      }, 120);
    } else {
      setEqBars(Array(18).fill(12));
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Fetch lyrics automatically when track loads
  const fetchLyrics = async (targetLang = "") => {
    if (!currentTrack) return;
    setLoadingLyrics(true);
    setErrorMsg("");
    try {
      const response = await aeroFetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentTrack.title,
          artist: currentTrack.artist,
          translateTo: targetLang || undefined,
        }),
      });
      const data = await response.json();

      if (data.success) {
        if (targetLang) {
          setTranslation(data.translation || "");
          setLang(targetLang);
          setLyricsTab("translation");
        } else {
          setLyrics(data.lyrics || "");
          setTranslation("");
          setLang("");
          setLyricsTab("original");
        }
      } else {
        throw new Error(data.error || "Failed to load lyrics");
      }
    } catch (err: any) {
      console.warn("Error fetching lyrics:", err);
      if (!targetLang) {
        setLyrics(`[Instrumental / Neural Static]\n\nHumming the melody of "${currentTrack.title}"...\nClose your eyes and vibe with the soundwaves!`);
      } else {
        setErrorMsg("Failed to generate translation. Try another language!");
      }
    } finally {
      setLoadingLyrics(false);
    }
  };

  useEffect(() => {
    if (currentTrack) {
      fetchLyrics("");
    } else {
      setLyrics("");
      setTranslation("");
    }
  }, [currentTrack]);

  // Formatter
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const percentProgress = duration > 0 ? (progress / duration) * 100 : 0;
  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const isDownloaded = currentTrack ? downloadedTracks.some((t) => t.id === currentTrack.id) : false;

  // Sync / parsed lyrics lines
  const parsedLines = useMemo(() => {
    if (!lyrics) return [];
    const lines = lyrics.split("\n");
    
    // Check if the lyrics contain any LRC timestamps
    const hasTimestamps = lines.some(line => line.trim().match(/^\[\d{2,}:\d{2}([\.:]\d{2,3})?\]/));
    
    if (hasTimestamps) {
      const result: any[] = [];
      let count = 0;
      
      const timestampedLines = lines.map((line, idx) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^\[(\d{2,}):(\d{2})([\.:](\d{2,3}))?\](.*)/);
        if (match) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const ms = match[4] ? parseInt(match[4], 10) : 0;
          const startTime = mins * 60 + secs + (ms / (match[4] ? (match[4].length === 3 ? 1000 : 100) : 1)) + syncOffset;
          const text = match[5].trim();
          return { id: idx, text, startTime, isHeader: false };
        } else {
          const isHeader = trimmed.startsWith("[") && trimmed.endsWith("]");
          return { id: idx, text: line, startTime: -1, isHeader };
        }
      });

      const playingLines = timestampedLines.filter(l => l.startTime !== -1);
      
      timestampedLines.forEach((line) => {
        if (line.startTime !== -1) {
          const currentPlayIdx = playingLines.findIndex(pl => pl.id === line.id);
          const nextPlayLine = playingLines[currentPlayIdx + 1];
          const endTime = nextPlayLine ? nextPlayLine.startTime : (duration || 9999);
          
          result.push({
            id: line.id,
            lyricId: count++,
            text: line.text,
            isHeader: false,
            startTime: line.startTime,
            endTime
          });
        } else {
          result.push({
            id: line.id,
            lyricId: -1,
            text: line.text,
            isHeader: line.isHeader,
            startTime: 0,
            endTime: 0
          });
        }
      });
      
      return result;
    } else {
      const indices: number[] = [];
      lines.forEach((l, i) => {
        const trimmed = l.trim();
        if (trimmed && !trimmed.startsWith("[") && !trimmed.endsWith("]")) {
          indices.push(i);
        }
      });

      const totalCount = indices.length;
      if (totalCount === 0) return [];

      let totalDuration = duration || 180;
      const startOffset = Math.min(4, totalDuration * 0.05);
      const endOffset = Math.min(10, totalDuration * 0.05);
      const lyricsDuration = totalDuration - startOffset - endOffset;
      const durationPerLine = lyricsDuration / totalCount;

      let count = 0;
      return lines.map((line, idx) => {
        const trimmed = line.trim();
        const isHeader = !trimmed || (trimmed.startsWith("[") && trimmed.endsWith("]"));
        let startTime = 0;
        let endTime = 0;
        let lyricId = -1;

        if (!isHeader) {
          lyricId = count;
          startTime = startOffset + count * durationPerLine + syncOffset;
          endTime = startTime + durationPerLine;
          count++;
        }

        return { id: idx, lyricId, text: line, isHeader, startTime, endTime };
      });
    }
  }, [lyrics, duration, syncOffset]);

  const parsedTranslationLines = useMemo(() => {
    if (!translation) return [];
    const lines = translation.split("\n");
    
    // Check if translation contains timestamps
    const hasTimestamps = lines.some(line => line.trim().match(/^\[\d{2,}:\d{2}([\.:]\d{2,3})?\]/));
    
    if (hasTimestamps) {
      const result: any[] = [];
      let count = 0;
      
      const timestampedLines = lines.map((line, idx) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^\[(\d{2,}):(\d{2})([\.:](\d{2,3}))?\](.*)/);
        if (match) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const ms = match[4] ? parseInt(match[4], 10) : 0;
          const startTime = mins * 60 + secs + (ms / (match[4] ? (match[4].length === 3 ? 1000 : 100) : 1)) + syncOffset;
          const text = match[5].trim();
          return { id: idx, text, startTime, isHeader: false };
        } else {
          const isHeader = trimmed.startsWith("[") && trimmed.endsWith("]");
          return { id: idx, text: line, startTime: -1, isHeader };
        }
      });

      const playingLines = timestampedLines.filter(l => l.startTime !== -1);
      
      timestampedLines.forEach((line) => {
        if (line.startTime !== -1) {
          const currentPlayIdx = playingLines.findIndex(pl => pl.id === line.id);
          const nextPlayLine = playingLines[currentPlayIdx + 1];
          const endTime = nextPlayLine ? nextPlayLine.startTime : (duration || 9999);
          
          result.push({
            id: line.id,
            transId: count++,
            text: line.text,
            isHeader: false,
            startTime: line.startTime,
            endTime
          });
        } else {
          result.push({
            id: line.id,
            transId: -1,
            text: line.text,
            isHeader: line.isHeader,
            startTime: 0,
            endTime: 0
          });
        }
      });
      
      return result;
    } else {
      const indices: number[] = [];
      lines.forEach((l, i) => {
        const trimmed = l.trim();
        if (trimmed && !trimmed.startsWith("[") && !trimmed.endsWith("]")) {
          indices.push(i);
        }
      });

      const totalCount = indices.length;
      if (totalCount === 0) return [];

      let totalDuration = duration || 180;
      const startOffset = Math.min(4, totalDuration * 0.05);
      const endOffset = Math.min(10, totalDuration * 0.05);
      const lyricsDuration = totalDuration - startOffset - endOffset;
      const durationPerLine = lyricsDuration / totalCount;

      let count = 0;
      return lines.map((line, idx) => {
        const trimmed = line.trim();
        const isHeader = !trimmed || (trimmed.startsWith("[") && trimmed.endsWith("]"));
        let startTime = 0;
        let endTime = 0;
        let transId = -1;

        if (!isHeader) {
          transId = count;
          startTime = startOffset + count * durationPerLine + syncOffset;
          endTime = startTime + durationPerLine;
          count++;
        }

        return { id: idx, transId, text: line, isHeader, startTime, endTime };
      });
    }
  }, [translation, duration, syncOffset]);

  // Active sync line detection
  const activeLine = useMemo(() => {
    return parsedLines.find((l) => !l.isHeader && progress >= l.startTime && progress < l.endTime);
  }, [parsedLines, progress]);

  const activeLyricId = activeLine ? activeLine.lyricId : -1;

  const activeTransLine = useMemo(() => {
    return parsedTranslationLines.find((l) => !l.isHeader && progress >= l.startTime && progress < l.endTime);
  }, [parsedTranslationLines, progress]);

  const activeTransId = activeTransLine ? activeTransLine.transId : -1;

  // Auto scrolling
  useEffect(() => {
    if (lyricsTab === "original" && activeLyricId !== -1) {
      const el = document.getElementById(`ext-lyric-line-${activeLyricId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLyricId, lyricsTab]);

  useEffect(() => {
    if (lyricsTab === "translation" && activeTransId !== -1) {
      const el = document.getElementById(`ext-trans-line-${activeTransId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeTransId, lyricsTab]);

  if (!currentTrack) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white font-sans overflow-hidden select-none flex flex-col justify-between">
      {/* Immersive Blurred Background Artwork */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-35 scale-110 filter blur-3xl transition-all duration-1000">
        <img
          src={currentTrack.thumbnail}
          alt=""
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-zinc-950/40" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-white/5 backdrop-blur-md bg-black/20">
        <div className="flex items-center gap-2">
          <Sparkles className="text-violet-400 animate-pulse" size={18} />
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-400">Extended Immersive Experience</span>
        </div>
        <div className="text-center hidden md:block">
          <p className="text-xs text-zinc-500 font-mono">NOW SPINNING</p>
          <h3 className="text-sm font-bold truncate max-w-xs">{currentTrack.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-all hover:scale-110 p-2.5 rounded-full border border-white/10 hover:bg-white/5 bg-zinc-950/40 backdrop-blur cursor-pointer flex items-center justify-center"
          title="Exit Extended View"
        >
          <Minimize2 size={18} />
        </button>
      </header>

      {/* Main Container: Split columns for Cover Art (Left) and Lyrics (Right) */}
      <main className="relative z-10 flex-1 px-4 md:px-12 py-6 overflow-hidden flex flex-col md:flex-row gap-8 md:gap-16 max-w-7xl mx-auto w-full min-h-0">
        {/* Left column: Vinyl Cover art & Equalizer visualization */}
        <div className="flex-1 flex flex-col justify-center items-center gap-4 md:gap-5 shrink-0 md:max-w-md lg:max-w-lg min-h-0">
          {/* Rounded-Square Cover Art */}
          <div className="relative group w-52 h-52 md:w-64 md:h-64 lg:w-72 lg:h-72 max-h-[30vh] max-w-[30vh] shrink-0 aspect-square select-none flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900">
            {showVideo ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-md">
                <div className="w-10 h-10 bg-violet-600/20 border border-violet-500/30 rounded-2xl flex items-center justify-center text-violet-400 mb-2 animate-pulse">
                  <Tv size={20} />
                </div>
                <h4 className="text-xs font-bold text-zinc-100 mb-1">Music Video Active</h4>
                <p className="text-[10px] text-zinc-400 max-w-xs leading-normal">
                  The official MV is playing. View it in the picture-in-picture box or maximize it to full screen.
                </p>
              </div>
            ) : (
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className="w-full h-full object-cover rounded-3xl group-hover:scale-[1.03] transition duration-500"
                referrerPolicy="no-referrer"
              />
            )}

            {/* Integrated glassmorphic equalizer overlay at the bottom of cover art */}
            <div className="absolute bottom-2.5 left-2.5 right-2.5 h-8 bg-black/40 border border-white/10 backdrop-blur-md rounded-xl flex items-end justify-between px-2.5 py-1.5 gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
              {eqBars.map((val, idx) => (
                <div
                  key={idx}
                  className="w-1 rounded-full bg-gradient-to-t from-violet-500 via-violet-400 to-violet-300 transition-all duration-100"
                  style={{ height: `${Math.max(val, 15)}%` }}
                />
              ))}
            </div>
          </div>

          {/* Track details header */}
          <div className="text-center max-w-sm shrink-0">
            <h1 className="text-lg md:text-xl font-black tracking-tight truncate text-zinc-100">{currentTrack.title}</h1>
            <p 
              className="text-xs text-zinc-400 font-semibold mt-0.5 hover:underline cursor-pointer"
              onClick={() => {
                onArtistClick && onArtistClick(currentTrack.artist);
                onClose();
              }}
            >
              {currentTrack.artist}
            </p>
            <span className="inline-block mt-2 px-2.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[9px] font-mono tracking-widest rounded-full uppercase font-bold">
              {currentTrack.genre || "Audio Track"}
            </span>
          </div>
        </div>

        {/* Right column: Interactive Scrolling Sync Lyrics */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black/30 border border-white/5 rounded-3xl p-6 backdrop-blur-md min-h-0">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
            <div className="flex items-center gap-2">
              <ListMusic size={16} className="text-zinc-400" />
              <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">Interactive Lyrics</h3>
            </div>
            
            {/* Translations Select Bar */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setLyricsTab("original");
                }}
                className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer border ${
                  lyricsTab === "original"
                    ? "bg-violet-500/20 border-violet-500/30 text-violet-400 font-extrabold"
                    : "text-zinc-500 hover:text-zinc-300 border-transparent"
                }`}
              >
                Original
              </button>

              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-350 relative shrink-0">
                <Languages size={11} className="text-zinc-500 shrink-0" />
                <select
                  value={lyricsTab === "translation" ? lang : ""}
                  onChange={(e) => {
                    const selectedLang = e.target.value;
                    if (!selectedLang) {
                      setLyricsTab("original");
                    } else {
                      fetchLyrics(selectedLang);
                    }
                  }}
                  className="bg-transparent text-[10px] font-mono font-bold text-zinc-300 focus:outline-none cursor-pointer pr-1"
                >
                  <option value="" className="bg-zinc-950 text-zinc-500">Translate...</option>
                  <option value="English" className="bg-zinc-950 text-zinc-200">English (en)</option>
                  <option value="Hindi" className="bg-zinc-950 text-zinc-200">Hindi (hi)</option>
                  <option value="Spanish" className="bg-zinc-950 text-zinc-200">Spanish (es)</option>
                  <option value="Japanese" className="bg-zinc-950 text-zinc-200">Japanese (ja)</option>
                  <option value="Korean" className="bg-zinc-950 text-zinc-200">Korean (ko)</option>
                  <option value="Vietnamese" className="bg-zinc-950 text-zinc-200">Vietnamese (vi)</option>
                  <option value="French" className="bg-zinc-950 text-zinc-200">French (fr)</option>
                  <option value="German" className="bg-zinc-950 text-zinc-200">German (de)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sync offset controls */}
          <div className="flex items-center justify-between px-4 py-2 bg-white/5 border border-white/5 backdrop-blur rounded-2xl mb-4 text-xs font-mono text-zinc-400 shrink-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-violet-400" />
              <span>Sync Offset: <strong className={syncOffset === 0 ? "text-zinc-400" : "text-violet-400"}>{syncOffset > 0 ? `+${syncOffset.toFixed(1)}s` : `${syncOffset.toFixed(1)}s`}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleOffsetChange(syncOffset - 0.5)}
                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/5 rounded-lg font-bold transition hover:scale-105 active:scale-95 cursor-pointer text-[10px]"
                title="Shift lyrics earlier by 0.5 seconds"
              >
                -0.5s
              </button>
              <button
                onClick={() => handleOffsetChange(0)}
                disabled={syncOffset === 0}
                className={`px-2 py-1 border rounded-lg font-bold transition hover:scale-105 active:scale-95 cursor-pointer text-[10px] ${
                  syncOffset === 0 
                    ? "bg-zinc-950 text-zinc-650 border-zinc-900/50 cursor-not-allowed" 
                    : "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-white/5"
                }`}
                title="Reset synchronization offset"
              >
                Reset
              </button>
              <button
                onClick={() => handleOffsetChange(syncOffset + 0.5)}
                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/5 rounded-lg font-bold transition hover:scale-105 active:scale-95 cursor-pointer text-[10px]"
                title="Delay lyrics by 0.5 seconds"
              >
                +0.5s
              </button>
            </div>
          </div>

          {/* Sync lyrics content */}
          <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto pr-1 custom-scrollbar scroll-smooth select-none py-12">
            {loadingLyrics ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                <Loader2 className="animate-spin text-violet-500 mb-3" size={28} />
                <span className="text-xs font-mono font-semibold">Synthesizing lyrics...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex items-center justify-center h-full text-xs font-mono text-rose-400 gap-2">
                <span>{errorMsg}</span>
              </div>
            ) : lyricsTab === "original" ? (
              <div className="space-y-6">
                {parsedLines.length > 0 ? (
                  parsedLines.map((line) => {
                    if (line.isHeader) {
                      return (
                        <div key={line.id} className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest pt-4 pb-1">
                          {line.text}
                        </div>
                      );
                    }
                    if (!line.text.trim()) {
                      return <div key={line.id} className="h-4" />;
                    }
                    const isActive = line.lyricId === activeLyricId;
                    const isPast = line.lyricId < activeLyricId;

                    return (
                      <div
                        key={line.id}
                        id={`ext-lyric-line-${line.lyricId}`}
                        onClick={() => onSeek?.(line.startTime)}
                        className={`group flex items-start justify-between gap-4 py-2 px-3 rounded-xl transition-all duration-300 cursor-pointer origin-left ${
                          isActive 
                            ? "text-white text-xl md:text-2xl font-black bg-violet-500/15 border-l-4 border-violet-500 pl-4 scale-[1.03] filter drop-shadow-[0_4px_12px_rgba(16,185,129,0.3)]" 
                            : isPast 
                              ? "text-zinc-400 font-semibold text-base md:text-lg hover:text-zinc-200" 
                              : "text-zinc-600 font-semibold text-base md:text-lg hover:text-zinc-400"
                        }`}
                      >
                        <span className="leading-relaxed flex-1">{line.text}</span>
                        <div className="flex items-center gap-2 shrink-0 self-center">
                          {isActive && <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />}
                          <Play size={12} className="text-violet-400 opacity-0 group-hover:opacity-100 transition duration-150 mt-0.5" />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-zinc-500 text-center text-sm italic py-12">No lyrics found for this track.</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {parsedTranslationLines.length > 0 ? (
                  parsedTranslationLines.map((line) => {
                    if (line.isHeader) {
                      return (
                        <div key={line.id} className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest pt-4 pb-1">
                          {line.text}
                        </div>
                      );
                    }
                    if (!line.text.trim()) {
                      return <div key={line.id} className="h-4" />;
                    }
                    const isActive = line.transId === activeTransId;
                    const isPast = line.transId < activeTransId;

                    return (
                      <div
                        key={line.id}
                        id={`ext-trans-line-${line.transId}`}
                        onClick={() => onSeek?.(line.startTime)}
                        className={`group flex items-start justify-between gap-4 py-2 px-3 rounded-xl transition-all duration-300 cursor-pointer origin-left ${
                          isActive 
                            ? "text-violet-300 text-xl md:text-2xl font-black bg-violet-500/15 border-l-4 border-violet-500 pl-4 scale-[1.03] filter drop-shadow-[0_4px_12px_rgba(16,185,129,0.3)]" 
                            : isPast 
                              ? "text-violet-600/80 font-semibold text-base md:text-lg hover:text-violet-400" 
                              : "text-violet-950 font-semibold text-base md:text-lg hover:text-violet-800"
                        }`}
                      >
                        <span className="leading-relaxed flex-1">{line.text}</span>
                        <div className="flex items-center gap-2 shrink-0 self-center">
                          {isActive && <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />}
                          <Play size={12} className="text-violet-400 opacity-0 group-hover:opacity-100 transition duration-150 mt-0.5" />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-zinc-500 text-center text-sm italic py-12">Select a language above to generate instant translations!</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Controls & Scrubber */}
      <footer className="relative z-10 bg-black/60 backdrop-blur-xl border-t border-white/5 py-6 px-8 flex flex-col gap-4">
        {/* Scrubber slider bar */}
        <div className="w-full flex items-center gap-4 max-w-5xl mx-auto">
          <span className="text-[11px] font-mono text-zinc-500 w-10 text-right font-bold select-none">
            {formatTime(progress)}
          </span>
          <div className="flex-1 relative group py-2.5 flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
            />
            <div className="w-full h-1.5 bg-zinc-700 rounded-full relative overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 bg-violet-500 group-hover:bg-violet-400 rounded-full"
                style={{ width: `${percentProgress}%` }}
              />
            </div>
            <div
              className="absolute w-3 h-3 bg-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow -translate-x-1/2 pointer-events-none"
              style={{ left: `${percentProgress}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-500 w-10 text-left font-bold select-none">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons Row */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
          {/* Track metadata short */}
          <div className="flex items-center gap-4 min-w-0 flex-1 justify-start w-full sm:w-auto">
            <button
              onClick={() => onToggleLike(currentTrack)}
              className={`transition cursor-pointer p-2 rounded-xl bg-zinc-900 border border-white/5 ${
                isLiked ? "text-violet-500 border-violet-500/30 scale-105" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
            </button>
            
            <button
              onClick={() => onDownloadTrack(currentTrack)}
              className={`transition cursor-pointer p-2 rounded-xl bg-zinc-900 border border-white/5 ${
                isDownloaded ? "text-violet-400 border-violet-500/30" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {isDownloaded ? <Check size={16} className="stroke-[3]" /> : <Download size={16} />}
            </button>

            <button
              onClick={async () => {
                if (onToggleMv) {
                  setLoadingMv(true);
                  await onToggleMv(!activeVideoIdOverride);
                  setLoadingMv(false);
                }
              }}
              disabled={loadingMv || !onToggleMv}
              className={`transition cursor-pointer p-2 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center ${
                activeVideoIdOverride ? "text-violet-400 border-violet-500/30 bg-violet-500/10" : "text-zinc-500 hover:text-zinc-350"
              } disabled:opacity-50`}
              title="Watch Official Music Video"
            >
              {loadingMv ? (
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              ) : (
                <Tv size={16} />
              )}
            </button>
          </div>

          {/* Central Controls */}
          <div className="flex items-center gap-6 justify-center">
            <button
              onClick={onToggleShuffle}
              className={`transition cursor-pointer p-1.5 rounded-lg ${
                shuffle ? "text-violet-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Shuffle size={18} />
            </button>

            <button
              onClick={onPrevious}
              className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer p-1.5"
            >
              <SkipBack size={22} fill="currentColor" />
            </button>

            <button
              onClick={onPlayPauseToggle}
              className="bg-white hover:bg-zinc-100 text-black p-4 rounded-full transition-all duration-200 transform hover:scale-110 active:scale-95 shadow-lg flex items-center justify-center cursor-pointer shrink-0"
            >
              {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
            </button>

            <button
              onClick={onNext}
              className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer p-1.5"
            >
              <SkipForward size={22} fill="currentColor" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`transition cursor-pointer p-1.5 rounded-lg ${
                repeat ? "text-violet-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Repeat size={18} />
            </button>
          </div>

          {/* Right Vol controller */}
          <div className="flex items-center gap-3 w-full sm:w-36 justify-end">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 50 : 0)}
              className="text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="flex-1 relative py-2 flex items-center">
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
              />
              <div className="w-full h-1 bg-zinc-800 rounded-full relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-zinc-400 group-hover:bg-violet-400 rounded-full"
                  style={{ width: `${volume}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
