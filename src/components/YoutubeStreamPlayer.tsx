import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { aeroFetch, getApiBaseUrl } from "../lib/api";
import { registerPlugin, Capacitor } from "@capacitor/core";
import { getLocalTrackUri } from "../lib/offlineStorage";

interface YoutubeStreamPlayerProps {
  videoId: string;
  isPlaying: boolean;
  volume: number; // 0 to 100
  seekToTime?: number | null; // Trigger seek when set
  onProgress?: (currentTime: number, duration: number) => void;
  onSongFinished?: () => void;
  onReady?: () => void;
  showVideo: boolean;
  onCloseVideo?: () => void;
  offlineAudioUrl?: string | null;
  trackTitle?: string;
  trackArtist?: string;
  trackArtwork?: string;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

const MediaNotification = registerPlugin<any>("MediaNotification");
const isCapacitor = Capacitor.isNativePlatform();

export default function YoutubeStreamPlayer({
  videoId,
  isPlaying,
  volume,
  seekToTime,
  onProgress,
  onSongFinished,
  onReady,
  showVideo,
  onCloseVideo,
  offlineAudioUrl,
  trackTitle,
  trackArtist,
  trackArtwork,
}: YoutubeStreamPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [apiReady, setApiReady] = useState(false);

  // Stream URL fetched from backend (/api/stream-url) for non-downloaded tracks
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [localFileUri, setLocalFileUri] = useState<string | null>(null);

  // Effective audio URL: prefer locally-downloaded file on DEVICE, then server cache, then live stream
  // When this is set the component uses <audio> instead of the YouTube IFrame,
  // which means background playback works natively on Android.
  const effectiveAudioUrl = localFileUri || offlineAudioUrl || streamUrl;

  const audioContextRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);

  // Update EQ Node values from localStorage
  const updateEQFilters = () => {
    if (!filtersRef.current.length) return;
    try {
      const enabled = localStorage.getItem("setting-eq-enabled") !== "false";
      const stored = localStorage.getItem("setting-eq-sliders");
      const sliders = stored ? JSON.parse(stored) : { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 };
      
      const gains = [sliders.hz60, sliders.hz230, sliders.hz910, sliders.hz4k, sliders.hz14k];
      filtersRef.current.forEach((filter, idx) => {
        filter.gain.value = enabled ? gains[idx] : 0;
      });
      console.log("Updated WebAudio EQ nodes with values:", enabled ? gains : "Flat (Bypassed)");
    } catch (e) {
      console.warn("Failed to update EQ nodes:", e);
    }
  };

  // Listen to setting updates in real time
  useEffect(() => {
    window.addEventListener("aero-settings-updated", updateEQFilters);
    return () => window.removeEventListener("aero-settings-updated", updateEQFilters);
  }, []);

  // Resume context on play start
  useEffect(() => {
    if (isPlaying && audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(e => console.warn("Failed to resume audio context:", e));
    }
  }, [isPlaying]);

