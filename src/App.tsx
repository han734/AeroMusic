import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { registerPlugin } from "@capacitor/core";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import HomeDashboard from "./components/HomeDashboard";
import SearchDashboard from "./components/SearchDashboard";
import LyricsAnalyzer from "./components/LyricsAnalyzer";
import SpotifyImporter from "./components/SpotifyImporter";
import SettingsPanel from "./components/SettingsPanel";
import MusicPlayerBar from "./components/MusicPlayerBar";
import YoutubeStreamPlayer from "./components/YoutubeStreamPlayer";
import ListeningRoom from "./components/ListeningRoom";
import MyLibrary from "./components/MyLibrary";
import MiniPlayer from "./components/MiniPlayer";
import ExtendedPlayer from "./components/ExtendedPlayer";
import ArtistProfile from "./components/ArtistProfile";
import AuthPanel from "./components/AuthPanel";
import AlbumView from "./components/AlbumView";
import GlobalHeader from "./components/GlobalHeader";
import UserProfileView from "./components/UserProfileView";
import { Track, Playlist, UserProfile } from "./types";
import { aeroFetch, getWebSocketUrl, getApiBaseUrl } from "./lib/api";

// Native Android media notification plugin (no-op on web/desktop)
const MediaNotification = registerPlugin<{
  update(opts: { title: string; artist: string; album: string; artwork: string; isPlaying: boolean }): Promise<void>;
  dismiss(): Promise<void>;
  addListener(event: "mediaAction", handler: (data: { action: string }) => void): any;
}>("MediaNotification");

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  
  // Artist & Album selection state
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{ title: string; artist: string; thumbnail?: string } | null>(null);

  const handleArtistClick = useCallback((artistName: string) => {
    setSelectedArtistName(artistName);
    setActiveTab("artist");
  }, []);

  const handleAlbumClick = useCallback((albumName: string, artistName: string, thumbnail?: string) => {
    setSelectedAlbum({ title: albumName, artist: artistName, thumbnail });
    setActiveTab("album");
  }, []);
  
  // Player state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [tracksContext, setTracksContext] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(50);
  const [progress, setProgress] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [newReleases, setNewReleases] = useState<Track[]>([]);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeat, setRepeat] = useState<boolean>(false);
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  // Compact & Extended Player states
  const [activeVideoIdOverride, setActiveVideoIdOverride] = useState<string | null>(null);
  const [isMiniPlayer, setIsMiniPlayer] = useState<boolean>(false);
  const [isExtendedPlayer, setIsExtendedPlayer] = useState<boolean>(false);

  // Co-Listening Room States
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomMembers, setRoomMembers] = useState<Array<{ id: string; username: string; avatar: string }>>([]);
  const [roomMessages, setRoomMessages] = useState<Array<{ id: string; username: string; avatar: string; text: string; timestamp: string }>>([]);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [lastRemoteSync, setLastRemoteSync] = useState<{ track: Track | null; isPlaying: boolean; progressSeconds: number; timestamp: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Support complaint box states
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [supportTitle, setSupportTitle] = useState<string>("");
  const [supportDesc, setSupportDesc] = useState<string>("");
  const [isSubmittingSupport, setIsSubmittingSupport] = useState<boolean>(false);
  const [supportError, setSupportError] = useState<string>("");
  const [supportSuccess, setSupportSuccess] = useState<boolean>(false);

  const handleSubmitSupport = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportTitle.trim() || !supportDesc.trim()) {
      setSupportError("Please fill in both fields.");
      return;
    }
    setSupportError("");
    setIsSubmittingSupport(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      const token = localStorage.getItem("aero-session-token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${getApiBaseUrl() || ""}/api/support/ticket`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: supportTitle,
          description: supportDesc
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSupportSuccess(true);
        setSupportTitle("");
        setSupportDesc("");
        setTimeout(() => {
          setShowSupportModal(false);
          setSupportSuccess(false);
        }, 2000);
      } else {
        setSupportError(data.error || "Submission failed.");
      }
    } catch (err) {
      setSupportError("Connection error. Try again.");
    } finally {
      setIsSubmittingSupport(false);
    }
  }, [supportTitle, supportDesc]);

  const offlineGuestUser = useMemo(() => ({
    username: "Offline Guest",
    avatar: "📴",
    bio: "Listening in offline-resilient mode.",
    tier: "Standard",
    playlists: [],
    likedTracks: []
  }), []);
  const [selectedProfileUsername, setSelectedProfileUsername] = useState<string | null>(null);
  
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aero-theme") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    localStorage.setItem("aero-theme", theme);
  }, [theme]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setPlaylists([]);
    setLikedTracks([]);
    localStorage.removeItem("aero-session-token");
    localStorage.removeItem("aero-listening-username");
    localStorage.removeItem("aero-listening-avatar");
    localStorage.removeItem("aero-cached-profile");
    setIsOfflineMode(false);
  }, []);

  const handleLoginSuccess = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem("aero-listening-username", user.username);
    localStorage.setItem("aero-listening-avatar", user.avatar || "🎵");
    
    // Merge local playlists with server user playlists
    let mergedPlaylists = [...(user.playlists || [])];
    const localPlaylistsRaw = localStorage.getItem("premium-custom-playlists");
    if (localPlaylistsRaw) {
      try {
        const localPlaylists = JSON.parse(localPlaylistsRaw);
        if (Array.isArray(localPlaylists)) {
          localPlaylists.forEach((lp) => {
            if (lp && lp.id && !mergedPlaylists.some((p) => p.id === lp.id)) {
              mergedPlaylists.push(lp);
            }
          });
        }
      } catch (e) {
        console.warn("Failed to merge local playlists:", e);
      }
    }
    setPlaylists(mergedPlaylists);
    localStorage.setItem("premium-custom-playlists", JSON.stringify(mergedPlaylists));

    // Merge local liked tracks with server user liked tracks
    let mergedLiked = [...(user.likedTracks || [])];
    const localLikedRaw = localStorage.getItem("premium-liked-tracks");
    if (localLikedRaw) {
      try {
        const localLiked = JSON.parse(localLikedRaw);
        if (Array.isArray(localLiked)) {
          localLiked.forEach((lt) => {
            if (lt && lt.id && !mergedLiked.some((t) => t.id === lt.id)) {
              mergedLiked.push(lt);
            }
          });
        }
      } catch (e) {
        console.warn("Failed to merge local liked tracks:", e);
      }
    }
    setLikedTracks(mergedLiked);
    localStorage.setItem("premium-liked-tracks", JSON.stringify(mergedLiked));

    // Cache merged profile
    const mergedProfile = { ...user, playlists: mergedPlaylists, likedTracks: mergedLiked };
    localStorage.setItem("aero-cached-profile", JSON.stringify(mergedProfile));

    // Sync back to server
    const token = localStorage.getItem("aero-session-token");
    if (token) {
      aeroFetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          playlists: mergedPlaylists,
          likedTracks: mergedLiked
        })
      }).catch(err => console.warn("Failed to sync merged library on login success:", err));
    }
  }, []);

  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => {
    return typeof window !== "undefined" && !!localStorage.getItem("aero-session-token");
  });
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const joinParamsRef = useRef<{ roomId: string; username: string; avatar: string } | null>(null);

  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{ active: boolean; current: number; total: number; playlistName: string } | null>(null);
  const cancelDownloadRef = useRef<boolean>(false);
  // Draggable download blob state
  const [blobPos, setBlobPos] = useState<{ x: number; y: number } | null>(null);
  const blobDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Downloaded Playlists state (separate from downloadedTracks)
  const [downloadedPlaylists, setDownloadedPlaylists] = useState<Playlist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [privateSession, setPrivateSession] = useState<boolean>(() => {
    return typeof window !== "undefined" && localStorage.getItem("aero-private-session") === "true";
  });

  const socketRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const progressRef = useRef<number>(0);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const isHost = !activeRoomId || (roomMembers.length > 0 && roomMembers[0].id === myClientId);

  const isElectron = typeof window !== "undefined" && (
    window.navigator.userAgent.toLowerCase().includes("electron") ||
    !!(window as any).electronAPI
  );
  const isMobileWebView = typeof window !== "undefined" && !isElectron && (
    !!(window as any).Capacitor ||
    window.location.hostname === "aero-music.app" ||
    window.location.protocol === "file:" ||
    /Android|iPhone|iPad|iPod|webOS/i.test(window.navigator.userAgent)
  );

  const handleBroadcastPlayback = useCallback((track: Track | null, playing: boolean, progressSec: number) => {
    if (socketRef.current && socketRef.current.readyState === 1 && activeRoomId) { // WebSocket.OPEN is 1
      socketRef.current.send(JSON.stringify({
        type: "playback_change",
        track,
        isPlaying: playing,
        progressSeconds: progressSec,
        token: localStorage.getItem("aero-session-token") || undefined
      }));
    }
  }, [activeRoomId]);

  const handleJoinRoom = (roomId: string, username: string, avatar: string) => {
    // Clear any previous error
    setRoomError(null);
    setIsConnecting(true);
    
    // Store join params for potential reconnection
    joinParamsRef.current = { roomId, username, avatar };
    reconnectAttemptsRef.current = 0;
    
    if (socketRef.current) {
      socketRef.current.close();
    }

    const socketUrl = getWebSocketUrl();
    
    // Validate the WebSocket URL before attempting connection
    if (!socketUrl || socketUrl === "ws://" || socketUrl === "wss://") {
      setRoomError("Cannot connect: Backend server URL is not configured. Go to Settings and enter your server address.");
      setIsConnecting(false);
      return;
    }
    
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    // Set a connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === 0) { // WebSocket.CONNECTING
        ws.close();
        setRoomError("Connection timed out. Make sure the server is running and the address is correct.");
        setIsConnecting(false);
      }
    }, 10000);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);
      setActiveRoomId(roomId);
      ws.send(JSON.stringify({
        type: "join",
        roomId,
        username,
        avatar,
        token: localStorage.getItem("aero-session-token") || undefined
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "room_state": {
            const { members, chatHistory, currentTrack: rTrack, isPlaying: rPlaying, progressSeconds: rProg, lastUpdated, yourId } = data;
            setRoomMembers(members);
            setRoomMessages(chatHistory || []);
            setMyClientId(yourId);
            
            if (rTrack) {
              const latency = (Date.now() - lastUpdated) / 1000;
              const targetSeek = Math.max(0, rProg + (rPlaying ? latency : 0));
              
              isRemoteUpdateRef.current = true;
              setCurrentTrack(rTrack);
              setIsPlaying(rPlaying);
              setSeekToTime(targetSeek);
              setProgress(targetSeek);
              progressRef.current = targetSeek;
              
              setLastRemoteSync({
                track: rTrack,
                isPlaying: rPlaying,
                progressSeconds: rProg,
                timestamp: lastUpdated
              });
            }
            break;
          }
          case "user_joined": {
            setRoomMembers(data.members);
            break;
          }
          case "user_left": {
            setRoomMembers(data.members);
            break;
          }
          case "chat_message": {
            setRoomMessages((prev) => [...prev, data.message]);
            break;
          }
          case "playback_sync": {
            const { track, isPlaying: rPlaying, progressSeconds: rProg, lastUpdated } = data;
            const latency = (Date.now() - lastUpdated) / 1000;
            const targetSeek = Math.max(0, rProg + (rPlaying ? latency : 0));
            
            isRemoteUpdateRef.current = true;
            setCurrentTrack(track);
            setIsPlaying(rPlaying);
            setSeekToTime(targetSeek);
            setProgress(targetSeek);
            progressRef.current = targetSeek;
            
            setLastRemoteSync({
              track: track || null,
              isPlaying: rPlaying,
              progressSeconds: rProg,
              timestamp: lastUpdated
            });
            break;
          }
        }
      } catch (err) {
        console.error("Error decoding WS message:", err);
      }
    };

    ws.onclose = () => {
      clearTimeout(connectionTimeout);
      
      // If we were in a room and the connection drops unexpectedly, attempt reconnection
      if (activeRoomId && joinParamsRef.current && reconnectAttemptsRef.current < 3) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
        reconnectAttemptsRef.current++;
        console.log(`WebSocket disconnected. Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/3)...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (joinParamsRef.current) {
            handleJoinRoom(
              joinParamsRef.current.roomId,
              joinParamsRef.current.username,
              joinParamsRef.current.avatar
            );
          }
        }, delay);
        return; // Don't reset state yet, we're reconnecting
      }
      
      // Full cleanup if not reconnecting
      setActiveRoomId(null);
      setRoomMembers([]);
      setRoomMessages([]);
      setLastRemoteSync(null);
      setIsConnecting(false);
      setMyClientId(null);
      joinParamsRef.current = null;
    };

    ws.onerror = () => {
      clearTimeout(connectionTimeout);
      // In standalone APK builds, provide more helpful guidance
      if (isMobileWebView) {
        setRoomError("Cannot connect to server. Go to Settings and configure your server endpoint.");
      } else {
        setRoomError("Failed to connect to the server. Check that the server is running and the address is correct.");
      }
      setIsConnecting(false);
    };
  };

  const handleLeaveRoom = () => {
    // Cancel any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    joinParamsRef.current = null;
    
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setActiveRoomId(null);
    setRoomMembers([]);
    setRoomMessages([]);
    setLastRemoteSync(null);
    setMyClientId(null);
    setRoomError(null);
  };

  const handleSendMessage = (text: string) => {
    if (socketRef.current && socketRef.current.readyState === 1) { // WebSocket.OPEN is 1
      const avatar = localStorage.getItem("aero-listening-avatar") || "🎵";
      socketRef.current.send(JSON.stringify({
        type: "chat",
        text,
        avatar
      }));
    }
  };

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // User Library states (liked tracks stored in localStorage)
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);

  // Load liked songs and downloaded songs on mount
  useEffect(() => {
    // Clear old resolved YouTube video caches to force re-resolution with duration filter
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("resolved-yt-")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      console.log(`Cleared ${keysToRemove.length} resolved cache keys.`);
    } catch (e) {
      console.warn("Failed to clear old resolved cache keys:", e);
    }

    try {
      const stored = localStorage.getItem("premium-liked-tracks");
      if (stored) {
        setLikedTracks(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not load liked songs from local storage:", e);
    }

    try {
      const storedDl = localStorage.getItem("premium-downloaded-tracks");
      if (storedDl) {
        setDownloadedTracks(JSON.parse(storedDl));
      }
    } catch (e) {
      console.warn("Could not load downloaded songs from local storage:", e);
    }

    try {
      const storedPl = localStorage.getItem("premium-custom-playlists");
      if (storedPl) {
        const parsed = JSON.parse(storedPl);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((p: any) => p.id !== "pl-default-rock" && p.id !== "pl-default-lofi");
          setPlaylists(filtered);
          if (filtered.length !== parsed.length) {
            localStorage.setItem("premium-custom-playlists", JSON.stringify(filtered));
          }
        } else {
          setPlaylists([]);
        }
      }
    } catch (e) {
      console.warn("Could not load custom playlists from local storage:", e);
    }

    // Load downloaded playlists from localStorage
    try {
      const storedDlPl = localStorage.getItem("premium-downloaded-playlists");
      if (storedDlPl) {
        setDownloadedPlaylists(JSON.parse(storedDlPl));
      }
    } catch (e) {
      console.warn("Could not load downloaded playlists from local storage:", e);
    }

    // Apply previously saved Developer Tools state on startup
    const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;
    if (isElectron) {
      const show = localStorage.getItem("aero-show-devtools") === "true";
      (window as any).electronAPI.toggleDevTools(show);
    }
  }, []);

  // Sync liked tracks to local storage
  const handleToggleLike = (track: Track) => {
    let updated;
    const exists = likedTracks.some((t) => t.id === track.id);
    if (exists) {
      updated = likedTracks.filter((t) => t.id !== track.id);
    } else {
      updated = [...likedTracks, track];
    }
    setLikedTracks(updated);
    try {
      localStorage.setItem("premium-liked-tracks", JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save liked songs to local storage:", e);
    }

    // Sync liked songs to server
    const token = localStorage.getItem("aero-session-token");
    if (token && currentUser) {
      aeroFetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ likedTracks: updated })
      }).catch(err => console.warn("Failed to sync liked songs to server:", err));
    }

    // If currently playing Liked Songs playlist, update current context
    if (selectedPlaylist && selectedPlaylist.id === "liked-songs") {
      setTracksContext(updated);
    }
  };

  // Handle song downloads and client-side offline listing
  // Handle song downloads and client-side offline listing
  const handleDownloadTrack = async (track: Track) => {
    // Check if already downloaded
    if (downloadedTracks.some((t) => t.id === track.id)) {
      alert(`"${track.title}" is already stored in your offline downloads list!`);
      return;
    }

    // Call resolve on the server to record the download metadata and check embeddability
    let resolvedId = track.id;
    if (track.id.startsWith("itunes-")) {
      try {
        const res = await aeroFetch(`/api/resolve?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
        const data = await res.json();
        if (data.success && data.videoId) {
          resolvedId = data.videoId;
        } else if (data.error) {
          alert(`Could not download: ${data.error}`);
          return;
        }
      } catch (err) {
        console.error("Error resolving track for download:", err);
      }
    } else {
      // If it's already a YouTube ID, we can trigger a resolve to save it in server metadata
      try {
        await aeroFetch(`/api/resolve?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
      } catch (err) {
        console.error("Error recording download metadata:", err);
      }
    }

    try {
      const response = await aeroFetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: { ...track, id: resolvedId } })
      });
      const data = await response.json();

      const trackToDownload = {
        ...track,
        id: resolvedId,
        offlineReady: Boolean(data.success),
        offlineFile: data.offlineFile || undefined,
      };
      const updated = [...downloadedTracks.filter(t => t.id !== resolvedId), trackToDownload];
      setDownloadedTracks(updated);
      try {
        localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not save downloaded songs to local storage:", e);
      }

      if (selectedPlaylist && selectedPlaylist.id === "downloaded-songs") {
        setTracksContext(updated);
      }

      if (!data.success) {
        alert(data.error || "The offline cache could not be created for this track.");
      }
    } catch (err) {
      console.error("Error downloading track for offline playback:", err);
      alert("The offline cache could not be created for this track right now.");
    }
  };

  const handleDeleteDownloadedTrack = async (track: Track) => {
    const choice = confirm(
      `Do you want to delete the file for "${track.title}" from your local system (Downloads folder), or only from the list?\n\nClick "OK" to delete from BOTH the local system & list.\nClick "Cancel" to remove from the list ONLY.`
    );
    
    // We will delete from list in both cases.
    // If choice is true, we send deleteFile=true to the server.
    const deleteFile = choice ? "true" : "false";

    try {
      const response = await aeroFetch(`/api/downloaded/${track.id}?deleteFile=${deleteFile}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        // Success, now update client state
        const updated = downloadedTracks.filter((t) => t.id !== track.id);
        setDownloadedTracks(updated);
        localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
        
        // If currently viewing downloaded playlist, sync context
        if (selectedPlaylist && selectedPlaylist.id === "downloaded-songs") {
          setTracksContext(updated);
        }
      } else {
        alert("Failed to delete track from server database.");
      }
    } catch (err) {
      console.error("Error deleting downloaded track:", err);
      // Fallback: delete client-side anyway
      const updated = downloadedTracks.filter((t) => t.id !== track.id);
      setDownloadedTracks(updated);
      localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
      if (selectedPlaylist && selectedPlaylist.id === "downloaded-songs") {
        setTracksContext(updated);
      }
    }
  };

  // Download tracks as a playlist (separate from individual downloaded tracks)
  const handleDownloadTracksBulk = async (tracksToDl: Track[], sourceName: string) => {
    if (tracksToDl.length === 0) {
      alert("No tracks to download!");
      return;
    }

    cancelDownloadRef.current = false;
    setBulkDownloadProgress({ active: true, current: 0, total: tracksToDl.length, playlistName: sourceName });

    const downloadedTracksList: Track[] = [];
    let savedCount = 0;

    for (let i = 0; i < tracksToDl.length; i++) {
      // Check if user cancelled
      if (cancelDownloadRef.current) break;

      const track = tracksToDl[i];
      setBulkDownloadProgress(prev => prev ? { ...prev, current: i + 1 } : null);

      let resolvedId = track.id;
      if (track.id.startsWith("itunes-") || track.id.startsWith("saavn-") || track.id.startsWith("deezer-")) {
        try {
          const res = await fetch(`${getApiBaseUrl() || ""}/api/resolve?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
          const data = await res.json();
          if (data.success && data.videoId) resolvedId = data.videoId;
        } catch (err) {
          console.error(`Bulk download resolve error for "${track.title}":`, err);
        }
      }

      try {
        const response = await aeroFetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: { ...track, id: resolvedId } })
        });
        const data = await response.json();

        const trackToDownload = {
          ...track,
          id: resolvedId,
          offlineReady: Boolean(data.success),
          offlineFile: data.offlineFile || undefined,
        };
        downloadedTracksList.push(trackToDownload);
        if (data.success) savedCount++;
      } catch (err) {
        console.error(`Bulk download failed for "${track.title}":`, err);
      }
    }

    // Create a new downloaded playlist with the tracks
    if (savedCount > 0 && !cancelDownloadRef.current) {
      const newPlaylist: Playlist = {
        id: "dl-pl-" + Date.now(),
        name: sourceName,
        description: "Downloaded playlist for offline listening",
        tracks: downloadedTracksList,
        coverUrl: "https://images.unsplash.com/photo-1493225451194-26733c5679ab?w=400&h=400&fit=crop"
      };

      setDownloadedPlaylists(prev => {
        const next = [newPlaylist, ...prev];
        try {
          localStorage.setItem("premium-downloaded-playlists", JSON.stringify(next));
        } catch (e) {
          console.warn("Could not save downloaded playlists to local storage:", e);
        }
        return next;
      });
    }

    setBulkDownloadProgress(null);
    setBlobPos(null);
    if (!cancelDownloadRef.current) {
      alert(`Saved ${savedCount} tracks from "${sourceName}" to your offline library!`);
    }
  };

  const handleDeleteDownloadedTracksBulk = async (tracksToDelete: Track[]) => {
    if (tracksToDelete.length === 0) return;
    
    const confirmMessage = 
      `Do you want to delete the local files for the ${tracksToDelete.length} selected songs from your Downloads folder, or only from the list?\n\nClick "OK" to delete from BOTH the local folder & list.\nClick "Cancel" to remove from the list ONLY.`;
      
    const deleteFile = confirm(confirmMessage);
    const ids = tracksToDelete.map(t => t.id);
    
    try {
      const response = await aeroFetch(`/api/downloaded/bulk-delete?deleteFile=${deleteFile}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      
      const data = await response.json();
      if (data.success) {
        const updated = downloadedTracks.filter((t) => !ids.includes(t.id));
        setDownloadedTracks(updated);
        localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
        
        if (selectedPlaylist && selectedPlaylist.id === "downloaded-songs") {
          setTracksContext(updated);
        }
        alert(`Successfully deleted ${tracksToDelete.length} offline tracks!`);
      } else {
        console.error("Bulk delete failed on server:", data.error);
        const updated = downloadedTracks.filter((t) => !ids.includes(t.id));
        setDownloadedTracks(updated);
        localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Error bulk deleting downloaded tracks:", err);
      const updated = downloadedTracks.filter((t) => !ids.includes(t.id));
      setDownloadedTracks(updated);
      localStorage.setItem("premium-downloaded-tracks", JSON.stringify(updated));
    }
  };

  // Load standard songs & live releases on mount, with auto-retry for Render spin-up tolerance
  useEffect(() => {
    let active = true;

    const fetchCatalog = async () => {
      try {
        const response = await aeroFetch("/api/catalog");
        const data = await response.json();
        if (data.success && active) {
          setCatalog(data.tracks || []);
          setTracksContext(data.tracks || []);
        }
      } catch (e) {
        console.error("Failed to load catalog:", e);
      }
    };

    const fetchNewReleases = async () => {
      try {
        const response = await aeroFetch("/api/new-releases");
        const data = await response.json();
        if (data.success && active) {
          setNewReleases(data.tracks || []);
        }
      } catch (e) {
        console.error("Failed to load new releases:", e);
      }
    };

    const fetchDownloaded = async () => {
      try {
        const response = await aeroFetch("/api/downloaded");
        const data = await response.json();
        if (data.success && data.tracks && active) {
          setDownloadedTracks((prev) => {
            const merged = [...prev];
            data.tracks.forEach((srvTrack: any) => {
              if (!merged.some((t) => t.id === srvTrack.id)) {
                merged.push(srvTrack);
              }
            });
            localStorage.setItem("premium-downloaded-tracks", JSON.stringify(merged));
            return merged;
          });
        }
      } catch (e) {
        console.error("Failed to load downloaded tracks from server:", e);
      }
    };

    fetchCatalog();
    fetchNewReleases();
    fetchDownloaded();

    const interval = setInterval(() => {
      if (catalog.length === 0) {
        fetchCatalog();
      }
      if (newReleases.length === 0) {
        fetchNewReleases();
      }
    }, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [catalog.length, newReleases.length]);

  // Restore authenticated session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("aero-session-token");
      if (!token) {
        setIsRestoringSession(false);
        return;
      }
      try {
        const res = await aeroFetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.user) {
          setCurrentUser(data.user);
          localStorage.setItem("aero-listening-username", data.user.username);
          localStorage.setItem("aero-listening-avatar", data.user.avatar);
          localStorage.setItem("aero-cached-profile", JSON.stringify(data.user));
          if (data.user.playlists) {
            setPlaylists(data.user.playlists);
            localStorage.setItem("premium-custom-playlists", JSON.stringify(data.user.playlists));
          }
          if (data.user.likedTracks) {
            setLikedTracks(data.user.likedTracks);
            localStorage.setItem("premium-liked-tracks", JSON.stringify(data.user.likedTracks));
          }
        } else {
          // Only remove session token if explicitly unauthorized or forbidden by server
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("aero-session-token");
          } else {
            // Otherwise, treat as a temporary server issue and load cached session
            throw new Error(`Temporary server error (${res.status})`);
          }
        }
      } catch (err) {
        console.error("Session restoration failed, loading cached profile for offline resilience:", err);
        const cached = localStorage.getItem("aero-cached-profile");
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setCurrentUser(parsed);
            if (parsed.playlists) setPlaylists(parsed.playlists);
            if (parsed.likedTracks) setLikedTracks(parsed.likedTracks);
            setIsOfflineMode(true);
          } catch {
            // Keep currentUser as null if cache is corrupted
          }
        }
      } finally {
        setIsRestoringSession(false);
      }
    };
    restoreSession();
  }, []);

  // Initialize Android background audio playback service (if running in Capacitor Cordova mode)
  useEffect(() => {
    // Background mode is now handled entirely by the native MediaNotificationService.
    // No Cordova plugin init needed here.
  }, []);



  // Reset video override when track changes
  useEffect(() => {
    setActiveVideoIdOverride(null);
    setShowVideo(false);
  }, [currentTrack]);

  const isTrackMatch = useCallback((a: Track, b: Track | null) => {
    if (!b) return false;
    return a.id === b.id || (
      a.title === b.title &&
      a.artist === b.artist &&
      a.album === b.album
    );
  }, []);

  const getTrackIndex = useCallback((context: Track[], track: Track | null) => {
    if (!track) return -1;
    const exact = context.findIndex((t) => t.id === track.id);
    if (exact !== -1) return exact;
    return context.findIndex((t) => isTrackMatch(t, track));
  }, [isTrackMatch]);

  const handleTrackSelect = useCallback(async (track: Track, context: Track[]) => {
    let resolvedTrack = { ...track };

    if (
      track.id.startsWith("itunes-") ||
      track.id.startsWith("spotify-") ||
      track.id.startsWith("dyn-") ||
      track.id.startsWith("pending-") ||
      track.id.startsWith("saavn-") ||
      track.id.startsWith("deezer-")
    ) {
      try {
        const cacheKey = `resolved-yt-${track.id}`;
        const cachedId = localStorage.getItem(cacheKey);
        if (cachedId) {
          resolvedTrack.id = cachedId;
        } else {
          const res = await aeroFetch(`/api/resolve?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
          const data = await res.json();
          if (data.success && data.videoId) {
            resolvedTrack.id = data.videoId;
            localStorage.setItem(cacheKey, data.videoId);
          }
        }
      } catch (err) {
        console.error("Error resolving track stream:", err);
      }
    }

    const offlineMatch = downloadedTracks.find((t) => t.id === resolvedTrack.id || (t.title === resolvedTrack.title && t.artist === resolvedTrack.artist && t.album === resolvedTrack.album));
    if (offlineMatch?.offlineReady) {
      resolvedTrack = { ...resolvedTrack, offlineReady: true, offlineFile: offlineMatch.offlineFile };
    }

    const normalizedContext = context.map((t) =>
      isTrackMatch(t, resolvedTrack) ? resolvedTrack : t
    );

    setCurrentTrack(resolvedTrack);
    setTracksContext(normalizedContext);
    setIsPlaying(true);
    setProgress(0);
    progressRef.current = 0;
    setDuration(0);
    setSeekToTime(null);

    if (activeRoomId && isHost && !isRemoteUpdateRef.current) {
      handleBroadcastPlayback(resolvedTrack, true, 0);
    }
    isRemoteUpdateRef.current = false;
  }, [activeRoomId, handleBroadcastPlayback, isTrackMatch, isHost]);

  const handlePlayPauseToggle = useCallback(() => {
    if (!currentTrack && catalog.length > 0) {
      // Auto-play first track in catalog
      handleTrackSelect(catalog[0], catalog);
      return;
    }
    setIsPlaying((prev) => {
      const nextPlaying = !prev;
      if (activeRoomId && isHost && !isRemoteUpdateRef.current) {
        handleBroadcastPlayback(currentTrack, nextPlaying, progressRef.current);
      }
      isRemoteUpdateRef.current = false;
      return nextPlaying;
    });
  }, [currentTrack, catalog, handleTrackSelect, activeRoomId, handleBroadcastPlayback, isHost]);

  const handleNext = useCallback(() => {
    if (tracksContext.length === 0) return;

    if (activeRoomId && !isHost) {
      // Listeners do not advance on end-of-track events; they wait for host's transition
      return;
    }

    if (repeat) {
      // Seek back to zero and keep playing
      setSeekToTime(0);
      setProgress(0);
      progressRef.current = 0;
      setIsPlaying(true);
      return;
    }

    let nextIdx = 0;
    if (shuffle) {
      const currentIdx = getTrackIndex(tracksContext, currentTrack);
      if (tracksContext.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * tracksContext.length);
        } while (nextIdx === currentIdx);
      }
    } else {
      const currentIdx = getTrackIndex(tracksContext, currentTrack);
      if (currentIdx !== -1 && currentIdx < tracksContext.length - 1) {
        nextIdx = currentIdx + 1;
      }
    }

    const nextTrack = tracksContext[nextIdx];
    if (nextTrack) {
      handleTrackSelect(nextTrack, tracksContext);
    }
  }, [tracksContext, currentTrack, shuffle, repeat, handleTrackSelect, getTrackIndex, activeRoomId, isHost]);

  const handlePrevious = useCallback(() => {
    if (tracksContext.length === 0) return;
    if (activeRoomId && !isHost) return;

    const currentIdx = getTrackIndex(tracksContext, currentTrack);
    let prevIdx = tracksContext.length - 1;

    if (currentIdx > 0) {
      prevIdx = currentIdx - 1;
    }

    const prevTrack = tracksContext[prevIdx];
    if (prevTrack) {
      handleTrackSelect(prevTrack, tracksContext);
    }
  }, [tracksContext, currentTrack, handleTrackSelect, getTrackIndex, activeRoomId, isHost]);

  const handleProgress = useCallback((current: number, total: number) => {
    setProgress(current);
    progressRef.current = current;
    setDuration(total);
    setSeekToTime(null); // Reset seek trigger once applied

    // Sync position state with the OS Media Session
    if (typeof window !== "undefined" && "mediaSession" in navigator && navigator.mediaSession.setPositionState && total > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: total,
          playbackRate: 1.0,
          position: Math.min(Math.max(0, current), total)
        });
      } catch (err) {
        console.warn("Failed to set MediaSession position state:", err);
      }
    }
  }, []);

  const handleSeek = (seconds: number) => {
    setSeekToTime(seconds);
    setProgress(seconds);
    progressRef.current = seconds;

    if (activeRoomId && isHost && !isRemoteUpdateRef.current) {
      handleBroadcastPlayback(currentTrack, isPlaying, seconds);
    }
    isRemoteUpdateRef.current = false;

    // Sync position state immediately with OS Media Session on user seek
    if (typeof window !== "undefined" && "mediaSession" in navigator && navigator.mediaSession.setPositionState && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1.0,
          position: Math.min(Math.max(0, seconds), duration)
        });
      } catch (err) {
        console.warn("Failed to set MediaSession position state on seek:", err);
      }
    }
  };

  // Update HTML5 Media Session in sync for desktop / PWA fallback
  useEffect(() => {
    if (!currentTrack) {
      MediaNotification.dismiss().catch(() => {});
      return;
    }

    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        if (typeof MediaMetadata !== "undefined") {
          navigator.mediaSession.metadata = new MediaMetadata({
            title:  currentTrack.title,
            artist: currentTrack.artist,
            album:  currentTrack.album || "AeroMusic Premium",
            artwork: [
              { src: currentTrack.thumbnail, sizes: "512x512", type: "image/png" },
            ],
          });
        }
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      } catch (_) {}
    }
  }, [isPlaying, currentTrack]);

  // Register native notification button callbacks + HTML5 Media Session handlers.
  // IMPORTANT: the listener is registered ONCE (empty deps) to avoid thrashing.
  // All actual handlers are stored in a ref so they always see the latest state.
  const mediaActionHandlerRef = useRef<((data: { action: string }) => void) | null>(null);

  useEffect(() => {
    mediaActionHandlerRef.current = (data) => {
      if (data.action === "play")  { setIsPlaying(true);  if (activeRoomId && isHost) handleBroadcastPlayback(currentTrack, true,  progressRef.current); }
      if (data.action === "pause") { setIsPlaying(false); if (activeRoomId && isHost) handleBroadcastPlayback(currentTrack, false, progressRef.current); }
      if (data.action === "next")  handleNext();
      if (data.action === "prev")  handlePrevious();
    };
  }, [handlePrevious, handleNext, currentTrack, activeRoomId, isHost, handleBroadcastPlayback]);

  useEffect(() => {
    // Register the native listener ONCE — delegate to the ref for the actual logic
    const sub = MediaNotification.addListener("mediaAction", (data) => {
      mediaActionHandlerRef.current?.(data);
    });

    // HTML5 Media Session action handlers (desktop / PWA fallback)
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("play",          () => mediaActionHandlerRef.current?.({ action: "play" }));
        navigator.mediaSession.setActionHandler("pause",         () => mediaActionHandlerRef.current?.({ action: "pause" }));
        navigator.mediaSession.setActionHandler("previoustrack", () => mediaActionHandlerRef.current?.({ action: "prev" }));
        navigator.mediaSession.setActionHandler("nexttrack",     () => mediaActionHandlerRef.current?.({ action: "next" }));
        navigator.mediaSession.setActionHandler("seekto",        (d) => { if (d.seekTime !== undefined) handleSeek(d.seekTime); });
      } catch (_) {}
    }

    return () => {
      try { sub?.remove?.(); } catch (_) {}
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play",          null);
          navigator.mediaSession.setActionHandler("pause",         null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("nexttrack",     null);
          navigator.mediaSession.setActionHandler("seekto",        null);
        } catch (_) {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Register once only — handler logic lives in the ref above

  const handleClearQueue = useCallback(() => {
    if (currentTrack) {
      setTracksContext([currentTrack]);
    } else {
      setTracksContext([]);
    }
  }, [currentTrack]);

  const getFadedVolume = useCallback(() => {
    if (activeRoomId) return volume;

    const crossfadeSec = parseInt(localStorage.getItem("setting-crossfade") || "4", 10);
    if (crossfadeSec <= 0) return volume;

    if (duration > 0) {
      const remaining = duration - progress;
      // Fade out in the last crossfadeSec seconds
      if (remaining > 0 && remaining <= crossfadeSec) {
        const scale = remaining / crossfadeSec;
        return Math.round(volume * scale);
      }
      
      // Fade in during the first crossfadeSec seconds
      if (progress >= 0 && progress < crossfadeSec) {
        const scale = progress / crossfadeSec;
        return Math.round(volume * scale);
      }
    }

    return volume;
  }, [volume, progress, duration, activeRoomId]);

  const handleAddPlaylist = (newPl: Playlist) => {
    setPlaylists((prev) => {
      const next = [newPl, ...prev];
      try {
        localStorage.setItem("premium-custom-playlists", JSON.stringify(next));
      } catch (e) {
        console.warn("Could not save playlists to local storage:", e);
      }

      // Sync playlists to server
      const token = localStorage.getItem("aero-session-token");
      if (token && currentUser) {
        aeroFetch("/api/auth/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ playlists: next })
        }).catch(err => console.warn("Failed to sync playlists to server:", err));
      }

      return next;
    });
  };

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== playlistId);
      try {
        localStorage.setItem("premium-custom-playlists", JSON.stringify(next));
      } catch (e) {
        console.warn("Could not save playlists to local storage:", e);
      }

      // Sync playlists to server
      const token = localStorage.getItem("aero-session-token");
      if (token && currentUser) {
        aeroFetch("/api/auth/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ playlists: next })
        }).catch(err => console.warn("Failed to sync playlists to server:", err));
      }

      return next;
    });
    if (selectedPlaylist && selectedPlaylist.id === playlistId) {
      setSelectedPlaylist(null);
    }
  };

  const handleSelectPlaylist = (pl: Playlist) => {
    setSelectedPlaylist(pl);
  };

  if (isRestoringSession) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white select-none">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-400 text-xs font-mono tracking-widest uppercase">Restoring Premium Session...</p>
      </div>
    );
  }

  if (!currentUser && !isOfflineMode) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center p-4 select-none relative overflow-hidden text-white font-sans">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full filter blur-[100px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-600/10 rounded-full filter blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: "2s" }} />
        
        <div className="w-full max-w-md relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/20 mb-3 animate-bounce">
              <span className="text-2xl">⚡</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">AeroMusic Premium</h1>
            <p className="text-zinc-500 text-xs mt-1">Please sign in to unlock catalog and streaming features</p>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 backdrop-blur-md shadow-2xl">
            <AuthPanel 
              currentUser={null}
              onLoginSuccess={handleLoginSuccess}
              onLogout={handleLogout}
              onContinueOffline={() => {
                const cached = localStorage.getItem("aero-cached-profile");
                if (cached) {
                  try {
                    const parsed = JSON.parse(cached);
                    setCurrentUser(parsed);
                    if (parsed.playlists) setPlaylists(parsed.playlists);
                    if (parsed.likedTracks) setLikedTracks(parsed.likedTracks);
                  } catch (e) {
                    setCurrentUser(offlineGuestUser);
                  }
                } else {
                  setCurrentUser(offlineGuestUser);
                }
                setIsOfflineMode(true);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden text-white font-sans selection:bg-violet-500/30 animate-fade-in">
      
      {/* Full Body Dashboard (Sidebar + Active tab) */}
      <div className={`flex-1 flex min-h-0 overflow-hidden p-2 pb-0 gap-2 transition-all duration-500 ${
        isMiniPlayer ? "opacity-15 blur-lg pointer-events-none scale-[0.98]" : ""
      }`}>
        
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          playlists={playlists}
          onSelectPlaylist={handleSelectPlaylist}
          selectedPlaylistId={selectedPlaylist ? selectedPlaylist.id : null}
          likedCount={likedTracks.length}
          downloadedCount={downloadedTracks.length}
        />

        {/* Dynamic Display Panel */}
        <main className="flex-1 bg-[#121212] border border-zinc-900/60 rounded-2xl overflow-hidden flex flex-col relative">
          
          <GlobalHeader
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            currentUser={currentUser}
            onLogout={handleLogout}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            privateSession={privateSession}
            setPrivateSession={setPrivateSession}
            onUserProfileClick={(username) => {
              setSelectedProfileUsername(username);
              setActiveTab("user-profile");
            }}
            onSupportClick={() => setShowSupportModal(true)}
          />

          
          {isMobileWebView && !getApiBaseUrl() && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-2 text-[11px] text-amber-400 flex items-center justify-between gap-2 shrink-0 z-50">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs shrink-0">⚠️</span>
                <span className="truncate">
                  <strong>Server not configured.</strong> Set your PC's IP in <strong>Settings</strong> to stream.
                </span>
              </div>
              <button 
                onClick={() => setActiveTab("settings")}
                className="bg-amber-500 text-black font-extrabold px-2.5 py-1 rounded-md text-[10px] hover:bg-amber-400 transition cursor-pointer shrink-0"
              >
                SETUP
              </button>
            </div>
          )}

          {/* Tabs switchboard */}
          {activeTab === "home" && (
            <HomeDashboard
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onTrackSelect={handleTrackSelect}
              onPlayPauseToggle={handlePlayPauseToggle}
              catalog={catalog}
              selectedPlaylist={selectedPlaylist}
              likedTracks={likedTracks}
              onToggleLike={handleToggleLike}
              onSelectPlaylist={handleSelectPlaylist}
              setActiveTab={setActiveTab}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onDeleteDownloadedTrack={handleDeleteDownloadedTrack}
              onDownloadTracksBulk={handleDownloadTracksBulk}
              playlists={playlists}
              newReleases={newReleases}
              onArtistClick={handleArtistClick}
              onAlbumClick={handleAlbumClick}
              currentUser={null}
              onLogout={() => {}}
            />
          )}

          {activeTab === "search" && (
            <SearchDashboard
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onTrackSelect={handleTrackSelect}
              onPlayPauseToggle={handlePlayPauseToggle}
              likedTracks={likedTracks}
              onToggleLike={handleToggleLike}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onArtistClick={handleArtistClick}
              onAlbumClick={handleAlbumClick}
              onUserProfileClick={(username) => {
                setSelectedProfileUsername(username);
                setActiveTab("user-profile");
              }}
              globalSearchQuery={searchQuery}
              setGlobalSearchQuery={setSearchQuery}
            />
          )}


          {activeTab === "lyrics" && (
            <LyricsAnalyzer 
              currentTrack={currentTrack} 
              currentTime={progress}
              duration={duration}
              onSeek={handleSeek}
            />
          )}

          {activeTab === "spotify-import" && (
            <SpotifyImporter
              onAddPlaylist={handleAddPlaylist}
              onTrackSelect={handleTrackSelect}
              likedTracks={likedTracks}
              onToggleLike={handleToggleLike}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onArtistClick={handleArtistClick}
              onAlbumClick={handleAlbumClick}
              currentTrack={currentTrack}
            />
          )}

          {activeTab === "library" && (
            <MyLibrary
              likedTracks={likedTracks}
              playlists={playlists}
              downloadedPlaylists={downloadedPlaylists}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onTrackSelect={handleTrackSelect}
              onPlayPauseToggle={handlePlayPauseToggle}
              onToggleLike={handleToggleLike}
              onSelectPlaylist={handleSelectPlaylist}
              setActiveTab={setActiveTab}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onDownloadTracksBulk={handleDownloadTracksBulk}
              onAddPlaylist={handleAddPlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onArtistClick={handleArtistClick}
              onDeleteDownloadedTrack={handleDeleteDownloadedTrack}
              onDeleteDownloadedTracksBulk={handleDeleteDownloadedTracksBulk}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              currentUser={currentUser}
              onLoginSuccess={handleLoginSuccess}
              onLogout={handleLogout}
              theme={theme}
              onThemeChange={setTheme}
            />
          )}

          {activeTab === "user-profile" && selectedProfileUsername && (
            <UserProfileView
              username={selectedProfileUsername}
              currentUser={currentUser}
              onLoginSuccess={handleLoginSuccess}
              onTrackSelect={handleTrackSelect}
              onSelectPlaylist={handleSelectPlaylist}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === "listening-room" && (
            <ListeningRoom
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              progress={progress}
              catalog={catalog}
              onTrackSelect={handleTrackSelect}
              onPlayPauseToggle={handlePlayPauseToggle}
              onSeek={handleSeek}
              activeRoomId={activeRoomId}
              roomMembers={roomMembers}
              roomMessages={roomMessages}
              isConnecting={isConnecting}
              isHost={isHost}
              onJoinRoom={handleJoinRoom}
              onLeaveRoom={handleLeaveRoom}
              onSendMessage={handleSendMessage}
              onBroadcastPlayback={handleBroadcastPlayback}
              lastRemoteSync={lastRemoteSync}
              roomError={roomError}
            />
          )}

          {activeTab === "artist" && selectedArtistName && (
            <ArtistProfile
              artistName={selectedArtistName}
              onTrackSelect={handleTrackSelect}
              likedTracks={likedTracks}
              onToggleLike={handleToggleLike}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onAlbumClick={handleAlbumClick}
            />
          )}

          {activeTab === "album" && selectedAlbum && (
            <AlbumView
              albumName={selectedAlbum.title}
              artistName={selectedAlbum.artist}
              thumbnail={selectedAlbum.thumbnail}
              onTrackSelect={handleTrackSelect}
              likedTracks={likedTracks}
              onToggleLike={handleToggleLike}
              downloadedTracks={downloadedTracks}
              onDownloadTrack={handleDownloadTrack}
              onDownloadTracksBulk={handleDownloadTracksBulk}
              onArtistClick={handleArtistClick}
              onAlbumClick={handleAlbumClick}
            />
          )}

          {/* Persistent YouTube Streaming Player */}
          {currentTrack && (
            <YoutubeStreamPlayer
              videoId={activeVideoIdOverride || currentTrack.id}
              isPlaying={isPlaying}
              volume={getFadedVolume()}
              seekToTime={seekToTime}
              onProgress={handleProgress}
              onSongFinished={handleNext}
              showVideo={showVideo}
              onCloseVideo={() => setShowVideo(false)}
              offlineAudioUrl={currentTrack.offlineFile || null}
              trackTitle={currentTrack.title}
              trackArtist={currentTrack.artist}
              trackArtwork={currentTrack.thumbnail || ""}
            />
          )}
        </main>
      </div>

      {/* Mobile navigation dock (visible only on small screens) */}
      {!isMiniPlayer && (
        <MobileNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedPlaylistId={selectedPlaylist ? selectedPlaylist.id : null}
          onClearPlaylist={() => setSelectedPlaylist(null)}
        />
      )}

      {/* Floating Bottom Playback Controller */}
      <div className={`shrink-0 transition-all duration-500 ${isMiniPlayer ? "opacity-0 pointer-events-none translate-y-12" : ""}`}>
        <MusicPlayerBar
          currentTrack={currentTrack}
          tracksContext={tracksContext}
          isPlaying={isPlaying}
          volume={volume}
          progress={progress}
          duration={duration}
          shuffle={shuffle}
          repeat={repeat}
          showVideo={showVideo}
          likedTracks={likedTracks}
          onPlayPauseToggle={handlePlayPauseToggle}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onVolumeChange={setVolume}
          onSeek={handleSeek}
          onToggleShuffle={() => setShuffle((p) => !p)}
          onToggleRepeat={() => setRepeat((p) => !p)}
          onToggleShowVideo={() => setShowVideo((v) => !v)}
          onToggleLike={handleToggleLike}
          onQueueTrackSelect={(track) => handleTrackSelect(track, tracksContext)}
          setActiveTab={setActiveTab}
          downloadedTracks={downloadedTracks}
          onDownloadTrack={handleDownloadTrack}
          isMiniPlayer={isMiniPlayer}
          onToggleMiniPlayer={() => setIsMiniPlayer((prev) => !prev)}
          isExtendedPlayer={isExtendedPlayer}
          onToggleExtendedPlayer={() => setIsExtendedPlayer((prev) => !prev)}
          onArtistClick={handleArtistClick}
          onClearQueue={handleClearQueue}
          activeVideoIdOverride={activeVideoIdOverride}
          onToggleMv={async (enabled) => {
            if (enabled) {
              if (currentTrack) {
                try {
                  const res = await aeroFetch(`/api/resolve-mv?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`);
                  const data = await res.json();
                  if (data.success && data.videoId) {
                    setActiveVideoIdOverride(data.videoId);
                    setShowVideo(true);
                  }
                } catch (e) {
                  console.error("Failed to load music video:", e);
                }
              }
            } else {
              setActiveVideoIdOverride(null);
              setShowVideo(false);
            }
          }}
        />
      </div>

      {/* Render Floating Draggable Mini-Player */}
      {isMiniPlayer && (
        <MiniPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          volume={volume}
          progress={progress}
          duration={duration}
          shuffle={shuffle}
          repeat={repeat}
          likedTracks={likedTracks}
          downloadedTracks={downloadedTracks}
          onPlayPauseToggle={handlePlayPauseToggle}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onVolumeChange={setVolume}
          onSeek={handleSeek}
          onToggleShuffle={() => setShuffle((p) => !p)}
          onToggleRepeat={() => setRepeat((p) => !p)}
          onToggleLike={handleToggleLike}
          onDownloadTrack={handleDownloadTrack}
          onRestore={() => setIsMiniPlayer(false)}
        />
      )}

      {/* Render Immersive Extended Player Overlay */}
      {isExtendedPlayer && (
        <ExtendedPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          volume={volume}
          progress={progress}
          duration={duration}
          shuffle={shuffle}
          repeat={repeat}
          likedTracks={likedTracks}
          downloadedTracks={downloadedTracks}
          onPlayPauseToggle={handlePlayPauseToggle}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onVolumeChange={setVolume}
          onSeek={handleSeek}
          onToggleShuffle={() => setShuffle((p) => !p)}
          onToggleRepeat={() => setRepeat((p) => !p)}
          onToggleLike={handleToggleLike}
          onDownloadTrack={handleDownloadTrack}
          onClose={() => setIsExtendedPlayer(false)}
          onArtistClick={handleArtistClick}
          activeVideoIdOverride={activeVideoIdOverride}
          showVideo={showVideo}
          onToggleMv={async (enabled) => {
            if (enabled) {
              if (currentTrack) {
                try {
                  const res = await aeroFetch(`/api/resolve-mv?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`);
                  const data = await res.json();
                  if (data.success && data.videoId) {
                    setActiveVideoIdOverride(data.videoId);
                    setShowVideo(true);
                  }
                } catch (e) {
                  console.error("Failed to load music video:", e);
                }
              }
            } else {
              setActiveVideoIdOverride(null);
              setShowVideo(false);
            }
          }}
        />
      )}

      {/* Floating Bulk Download Progress Card — draggable, cancellable */}
      {bulkDownloadProgress && (
        <div
          className="fixed bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 text-zinc-100 px-4 py-3 rounded-2xl shadow-2xl z-[9999] flex items-center gap-3 font-sans min-w-[260px] select-none cursor-grab active:cursor-grabbing"
          style={blobPos ? { left: blobPos.x, top: blobPos.y, bottom: "auto", right: "auto" } : { bottom: "6.5rem", right: "1.5rem" }}
          onMouseDown={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            blobDragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
            const onMove = (me: MouseEvent) => {
              if (!blobDragRef.current) return;
              const dx = me.clientX - blobDragRef.current.startX;
              const dy = me.clientY - blobDragRef.current.startY;
              setBlobPos({ x: blobDragRef.current.origX + dx, y: blobDragRef.current.origY + dy });
            };
            const onUp = () => { blobDragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          {/* Circular progress ring */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
              <circle cx="19" cy="19" r="15" fill="none" stroke="#3f3f46" strokeWidth="3" />
              <circle cx="19" cy="19" r="15" fill="none" stroke="#8b5cf6" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 15}`}
                strokeDashoffset={`${2 * Math.PI * 15 * (1 - bulkDownloadProgress.current / bulkDownloadProgress.total)}`}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
            </svg>
            <span className="absolute text-[9px] font-mono font-bold text-violet-400">
              {Math.round((bulkDownloadProgress.current / bulkDownloadProgress.total) * 100)}%
            </span>
          </div>
          {/* Text info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white leading-tight">Saving Offline</p>
            <p className="text-[10px] text-zinc-400 truncate mt-0.5">{bulkDownloadProgress.playlistName}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
              {bulkDownloadProgress.current} / {bulkDownloadProgress.total} tracks
            </p>
          </div>
          {/* Cancel button */}
          <button
            title="Cancel download"
            onClick={() => { cancelDownloadRef.current = true; setBulkDownloadProgress(null); setBlobPos(null); }}
            className="shrink-0 w-6 h-6 rounded-full bg-zinc-700 hover:bg-rose-600 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
      {/* Support Complaint Box Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-[#121216]/95 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowSupportModal(false);
                setSupportTitle("");
                setSupportDesc("");
                setSupportError("");
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="mb-5">
              <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
                <span>💬</span> Raise Complaint / Bug
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Describe the issue you're facing. Our admins will resolve it directly.
              </p>
            </div>

            {supportSuccess ? (
              <div className="py-8 text-center flex flex-col items-center justify-center">
                <span className="text-4xl mb-3">✅</span>
                <p className="text-sm font-bold text-white">Complaint Submitted!</p>
                <p className="text-xs text-zinc-400 mt-1">Thank you. The window will close shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitSupport} className="space-y-4">
                {supportError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                    {supportError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Title / Issue Type</label>
                  <input
                    type="text"
                    value={supportTitle}
                    onChange={(e) => setSupportTitle(e.target.value)}
                    placeholder="e.g. Playlist import failed, audio lagging"
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Details / Steps to reproduce</label>
                  <textarea
                    value={supportDesc}
                    onChange={(e) => setSupportDesc(e.target.value)}
                    placeholder="Provide details about what went wrong..."
                    rows={4}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition resize-none"
                    required
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSupport}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-2.5 rounded-lg text-sm transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmittingSupport ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    "Submit Complaint"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

