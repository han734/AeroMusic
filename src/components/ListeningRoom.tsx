import React, { useState, useEffect, useRef } from "react";
import { 
  Users, 
  Send, 
  Copy, 
  Check, 
  Play, 
  Pause, 
  Radio, 
  Volume2, 
  Sparkles, 
  LogOut, 
  Music,
  Share2,
  Clock
} from "lucide-react";
import { Track } from "../types";

interface ListeningRoomProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  catalog: Track[];
  onTrackSelect: (track: Track, context: Track[]) => void;
  onPlayPauseToggle: () => void;
  onSeek: (seconds: number) => void;
  
  // WebSocket States passed from App.tsx
  activeRoomId: string | null;
  roomMembers: Array<{ id: string; username: string; avatar: string }>;
  roomMessages: Array<{ id: string; username: string; avatar: string; text: string; timestamp: string }>;
  isConnecting: boolean;
  isHost: boolean;
  
  // Handlers
  onJoinRoom: (roomId: string, username: string, avatar: string) => void;
  onLeaveRoom: () => void;
  onSendMessage: (text: string) => void;
  onBroadcastPlayback: (track: Track | null, isPlaying: boolean, progressSeconds: number) => void;
  lastRemoteSync: { track: Track | null; isPlaying: boolean; progressSeconds: number; timestamp: number } | null;
  
  // Error state
  roomError?: string | null;
}

const AVATAR_EMOJIS = ["🎧", "🎵", "🎸", "🎹", "🎙️", "📻", "⚡", "🔥", "🌈", "🐱", "🦊", "👽"];

