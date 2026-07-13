import React, { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, Languages, Music, Loader2, Info, AlertCircle, Play } from "lucide-react";
import { Track } from "../types";
import { aeroFetch } from "../lib/api";

interface LyricsAnalyzerProps {
  currentTrack: Track | null;
  currentTime?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
}

export default function LyricsAnalyzer({ 
  currentTrack,
  currentTime = 0,
  duration = 0,
  onSeek
}: LyricsAnalyzerProps) {
  const [loading, setLoading] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [meaning, setMeaning] = useState("");
  const [translation, setTranslation] = useState("");
  const [lang, setLang] = useState(""); // empty means original
  const [errorMsg, setErrorMsg] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"lyrics" | "insight">("lyrics");

  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Parse lyrics into synchronized lines
  const parsedLines = useMemo(() => {
    if (!lyrics) return [];
    
    // Check if the lyrics has LRC timestamps anywhere
    const hasTimestamps = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);
    const lines = lyrics.split("\n");
    
    if (hasTimestamps) {
      const result = [];
      let lyricCount = 0;
      
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line) {
          result.push({
            id: idx,
            lyricId: -1,
            text: "",
            isHeader: true,
            startTime: 0,
            endTime: 0,
          });
          continue;
        }
        
        // Match standard LRC timestamp: [mm:ss.xx] text
        const lrcMatch = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (lrcMatch) {
          const mins = parseInt(lrcMatch[1], 10);
          const secs = parseInt(lrcMatch[2], 10);
          const centis = parseInt(lrcMatch[3], 10);
          const text = lrcMatch[4].trim();
          
          // Calculate start time in seconds
          const startTime = mins * 60 + secs + centis / (lrcMatch[3].length === 3 ? 1000 : 100);
          
          result.push({
            id: idx,
            lyricId: lyricCount++,
            text,
            isHeader: false,
            startTime,
            endTime: startTime + 4, // Default duration fallback, will be adjusted
          });
        } else {
          // Check if it's metadata like [ti:Title] or standard header like [Verse 1]
          const isLrcMetadata = /^\[[a-z]{2}:/.test(line);
          const cleanText = line.replace(/^\[(.*)\]$/, "$1");
          result.push({
            id: idx,
            lyricId: -1,
            text: isLrcMetadata ? "" : cleanText,
            isHeader: true,
            startTime: 0,
            endTime: 0,
          });
        }
      }
      
      // Set end time of each line to start time of the next active line
      const activeLines = result.filter(l => !l.isHeader);
      for (let i = 0; i < activeLines.length; i++) {
        const current = activeLines[i];
        const next = activeLines[i + 1];
        if (next) {
          current.endTime = next.startTime;
        } else {
          current.endTime = duration > 0 ? duration : current.startTime + 10;
        }
      }
      
      return result;
    }
    
    // Equal-Division Fallback Logic
    const lyricLinesIndices: number[] = [];
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("[") && !trimmed.endsWith("]")) {
        lyricLinesIndices.push(idx);
      }
    });

    const totalLyricsCount = lyricLinesIndices.length;
    if (totalLyricsCount === 0) return [];

    let totalDuration = duration || 0;
    if (totalDuration <= 0 && currentTrack?.duration) {
      const parts = currentTrack.duration.split(":").map(Number);
      if (parts.length === 2) {
        totalDuration = parts[0] * 60 + parts[1];
      } else {
        totalDuration = 180;
      }
    }
    if (totalDuration <= 0) {
      totalDuration = 180;
    }

    const startOffset = Math.min(4, totalDuration * 0.05);
    const endOffset = Math.min(10, totalDuration * 0.05);
    const lyricsDuration = totalDuration - startOffset - endOffset;
    const durationPerLine = lyricsDuration / totalLyricsCount;

    let lyricCount = 0;
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      const isHeader = !trimmed || (trimmed.startsWith("[") && trimmed.endsWith("]"));
      
      let startTime = 0;
      let endTime = 0;
      let lyricId = -1;

      if (!isHeader) {
        lyricId = lyricCount;
        startTime = startOffset + lyricCount * durationPerLine;
        endTime = startTime + durationPerLine;
        lyricCount++;
      }

      return {
        id: idx,
        lyricId,
        text: line,
        isHeader,
        startTime,
        endTime,
      };
    });
  }, [lyrics, duration, currentTrack]);

  // Parse translation lines
  const parsedTranslationLines = useMemo(() => {
    if (!translation) return [];
    
    const hasTimestamps = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(translation);
    const lines = translation.split("\n");
    
    if (hasTimestamps) {
      const result = [];
      let transCount = 0;
      
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line) {
          result.push({
            id: idx,
            transId: -1,
            text: "",
            isHeader: true,
            startTime: 0,
            endTime: 0,
          });
          continue;
        }
        
        const lrcMatch = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (lrcMatch) {
          const mins = parseInt(lrcMatch[1], 10);
          const secs = parseInt(lrcMatch[2], 10);
          const centis = parseInt(lrcMatch[3], 10);
          const text = lrcMatch[4].trim();
          
          const startTime = mins * 60 + secs + centis / (lrcMatch[3].length === 3 ? 1000 : 100);
          
          result.push({
            id: idx,
            transId: transCount++,
            text,
            isHeader: false,
            startTime,
            endTime: startTime + 4,
          });
        } else {
          const isLrcMetadata = /^\[[a-z]{2}:/.test(line);
          const cleanText = line.replace(/^\[(.*)\]$/, "$1");
          result.push({
            id: idx,
            transId: -1,
            text: isLrcMetadata ? "" : cleanText,
            isHeader: true,
            startTime: 0,
            endTime: 0,
          });
        }
      }
      
      const activeLines = result.filter(l => !l.isHeader);
      for (let i = 0; i < activeLines.length; i++) {
        const current = activeLines[i];
        const next = activeLines[i + 1];
        if (next) {
          current.endTime = next.startTime;
        } else {
          current.endTime = duration > 0 ? duration : current.startTime + 10;
        }
      }
      
      return result;
    }
    
    // Equal-Division Fallback Logic for translation
    const transLinesIndices: number[] = [];
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("[") && !trimmed.endsWith("]")) {
        transLinesIndices.push(idx);
      }
    });

    const totalTransCount = transLinesIndices.length;
    if (totalTransCount === 0) return [];

    let totalDuration = duration || 0;
    if (totalDuration <= 0 && currentTrack?.duration) {
      const parts = currentTrack.duration.split(":").map(Number);
      if (parts.length === 2) {
        totalDuration = parts[0] * 60 + parts[1];
      } else {
        totalDuration = 180;
      }
    }
    if (totalDuration <= 0) {
      totalDuration = 180;
    }

    const startOffset = Math.min(4, totalDuration * 0.05);
    const endOffset = Math.min(10, totalDuration * 0.05);
    const lyricsDuration = totalDuration - startOffset - endOffset;
    const durationPerLine = lyricsDuration / totalTransCount;

    let transCount = 0;
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      const isHeader = !trimmed || (trimmed.startsWith("[") && trimmed.endsWith("]"));
      
      let startTime = 0;
      let endTime = 0;
      let transId = -1;

      if (!isHeader) {
        transId = transCount;
        startTime = startOffset + transCount * durationPerLine;
        endTime = startTime + durationPerLine;
        transCount++;
      }

      return {
        id: idx,
        transId,
        text: line,
        isHeader,
        startTime,
        endTime,
      };
    });
  }, [translation, duration, currentTrack]);

  // Active line detection
  const activeLine = useMemo(() => {
    return parsedLines.find(
      (l) => !l.isHeader && currentTime >= l.startTime && currentTime < l.endTime
    );
  }, [parsedLines, currentTime]);

  const activeLyricId = activeLine ? activeLine.lyricId : -1;

  const activeTransLine = useMemo(() => {
    return parsedTranslationLines.find(
      (l) => !l.isHeader && currentTime >= l.startTime && currentTime < l.endTime
    );
  }, [parsedTranslationLines, currentTime]);

  const activeTransId = activeTransLine ? activeTransLine.transId : -1;

  // Auto scroll effect
  useEffect(() => {
    if (activeLyricId !== -1) {
      const activeEl = document.getElementById(`lyric-line-${activeLyricId}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [activeLyricId]);

  useEffect(() => {
    if (activeTransId !== -1) {
      const activeEl = document.getElementById(`trans-line-${activeTransId}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [activeTransId]);



  const fetchLyrics = async (targetLang = "") => {
    if (!currentTrack) return;
    setLoading(true);
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
        setLyrics(data.lyrics || "");
        setMeaning(data.meaning || "");
        setTranslation(data.translation || "");
      } else {
        throw new Error(data.error || "Failed to load lyrics");
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg("Failed to stream neural lyrics indices. Loaded offline hums.");
      setLyrics(`[Instrumental / Neural Static]\n\nHumming the melody of "${currentTrack.title}"...\nClose your eyes and vibe with the soundwaves!`);
      setMeaning("The song is an emotional expression beyond words.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch lyrics whenever the active song changes
  useEffect(() => {
    if (currentTrack) {
      setLang("");
      setTranslation("");
      fetchLyrics("");
    } else {
      setLyrics("");
      setMeaning("");
      setTranslation("");
    }
  }, [currentTrack]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedLang = e.target.value;
    setLang(selectedLang);
    fetchLyrics(selectedLang);
  };

  if (!currentTrack) {
    return (
      <div id="lyrics-analyzer" className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 bg-gradient-to-b from-zinc-900 to-black select-none">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-full mb-6">
          <Music size={50} className="text-zinc-600 animate-pulse" />
        </div>
        <h3 className="text-2xl font-extrabold text-white mb-2">No Song Playing</h3>
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
          Select a song from Home or Search to analyze real-time lyrics and deeper meanings.
        </p>
      </div>
    );
  }

  return (
    <div id="lyrics-analyzer" className="flex-1 flex flex-col h-full overflow-hidden text-white bg-gradient-to-b from-zinc-900 to-black select-none">
      
      {/* Large Scrolling Floating Lyrics */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6 custom-scrollbar">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shadow">
              <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black truncate">{currentTrack.title}</h2>
              <p className="text-zinc-400 text-xs truncate font-medium">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Translation selector */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <Languages size={14} className="text-violet-400" />
            <select
              value={lang}
              onChange={handleLanguageChange}
              className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none border-0 pr-2 cursor-pointer"
            >
              <option value="">Original Lyrics</option>
              <option value="English">English (Translation)</option>
              <option value="Spanish">Español (Spanish)</option>
              <option value="French">Français (French)</option>
              <option value="Japanese">日本語 (Japanese)</option>
              <option value="Hindi">हिन्दी (Hindi)</option>
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-lg flex items-center gap-2 text-xs text-amber-400 font-medium">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scrolling Lyrics typography */}
        <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto py-4 pr-2 custom-scrollbar select-none">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400">
              <Loader2 className="animate-spin text-violet-500 mb-3" size={32} />
              <p className="text-xs font-semibold">Generating real-time syllables...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* If translated, show translated text next or replacement */}
              {translation ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-1 shrink-0">Original lyrics</h4>
                    <div className="space-y-4">
                      {parsedLines.map((line) => {
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
                            id={`lyric-line-${line.lyricId}`}
                            onClick={() => onSeek?.(line.startTime)}
                            className={`group flex items-start justify-between gap-3 py-1.5 px-3 rounded-lg transition-all duration-300 cursor-pointer origin-left ${
                              isActive 
                                ? "text-white text-base md:text-lg font-extrabold bg-violet-500/10 border-l-4 border-violet-500 pl-3 scale-[1.02] filter drop-shadow-[0_2px_8px_rgba(16,185,129,0.25)]" 
                                : isPast 
                                  ? "text-zinc-400 font-medium text-sm hover:text-zinc-200" 
                                  : "text-zinc-600 font-medium text-sm hover:text-zinc-400"
                            }`}
                          >
                            <span className="leading-relaxed flex-1">{line.text}</span>
                            <div className="flex items-center gap-1.5 shrink-0 self-center">
                              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />}
                              <Play size={10} className="text-violet-400 opacity-0 group-hover:opacity-100 transition duration-150" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-mono font-bold text-violet-500 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-1 shrink-0">Translation ({lang})</h4>
                    <div className="space-y-4">
                      {parsedTranslationLines.map((line) => {
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
                            id={`trans-line-${line.transId}`}
                            onClick={() => onSeek?.(line.startTime)}
                            className={`group flex items-start justify-between gap-3 py-1.5 px-3 rounded-lg transition-all duration-300 cursor-pointer origin-left ${
                              isActive 
                                ? "text-violet-300 text-base md:text-lg font-extrabold bg-violet-500/10 border-l-4 border-violet-500 pl-3 scale-[1.02] filter drop-shadow-[0_2px_8px_rgba(16,185,129,0.25)]" 
                                : isPast 
                                  ? "text-violet-600/80 font-medium text-sm hover:text-violet-400" 
                                  : "text-violet-950 font-medium text-sm hover:text-violet-800"
                            }`}
                          >
                            <span className="leading-relaxed flex-1">{line.text}</span>
                            <div className="flex items-center gap-1.5 shrink-0 self-center">
                              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />}
                              <Play size={10} className="text-violet-400 opacity-0 group-hover:opacity-100 transition duration-150" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl space-y-4">
                  {parsedLines.map((line) => {
                    if (line.isHeader) {
                      return (
                        <div key={line.id} className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest pt-6 pb-2">
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
                        id={`lyric-line-${line.lyricId}`}
                        onClick={() => onSeek?.(line.startTime)}
                        className={`group flex items-start justify-between gap-4 py-2 px-4 rounded-xl transition-all duration-300 cursor-pointer origin-left ${
                          isActive 
                            ? "text-white text-xl md:text-2xl font-black bg-violet-500/10 border-l-4 border-violet-500 pl-4 scale-[1.02] filter drop-shadow-[0_4px_12px_rgba(16,185,129,0.25)]" 
                            : isPast 
                              ? "text-zinc-400 font-semibold text-lg hover:text-zinc-200" 
                              : "text-zinc-600 font-semibold text-lg hover:text-zinc-400"
                        }`}
                      >
                        <span className="leading-relaxed flex-1">{line.text}</span>
                        <div className="flex items-center gap-2 shrink-0 self-center">
                          {isActive && <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />}
                          <Play size={14} className="text-violet-400 opacity-0 group-hover:opacity-100 transition duration-200 mt-0.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
