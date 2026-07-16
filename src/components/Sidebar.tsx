import { Home, Search, Sparkles, Music, Heart, Plus, ListMusic, Headphones, Link2, Download, Settings, Radio, FolderHeart } from "lucide-react";
import { Playlist } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  playlists: Playlist[];
  onSelectPlaylist: (playlist: Playlist) => void;
  selectedPlaylistId: string | null;
  likedCount: number;
  downloadedCount: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  playlists,
  onSelectPlaylist,
  selectedPlaylistId,
  likedCount,
  downloadedCount,
}: SidebarProps) {
  return (
    <aside
      id="spotify-sidebar"
      className="hidden md:flex w-64 bg-zinc-900 border border-zinc-900/60 rounded-2xl flex-col p-4 gap-4 h-full select-none text-zinc-400 font-sans shrink-0"
    >
      {/* Brand Logo */}
      <div className="flex items-center gap-3 px-2 py-3 cursor-pointer" onClick={() => setActiveTab("home")}>
        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-800/80 shadow-md shadow-violet-500/5 shrink-0 bg-zinc-950">
          <img src="/logo.png" className="w-full h-full object-cover scale-[1.02]" alt="AeroMusic Logo" />
        </div>
        <div>
          <h1 className="text-white font-extrabold text-lg tracking-tight">
            Aero<span className="text-violet-400">Music</span>
          </h1>
          <p className="text-[10px] text-zinc-400 font-mono font-bold tracking-wider uppercase">Premium Audio</p>
        </div>
      </div>

      {/* Main Navigation Panel */}
      <nav className="flex flex-col gap-1 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/40">
        <button
          onClick={() => {
            setActiveTab("home");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "home" && !selectedPlaylistId
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <Home size={18} />
          <span>Home</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("search");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "search"
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <Search size={18} />
          <span>Search</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("library");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "library"
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <FolderHeart size={18} className="text-violet-400" />
          <span>My Library</span>
        </button>


        <button
          onClick={() => {
            setActiveTab("lyrics");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "lyrics"
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <Music size={18} />
          <span>Lyrics Explorer</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("spotify-import");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "spotify-import"
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <Link2 size={18} />
          <span>Spotify Importer</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("listening-room");
            onSelectPlaylist(null as any);
          }}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "listening-room"
              ? "bg-zinc-800 text-white shadow-sm"
              : "hover:text-white hover:bg-zinc-800/30"
          }`}
        >
          <Radio size={18} className="text-violet-400" />
          <span>Co-Listening Room</span>
        </button>

      </nav>

      {/* Library & Playlists */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/40">
        <div className="flex items-center justify-between px-1 text-zinc-400 font-semibold text-xs tracking-wider uppercase mb-1">
          <span className="flex items-center gap-2 font-bold">
            <ListMusic size={16} />
            My Library
          </span>
          <button className="text-zinc-500 hover:text-white transition-colors cursor-not-allowed">
            <Plus size={16} />
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
          {/* Liked Songs Special item */}
          <div
            onClick={() => {
              setActiveTab("home");
              const likedPlaylist: Playlist = {
                id: "liked-songs",
                name: "Liked Songs",
                description: "Your absolute favorite premium tracks, synced.",
                tracks: [],
                coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop"
              };
              onSelectPlaylist(likedPlaylist);
            }}
            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
              selectedPlaylistId === "liked-songs"
                ? "bg-zinc-800 text-white"
                : "hover:bg-zinc-800/20 text-zinc-300"
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-700 to-purple-500 flex items-center justify-center text-white shadow-md">
              <Heart size={16} fill={likedCount > 0 ? "white" : "none"} className={likedCount > 0 ? "text-white scale-110" : ""} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">Liked Songs</p>
              <p className="text-xs text-zinc-500 font-mono font-medium">{likedCount} {likedCount === 1 ? "track" : "tracks"}</p>
            </div>
          </div>

          {/* Downloaded Songs Special item */}
          <div
            onClick={() => {
              setActiveTab("home");
              const downloadedPlaylist: Playlist = {
                id: "downloaded-songs",
                name: "Downloaded Songs",
                description: "Your offline tracks stored directly on your device.",
                tracks: [],
                coverUrl: "https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&h=300&fit=crop"
              };
              onSelectPlaylist(downloadedPlaylist);
            }}
            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
              selectedPlaylistId === "downloaded-songs"
                ? "bg-zinc-800 text-white"
                : "hover:bg-zinc-800/20 text-zinc-300"
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shadow-md">
              <Download size={16} className="stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">Downloaded Songs</p>
              <p className="text-xs text-zinc-500 font-mono font-medium">{downloadedCount} {downloadedCount === 1 ? "track" : "tracks"}</p>
            </div>
          </div>

          {/* User's general playlists */}
          {playlists.filter(pl => pl.tracks && pl.tracks.length > 0).map((pl) => {
            const isSelected = selectedPlaylistId === pl.id;
            return (
              <div
                key={pl.id}
                onClick={() => {
                  setActiveTab("home");
                  onSelectPlaylist(pl);
                }}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                  isSelected ? "bg-zinc-800 text-white" : "hover:bg-zinc-800/20 text-zinc-300"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden shadow border border-zinc-700/30">
                  <img
                    src={pl.coverUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop"}
                    alt={pl.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-500 font-mono font-medium truncate">{pl.tracks.length} tracks</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connection Indicator / Visual polish (No tech-slop online label, but nice client badge) */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-900 flex flex-col gap-1.5 text-center">
        <span className="text-[10px] tracking-wide text-zinc-500 font-bold uppercase">Device Playback</span>
        <div className="flex items-center justify-center gap-1.5 text-violet-400 font-mono text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
          </span>
          Audio Connected
        </div>
      </div>
    </aside>
  );
}