export default function ListeningRoom({
  currentTrack,
  isPlaying,
  progress,
  catalog,
  onTrackSelect,
  onPlayPauseToggle,
  onSeek,
  activeRoomId,
  roomMembers,
  roomMessages,
  isConnecting,
  isHost,
  onJoinRoom,
  onLeaveRoom,
  onSendMessage,
  onBroadcastPlayback,
  lastRemoteSync,
  roomError
}: ListeningRoomProps) {
  // Join Room Form states
  const [roomIdInput, setRoomIdInput] = useState("");
  const [usernameInput, setUsernameInput] = useState(() => {
    return localStorage.getItem("aero-listening-username") || "";
  });
  const [selectedAvatar, setSelectedAvatar] = useState(() => {
    return localStorage.getItem("aero-listening-avatar") || AVATAR_EMOJIS[0];
  });
  
  // Chat typing state
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roomMessages]);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    
    // Generate a clean room code like AERO-WAVE-123
    const adjs = ["CHILL", "GROOVE", "BEATS", "WAVE", "SOLAR", "COSMIC", "RETRO", "AMBIENT"];
    const chosenAdj = adjs[Math.floor(Math.random() * adjs.length)];
    const randomNum = Math.floor(100 + Math.random() * 900);
    const newRoomId = `AERO-${chosenAdj}-${randomNum}`;
    
    localStorage.setItem("aero-listening-username", usernameInput.trim());
    localStorage.setItem("aero-listening-avatar", selectedAvatar);
    onJoinRoom(newRoomId, usernameInput.trim(), selectedAvatar);
  };

  const handleJoinExistingRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !roomIdInput.trim()) return;
    
    localStorage.setItem("aero-listening-username", usernameInput.trim());
    localStorage.setItem("aero-listening-avatar", selectedAvatar);
    onJoinRoom(roomIdInput.trim().toUpperCase(), usernameInput.trim(), selectedAvatar);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim());
    setChatInput("");
  };

  const handleCopyCode = () => {
    if (!activeRoomId) return;
    navigator.clipboard.writeText(activeRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if current user is out of sync with the room's current playing track
  const isOutOfSync = () => {
    if (isHost) return false;
    if (!lastRemoteSync) return false;
    
    // Check track mismatch
    if (lastRemoteSync.track && (!currentTrack || currentTrack.id !== lastRemoteSync.track.id)) {
      return true;
    }
    
    // Check play state mismatch
    if (lastRemoteSync.isPlaying !== isPlaying) {
      return true;
    }

    // Check drift (more than 4 seconds drift)
    if (isPlaying && lastRemoteSync.isPlaying) {
      const timeElapsedSinceSync = (Date.now() - lastRemoteSync.timestamp) / 1000;
      const expectedProgress = lastRemoteSync.progressSeconds + timeElapsedSinceSync;
      if (Math.abs(progress - expectedProgress) > 5) {
        return true;
      }
    }
    
    return false;
  };

  const handleManualSync = () => {
    if (!lastRemoteSync || !lastRemoteSync.track) return;
    
    const matchedTrack = lastRemoteSync.track;
    // Track Select triggers sync
    const timeElapsedSinceSync = lastRemoteSync.isPlaying ? (Date.now() - lastRemoteSync.timestamp) / 1000 : 0;
    const targetProgress = Math.max(0, lastRemoteSync.progressSeconds + timeElapsedSinceSync);
    
    onTrackSelect(matchedTrack, [matchedTrack]);
    setTimeout(() => {
      onSeek(targetProgress);
      if (lastRemoteSync.isPlaying !== isPlaying) {
        onPlayPauseToggle();
      }
    }, 250);
  };

  const handleQuickDiscoverPlay = (track: Track) => {
    // Select locally and broadcast immediately
    onTrackSelect(track, catalog);
    onBroadcastPlayback(track, true, 0);
  };

  return (
    <div id="listening-room-container" className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-black text-white font-sans">
      
      {!activeRoomId ? (
        // JOIN / CREATE VIEW
        <div className="max-w-md mx-auto my-12 bg-zinc-900/60 p-8 rounded-3xl border border-zinc-800/80 shadow-2xl backdrop-blur-md">
          {roomError && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-2xl text-xs font-semibold flex items-start gap-2.5 animate-fade-in">
              <span className="text-sm shrink-0 mt-0.5">⚠️</span>
              <div>
                <p>{roomError}</p>
                <p className="text-[10px] text-red-400/70 mt-1 font-normal">
                  Make sure the server is running (use `node server.ts` or launch the app normally) and the correct address is set in Settings.
                </p>
              </div>
            </div>
          )}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center bg-violet-500/10 text-violet-400 p-4 rounded-full border border-violet-500/20 mb-4 animate-bounce-slow">
              <Radio size={32} />
            </div>
            <h2 className="text-2xl font-extrabold font-sans text-zinc-100">Co-Listening Rooms</h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Sync music playback dynamically with your friends in real-time. Drop in, discover together, and chat!
            </p>
          </div>

          <div className="space-y-6">
            {/* Identity Info */}
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                1. Your Nickname
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. BassCatcher"
                maxLength={20}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500/50 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none transition font-sans"
              />
            </div>

            {/* Avatar picker */}
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                2. Choose Avatar Emoji
              </label>
              <div className="grid grid-cols-6 gap-2.5 bg-zinc-950 p-3 rounded-2xl border border-zinc-800/60">
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedAvatar(emoji)}
                    className={`text-xl p-2 rounded-xl transition-all cursor-pointer ${
                      selectedAvatar === emoji
                        ? "bg-violet-500/15 border-2 border-violet-500 scale-110"
                        : "hover:bg-zinc-800/40 border-2 border-transparent"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions Partition */}
            <div className="h-px bg-zinc-800/40 my-2"></div>

            <div className="grid grid-cols-1 gap-4">
              {/* Option A: Create Room */}
              <form onSubmit={handleCreateRoom} className="space-y-2">
                <button
                  type="submit"
                  disabled={!usernameInput.trim()}
                  className="w-full bg-violet-500 hover:bg-violet-400 text-black font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <Radio size={16} className="animate-pulse" />
                  <span>Create a New Room</span>
                </button>
              </form>

              {/* Option B: Join Room */}
              <form onSubmit={handleJoinExistingRoom} className="space-y-3 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-850">
                <div className="text-center text-xs text-zinc-500 font-mono font-bold uppercase tracking-wide">
                  — Or Join Existing Room —
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    placeholder="ENTER ROOM CODE (e.g. AERO-CHILL-201)"
                    className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-xs font-mono uppercase text-zinc-100 outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={!usernameInput.trim() || !roomIdInput.trim()}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : (
        // ACTIVE ROOM LOBBY
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
          
          {/* LEFT COLUMN: Synced Playback, Sync Controls, Suggestions */}
          <div className="flex-1 flex flex-col gap-6">
            
            {/* Header / Room Banner */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 p-6 rounded-3xl border border-zinc-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-violet-500/10 border border-violet-500/30 text-violet-400 rounded-2xl flex items-center justify-center animate-pulse">
                  <Radio size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-extrabold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">LIVE CO-LISTENING</span>
                    <span className="text-xs font-mono text-zinc-500">Code:</span>
                  </div>
                  <h3 className="text-xl font-black font-mono tracking-wider text-white mt-0.5 flex items-center gap-2">
                    <span>{activeRoomId}</span>
                    <button 
                      onClick={handleCopyCode}
                      className="text-zinc-500 hover:text-violet-400 transition cursor-pointer"
                      title="Copy Room Code"
                    >
                      {copied ? <Check size={16} className="text-violet-400" /> : <Copy size={16} />}
                    </button>
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onLeaveRoom}
                  className="bg-zinc-900 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 text-zinc-400 hover:text-red-400 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition duration-200"
                >
                  <LogOut size={13} />
                  <span>Leave Room</span>
                </button>
              </div>
            </div>

            {/* Synced Track & Status Card */}
            <div className="bg-zinc-900/40 p-6 rounded-3xl border border-zinc-800/50 shadow-md">
              <h4 className="text-xs font-mono font-extrabold text-zinc-400 uppercase tracking-widest mb-4">
                Synchronized Player Status
              </h4>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Album Cover & Play State */}
                <div className="w-32 h-32 rounded-2xl overflow-hidden bg-zinc-850 relative group shadow-lg shrink-0">
                  {currentTrack ? (
                    <>
                      <img 
                        src={currentTrack.thumbnail} 
                        alt={currentTrack.title} 
                        className={`w-full h-full object-cover transition-all duration-500 ${isPlaying ? "scale-105 saturate-110 rotate-1" : "scale-100"}`}
                        referrerPolicy="no-referrer"
                      />
                      {isPlaying && (
                        <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-2.5">
                          <div className="flex gap-0.5 items-end h-6">
                            <span className="w-1 bg-violet-500 animate-music-bar-1 rounded-sm"></span>
                            <span className="w-1 bg-violet-500 animate-music-bar-2 rounded-sm h-4"></span>
                            <span className="w-1 bg-violet-500 animate-music-bar-3 rounded-sm h-5"></span>
                            <span className="w-1 bg-violet-500 animate-music-bar-4 rounded-sm h-3"></span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-600">
                      <Music size={36} />
                    </div>
                  )}
                </div>

                {/* Track Details / Sync Info */}
                <div className="flex-1 text-center sm:text-left min-w-0">
                  {currentTrack ? (
                    <>
                      <h5 className="text-lg font-black text-white truncate leading-snug">{currentTrack.title}</h5>
                      <p className="text-sm text-zinc-400 font-semibold truncate mt-0.5">{currentTrack.artist}</p>
                      <span className="text-[10px] font-mono font-medium text-zinc-500 mt-2 block uppercase bg-zinc-950/40 px-2.5 py-1 rounded-md w-fit mx-auto sm:mx-0 border border-zinc-900">
                        {currentTrack.album}
                      </span>
                    </>
                  ) : (
                    <>
                      <h5 className="text-base font-bold text-zinc-300">Room is Quiet</h5>
                      <p className="text-xs text-zinc-500 mt-1">Play a track below to start hosting the synchronized stream!</p>
                    </>
                  )}

                  {/* Sync status pills */}
                  <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                    {isHost ? (
                      <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3.5 py-2 rounded-xl text-xs font-semibold">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span>Hosting Room Playback (You are the DJ)</span>
                      </div>
                    ) : isOutOfSync() ? (
                      <div className="flex items-center gap-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3.5 py-2 rounded-xl text-xs font-semibold animate-pulse">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span>Out of Sync with Friends</span>
                        <button
                          onClick={handleManualSync}
                          className="bg-amber-500 text-black font-extrabold px-3 py-1 rounded-lg ml-1 hover:bg-amber-400 transition cursor-pointer text-[10px] shadow"
                        >
                          CATCH UP
                        </button>
                      </div>
                    ) : (
                      currentTrack && (
                        <div className="flex items-center gap-2 bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3.5 py-2 rounded-xl text-xs font-semibold">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                          </span>
                          <span>Synced perfectly with the Room</span>
                        </div>
                      )
                    )}

                    {!currentTrack && (
                      <div className="bg-zinc-950/60 text-zinc-500 border border-zinc-850 px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>Awaiting Session Start</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestion & Shared Music Discovery catalog */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-sans font-black text-zinc-100 flex items-center gap-2">
                  <Sparkles size={16} className="text-violet-400" />
                  <span>Group Music Discovery Playlist</span>
                </h4>
                <span className="text-[10px] font-mono text-zinc-500 uppercase">Click to sync for everyone</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {catalog.slice(0, 8).map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handleQuickDiscoverPlay(track)}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border group relative overflow-hidden ${
                      currentTrack?.id === track.id
                        ? "bg-violet-500/5 border-violet-500/30"
                        : "bg-zinc-900/30 border-zinc-850 hover:bg-zinc-800/40 hover:border-zinc-700/50"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative">
                      <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <Play size={14} fill="white" className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate transition duration-200 ${currentTrack?.id === track.id ? "text-violet-400" : "text-zinc-100 group-hover:text-violet-400"}`}>
                        {track.title}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">{track.artist}</p>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850 shrink-0 group-hover:border-violet-500/20 group-hover:text-violet-400 transition-all">
                      {track.duration}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Active Presence and Chat Lobby */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
            
            {/* Active Members Card */}
            <div className="bg-zinc-900/50 p-5 rounded-3xl border border-zinc-800/60 shadow-md">
              <h4 className="text-xs font-mono font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Users size={14} className="text-violet-400" />
                <span>Online Listeners ({roomMembers.length})</span>
              </h4>

              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {roomMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 bg-zinc-950/40 p-2 rounded-xl border border-zinc-850/40">
                    <span className="bg-zinc-900 w-8 h-8 rounded-lg flex items-center justify-center border border-zinc-800 shrink-0 overflow-hidden">
                      {(member.avatar || "🎧").startsWith("data:image") ? (
                        <img src={member.avatar} className="w-full h-full object-cover" alt="Member DP" />
                      ) : (
                        <span className="text-lg">{member.avatar || "🎧"}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-100 truncate">{member.username}</p>
                      <span className="text-[9px] font-mono text-violet-400 flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500 inline-block animate-pulse"></span>
                        <span>Connected</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Real-time Group Chat Card */}
            <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/60 shadow-md flex flex-col h-[400px]">
              {/* Chat Title */}
              <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
                <span className="text-xs font-mono font-extrabold text-zinc-300 uppercase tracking-wider">Group Chat</span>
                <span className="text-[9px] font-mono text-zinc-500">Live Lounge</span>
              </div>

              {/* Chat Body messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {roomMessages.map((msg) => {
                  const isSys = msg.username === "System";
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex gap-2 ${isSys ? "justify-center my-1" : "items-start"}`}
                    >
                      {!isSys && (
                        <span className="bg-zinc-950 w-7 h-7 rounded-md flex items-center justify-center border border-zinc-850 shrink-0 overflow-hidden">
                          {(msg.avatar || "🎵").startsWith("data:image") ? (
                            <img src={msg.avatar} className="w-full h-full object-cover" alt="Chat DP" />
                          ) : (
                            <span className="text-xs">{msg.avatar || "🎵"}</span>
                          )}
                        </span>
                      )}
                      
                      <div className={`min-w-0 ${isSys ? "text-center max-w-[85%]" : "flex-1"}`}>
                        {isSys ? (
                          <p className="text-[10px] font-mono text-zinc-500 bg-zinc-950/60 px-3 py-1 rounded-full border border-zinc-900 inline-block">
                            {msg.text}
                          </p>
                        ) : (
                          <div className="bg-zinc-950/60 p-2.5 rounded-2xl border border-zinc-850/40">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-extrabold text-violet-400 truncate">{msg.username}</span>
                              <span className="text-[8px] font-mono text-zinc-650 shrink-0">{msg.timestamp}</span>
                            </div>
                            <p className="text-xs text-zinc-300 mt-1 break-words font-sans">{msg.text}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Send Form */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-zinc-800/60 bg-zinc-950/30 rounded-b-3xl">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type to chat..."
                    maxLength={140}
                    className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-violet-500/40 rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="bg-violet-500 hover:bg-violet-400 text-black p-2 rounded-xl shrink-0 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </form>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