  const onSongFinishedRef = useRef(onSongFinished);
  const onProgressRef = useRef(onProgress);
  const onReadyRef = useRef(onReady);
  // Keep a ref so the YouTube event handler always sees the latest isPlaying value
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    onSongFinishedRef.current = onSongFinished;
  }, [onSongFinished]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const isElectronPlayer = typeof window !== "undefined" && (
    window.navigator.userAgent.toLowerCase().includes("electron") ||
    !!(window as any).electronAPI
  );

  const resolvedAudioUrl = effectiveAudioUrl
    ? (effectiveAudioUrl.startsWith("http")
        ? effectiveAudioUrl
        : `${(isElectronPlayer && effectiveAudioUrl.startsWith("/api/offline-audio")) ? "http://localhost:3000" : (getApiBaseUrl() || "")}${effectiveAudioUrl}`)
    : "";

  // ---------------------------------------------------------------------------
  // Android/Capacitor Native Playback Path
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isCapacitor) return;
    if (!resolvedAudioUrl) return;

    const seekToMs = seekToTime !== null && seekToTime !== undefined ? Math.round(seekToTime * 1000) : -1;

    MediaNotification.update({
      title: trackTitle || "AeroMusic",
      artist: trackArtist || "",
      album: "AeroMusic Premium",
      artwork: trackArtwork || "",
      isPlaying: isPlaying,
      url: resolvedAudioUrl,
      seekTo: seekToMs
    }).catch((e: any) => console.error("Native MediaNotification update failed:", e));
  }, [resolvedAudioUrl, isPlaying, seekToTime, trackTitle, trackArtist, trackArtwork]);

  useEffect(() => {
    if (!isCapacitor) return;

    const subTime = MediaNotification.addListener("timeUpdate", (data: any) => {
      if (onProgressRef.current) {
        onProgressRef.current(data.currentTime, data.duration);
      }
    });

    const subAction = MediaNotification.addListener("mediaAction", (data: any) => {
      if (data.action === "ended" && onSongFinishedRef.current) {
        onSongFinishedRef.current();
      } else if (data.action === "prepared" && onReadyRef.current) {
        onReadyRef.current();
      }
    });

    return () => {
      try { subTime.remove(); } catch (_) {}
      try { subAction.remove(); } catch (_) {}
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Check for TRUE offline file on device storage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    if (!isCapacitor || !videoId) {
      setLocalFileUri(null);
      return;
    }

    getLocalTrackUri(videoId).then(uri => {
      if (active) {
        if (uri) {
          console.log(`[YoutubeStreamPlayer] Found local device file: ${uri}`);
          setLocalFileUri(uri);
        } else {
          setLocalFileUri(null);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [videoId]);

  // ---------------------------------------------------------------------------
  // Auto-fetch direct stream URL from backend when videoId changes.
  // yt-dlp on the server extracts the raw googlevideo.com audio URL.
  // Playing it via <audio> bypasses all YouTube IFrame background-pause logic.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (offlineAudioUrl) return; // offline file takes priority
    if (!videoId) return;

    setStreamUrl(null);
    setStreamLoading(true);

    const controller = new AbortController();

    aeroFetch(`/api/stream-url?id=${encodeURIComponent(videoId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const chosenUrl = data.url;
          setStreamUrl(chosenUrl);
        } else {
          console.warn("[AeroMusic] stream-url failed, falling back to YouTube IFrame");
        }
        setStreamLoading(false);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          console.warn("[AeroMusic] stream-url fetch error:", err);
        }
        setStreamLoading(false);
      });

    return () => {
      controller.abort();
      setStreamUrl(null);
    };
  }, [videoId, offlineAudioUrl]);

  // Initialize YouTube IFrame API (only used as fallback when stream URL is unavailable)
  useEffect(() => {
    if (effectiveAudioUrl) return; // use native <audio> path instead

    if (window.YT) {
      setApiReady(true);
      return;
    }

    // If script not loaded, load it
    const existingScript = document.getElementById("youtube-iframe-api");
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    // Set callback
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      setApiReady(true);
    };

    return () => {
      // Keep script, but reset global callback if needed
    };
  }, [effectiveAudioUrl]);

  // Initialize Player (YouTube IFrame fallback only)
  useEffect(() => {
    if (effectiveAudioUrl) {
      // Pause any active YouTube iframe when switching to native audio
      if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
        try { playerRef.current.pauseVideo(); } catch (e) {}
      }
      return;
    }
    if (!apiReady || !videoId) return;

    const createPlayer = () => {
      const savedQuality = localStorage.getItem("setting-audio-quality") || "high";
      const ytQuality = savedQuality === "low" ? "small" : savedQuality === "medium" ? "medium" : savedQuality === "high" ? "large" : "hd720";

      if (playerRef.current) {
        // Just load new video if player already exists
        try {
          playerRef.current.loadVideoById({
            videoId: videoId,
            suggestedQuality: ytQuality
          });
          if (isPlaying) {
            playerRef.current.playVideo();
          } else {
            playerRef.current.pauseVideo();
          }
          playerRef.current.setVolume(volume);
        } catch (e) {
          console.error("Error changing video:", e);
        }
        return;
      }

      // Create new player
      const placeholder = document.createElement("div");
      placeholder.id = "yt-player-element";
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(placeholder);
      }

      playerRef.current = new window.YT.Player("yt-player-element", {
        height: "100%",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(volume);
            if (isPlaying) {
              event.target.playVideo();
            }
            if (onReadyRef.current) onReadyRef.current();
          },
          onStateChange: (event: any) => {
            // YT.PlayerState values: ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3
            if (event.data === 0) {
              // Track ended — advance to next
              if (onSongFinishedRef.current) onSongFinishedRef.current();
            } else if (event.data === 2 && isPlayingRef.current) {
              // YouTube paused while we're supposed to be playing.
              // This happens when Android fires visibilitychange→hidden in background.
              // Immediately resume playback as our final safety net.
              setTimeout(() => {
                try { event.target.playVideo(); } catch (_) {}
              }, 200);
            }
          },
          onError: (event: any) => {
            console.error("YouTube Player Error:", event.data);
            // Auto skip if video cannot be played (e.g. copyright, embedding restricted)
            if (onSongFinishedRef.current) {
              // Delay slightly to avoid rapid loops
              setTimeout(() => {
                if (onSongFinishedRef.current) onSongFinishedRef.current();
              }, 1500);
            }
          }
        },
      });
    };

    createPlayer();

    return () => {
      // Don't destroy immediately to avoid flickering, let createPlayer re-use
    };
  }, [apiReady, videoId, offlineAudioUrl]);

  // Native audio path — used for BOTH offline files AND live stream URLs
  useEffect(() => {
    if (isCapacitor) return; // Skip if on Android/Capacitor (handled by native service)
    if (!resolvedAudioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    const isLocalFile = !resolvedAudioUrl.startsWith("http") || resolvedAudioUrl.includes("localhost") || resolvedAudioUrl.includes("127.0.0.1") || resolvedAudioUrl.includes("192.168."); // local/offline support crossOrigin/EQ

    // Set up AudioContext + EQ only for local offline files (requires crossOrigin)
    if (!audioContextRef.current && isLocalFile) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;

          audio.crossOrigin = "anonymous";
          const source = ctx.createMediaElementSource(audio);

          const frequencies = [60, 230, 910, 4000, 14000];
          let lastNode: AudioNode = source;

          const filters = frequencies.map((freq, idx) => {
            const filter = ctx.createBiquadFilter();
            filter.type = idx === 0 ? "lowshelf" : idx === 4 ? "highshelf" : "peaking";
            filter.frequency.value = freq;
            filter.Q.value = 1.0;
            filter.gain.value = 0;
            lastNode.connect(filter);
            lastNode = filter;
            return filter;
          });

          lastNode.connect(ctx.destination);
          filtersRef.current = filters;
          updateEQFilters();
        }
      } catch (err) {
        console.warn("Could not create Web Audio API context for EQ:", err);
      }
    }

    audio.src = resolvedAudioUrl;
    audio.load();

    const onLoaded = () => {
      if (onReadyRef.current) onReadyRef.current();
    };
    const onTimeUpdate = () => {
      if (onProgressRef.current && audio.duration) {
        onProgressRef.current(audio.currentTime, audio.duration);
      }
    };
    const onEnded = () => {
      if (onSongFinishedRef.current) onSongFinishedRef.current();
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [resolvedAudioUrl]);

  // Play / pause / volume control for native audio
  useEffect(() => {
    if (isCapacitor) return; // Skip if on Android/Capacitor
    if (!resolvedAudioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    audio.volume = volume / 100;
    if (isPlaying) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [resolvedAudioUrl, isPlaying, volume]);

  // Seek for native audio
  useEffect(() => {
    if (isCapacitor) return; // Skip if on Android/Capacitor
    if (!resolvedAudioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    if (seekToTime === null || seekToTime === undefined) return;
    audio.currentTime = seekToTime;
    if (isPlaying) {
      audio.play().catch(() => undefined);
    }
  }, [resolvedAudioUrl, seekToTime, isPlaying]);

  // Sync Pause/Play states (YouTube IFrame fallback only)
  useEffect(() => {
    if (effectiveAudioUrl) return; // handled by native audio above
    if (!playerRef.current || !playerRef.current.getPlayerState) return;
    try {
      const state = playerRef.current.getPlayerState();
      if (isPlaying && state !== 1) {
        playerRef.current.playVideo();
      } else if (!isPlaying && state === 1) {
        playerRef.current.pauseVideo();
      }
    } catch (e) {
      console.warn("Player sync error:", e);
    }
  }, [isPlaying, effectiveAudioUrl]);

  // Sync Volume states (YouTube IFrame fallback only)
  useEffect(() => {
    if (effectiveAudioUrl) return;
    if (!playerRef.current || typeof playerRef.current.setVolume !== "function") return;
    try {
      playerRef.current.setVolume(volume);
    } catch (e) {
      console.warn("Volume sync error:", e);
    }
  }, [volume, effectiveAudioUrl]);

  // Sync Seek states (YouTube IFrame fallback only)
  useEffect(() => {
    if (effectiveAudioUrl) return;
    if (seekToTime === null || seekToTime === undefined || !playerRef.current) return;
    try {
      playerRef.current.seekTo(seekToTime, true);
      if (isPlaying && typeof playerRef.current.playVideo === "function") {
        playerRef.current.playVideo();
      }
    } catch (e) {
      console.warn("Seek error:", e);
    }
  }, [seekToTime, isPlaying, effectiveAudioUrl]);

  // Progress polling (YouTube IFrame fallback only — <audio> uses timeupdate event)
  useEffect(() => {
    if (effectiveAudioUrl) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== "function") return;
      try {
        const current = playerRef.current.getCurrentTime() || 0;
        const total = playerRef.current.getDuration() || 0;
        if (onProgressRef.current && total > 0) {
          onProgressRef.current(current, total);
        }
      } catch (e) {
        // Silent error
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [videoId, effectiveAudioUrl]);

  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleDragStart = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
    if (isMaximized) return;
    const rect = currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      origX: rect.left,
      origY: rect.top
    };
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    
    let newX = dragRef.current.origX + dx;
    let newY = dragRef.current.origY + dy;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const playerWidth = 280;
    const playerHeight = 190;
    
    if (newX < 0) newX = 0;
    if (newX > viewportWidth - playerWidth) newX = viewportWidth - playerWidth;
    if (newY < 0) newY = 0;
    if (newY > viewportHeight - playerHeight) newY = viewportHeight - playerHeight;
    
    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const startDragMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = document.getElementById("yt-player-container");
    if (!container) return;
    handleDragStart(e.clientX, e.clientY, container);
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      handleDragMove(moveEvent.clientX, moveEvent.clientY);
    };
    
    const onMouseUp = () => {
      handleDragEnd();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startDragTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const container = document.getElementById("yt-player-container");
    if (!container) return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY, container);
    
    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      const t = moveEvent.touches[0];
      handleDragMove(t.clientX, t.clientY);
    };
    
    const onTouchEnd = () => {
      handleDragEnd();
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };

  // Reset maximization when video feed is hidden
  useEffect(() => {
    if (!showVideo) {
      setIsMaximized(false);
    }
  }, [showVideo]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: showVideo ? (isMaximized ? "0px" : (position ? "auto" : "16px")) : "0px",
        left: showVideo ? (isMaximized ? "0px" : (position ? `${position.x}px` : "auto")) : "0px",
        right: showVideo ? (isMaximized ? "0px" : (position ? "auto" : "16px")) : "auto",
        top: showVideo ? (isMaximized ? "0px" : (position ? `${position.y}px` : "auto")) : "auto",
        width: showVideo ? (isMaximized ? "100%" : "280px") : "1px",
        height: showVideo ? (isMaximized ? "100%" : "190px") : "1px",
        opacity: showVideo ? 1 : 0.001,
        transition: isDragging ? "none" : "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        borderRadius: showVideo ? (isMaximized ? "0px" : "12px") : "0px",
        overflow: "hidden",
        boxShadow: showVideo ? "0 10px 25px -5px rgba(0, 0, 0, 0.5)" : "none",
        border: showVideo ? (isMaximized ? "none" : "1px solid #27272a") : "none",
        zIndex: showVideo ? (isMaximized ? 9999 : 50) : -10,
        pointerEvents: showVideo ? "auto" : "none",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#000",
      }}
      id="yt-player-container"
    >
      {offlineAudioUrl && (
        <audio ref={audioRef} preload="auto" />
      )}

      {showVideo && (
        <div 
          onMouseDown={startDragMouse}
          onTouchStart={startDragTouch}
          className="flex items-center justify-between bg-zinc-950 px-3 py-2 border-b border-zinc-900 text-[10px] font-mono text-zinc-400 font-semibold uppercase select-none shrink-0 cursor-grab active:cursor-grabbing"
        >
          <span>Video Stream Feed {isMaximized && "(Fullscreen)"}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              className="hover:text-white transition cursor-pointer text-zinc-500 hover:bg-zinc-900 p-1 rounded flex items-center justify-center"
              style={{ pointerEvents: "auto" }}
              title={isMaximized ? "Restore size" : "Maximize / Fullscreen"}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={onCloseVideo}
              className="hover:text-white transition cursor-pointer text-zinc-500 hover:bg-zinc-900 p-1 rounded flex items-center justify-center font-extrabold text-xs"
              style={{ pointerEvents: "auto" }}
              title="Close feed"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
