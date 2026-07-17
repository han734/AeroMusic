import React, { useState } from "react";
import { 
  Heart, 
  ListMusic, 
  Play, 
  Pause, 
  Trash2, 
  Clock, 
  Music, 
  Plus, 
  Search, 
  Download, 
  FolderHeart,
  ExternalLink,
  ChevronRight,
  FileDown,
  FolderArchive
} from "lucide-react";
import { Track, Playlist } from "../types";
import PlaylistCover from "./PlaylistCover";
import JSZip from "jszip";

// Dummy MP3 builder for export convenience from within the library
function generateDummyMp3Bytes(title: string, artist: string, album: string): Uint8Array {
  const encoder = new TextEncoder();
  const titleBytes = encoder.encode(title);
  const artistBytes = encoder.encode(artist);
  const albumBytes = encoder.encode(album);

  const createFrame = (id: string, valueBytes: Uint8Array) => {
    const header = encoder.encode(id);
    const size = valueBytes.length + 1;
    const sizeBytes = new Uint8Array([
      (size >> 24) & 0xff,
      (size >> 16) & 0xff,
      (size >> 8) & 0xff,
      size & 0xff
    ]);
    const flags = new Uint8Array([0, 0]);
    const encoding = new Uint8Array([0]);
    
    const frame = new Uint8Array(header.length + sizeBytes.length + flags.length + encoding.length + valueBytes.length);
    frame.set(header, 0);
    frame.set(sizeBytes, header.length);
    frame.set(flags, header.length + sizeBytes.length);
    frame.set(encoding, header.length + sizeBytes.length + flags.length);
    frame.set(valueBytes, header.length + sizeBytes.length + flags.length + encoding.length);
    return frame;
  };

  const tit2 = createFrame("TIT2", titleBytes);
  const tpe1 = createFrame("TPE1", artistBytes);
  const talb = createFrame("TALB", albumBytes);
  const framesLength = tit2.length + tpe1.length + talb.length;
  
  const syncsafeSize = (size: number) => {
    return new Uint8Array([
      (size >> 21) & 0x7f,
      (size >> 14) & 0x7f,
      (size >> 7) & 0x7f,
      size & 0x7f
    ]);
  };
  const id3Size = syncsafeSize(framesLength);
  const id3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
  
  const id3Tag = new Uint8Array(id3Header.length + id3Size.length + framesLength);
  id3Tag.set(id3Header, 0);
  id3Tag.set(id3Size, id3Header.length);
  id3Tag.set(tit2, id3Header.length + id3Size.length);
  id3Tag.set(tpe1, id3Header.length + id3Size.length + tit2.length);
  id3Tag.set(talb, id3Header.length + id3Size.length + tit2.length + tpe1.length);

  const mp3Frame = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const mp3File = new Uint8Array(id3Tag.length + mp3Frame.length);
  mp3File.set(id3Tag, 0);
  mp3File.set(mp3Frame, id3Tag.length);

  return mp3File;
}

interface MyLibraryProps {
  likedTracks: Track[];
  playlists: Playlist[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, context: Track[]) => void;
  onPlayPauseToggle: () => void;
  onToggleLike: (track: Track) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  setActiveTab: (tab: string) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onDownloadTracksBulk?: (tracks: Track[], sourceName: string) => void;
  onAddPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onArtistClick?: (artistName: string) => void;
  onDeleteDownloadedTrack?: (track: Track) => void;
  onDeleteDownloadedTracksBulk?: (tracks: Track[]) => void;
  downloadedPlaylists?: Playlist[];
}

export default function MyLibrary({
  likedTracks,
  playlists,
  downloadedPlaylists = [],
  currentTrack,
  isPlaying,
  onTrackSelect,
  onPlayPauseToggle,
  onToggleLike,
  onSelectPlaylist,
  setActiveTab,
  downloadedTracks,
  onDownloadTrack,
  onDownloadTracksBulk,
  onAddPlaylist,
  onDeletePlaylist,
  onArtistClick,
  onDeleteDownloadedTrack,
  onDeleteDownloadedTracksBulk,
}: MyLibraryProps) {
  const [activeSubTab, setActiveSubTab] = useState<"all" | "liked" | "playlists" | "downloaded" | "downloaded-playlists">("all");
  const [likedSearch, setLikedSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [downloadedSearch, setDownloadedSearch] = useState("");
  const [downloadedPlaylistSearch, setDownloadedPlaylistSearch] = useState("");

  const filteredLiked = likedTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(likedSearch.toLowerCase()) ||
      t.artist.toLowerCase().includes(likedSearch.toLowerCase())
  );

  const filteredPlaylists = playlists.filter(
    (p) =>
      p.tracks && p.tracks.length > 0 && (
        p.name.toLowerCase().includes(playlistSearch.toLowerCase()) ||
        p.description?.toLowerCase().includes(playlistSearch.toLowerCase())
      )
  );

  const filteredDownloaded = downloadedTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(downloadedSearch.toLowerCase()) ||
      t.artist.toLowerCase().includes(downloadedSearch.toLowerCase())
  );

  const [isExportingZip, setIsExportingZip] = useState<string | null>(null);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<Set<string>>(new Set());

  // New Playlist Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [newPlaylistCover, setNewPlaylistCover] = useState("");

  const filteredDownloadedPlaylists = downloadedPlaylists.filter(
    (p) =>
      p.tracks && p.tracks.length > 0 && (
        p.name.toLowerCase().includes(downloadedPlaylistSearch.toLowerCase()) ||
        p.description?.toLowerCase().includes(downloadedPlaylistSearch.toLowerCase())
      )
  );

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newPl: Playlist = {
      id: "pl-" + Date.now(),
      name: newPlaylistName.trim(),
      description: newPlaylistDesc.trim() || "Custom playlist created in Library",
      tracks: [],
      coverUrl: newPlaylistCover.trim() || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop"
    };

    onAddPlaylist(newPl);
    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setNewPlaylistCover("");
    setShowCreateForm(false);
  };

  const handleExportM3U = (playlistName: string, tracks: Track[]) => {
    if (tracks.length === 0) {
      alert("This item has no tracks to export.");
      return;
    }
    let m3uContent = "#EXTM3U\n";
    const apiBase = getApiBaseUrl() || window.location.origin;

    tracks.forEach((track) => {
      let durationSec = 180;
      if (track.duration && typeof track.duration === "string" && track.duration.includes(":")) {
        const parts = track.duration.split(":").map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          durationSec = parts[0] * 60 + parts[1];
        }
      } else if (track.duration && typeof track.duration === "number") {
        durationSec = Math.floor(track.duration);
      }
      
      const artist = track.artist || "Unknown Artist";
      const title = track.title || "Unknown Title";
      m3uContent += `#EXTINF:${durationSec},${artist} - ${title}\n`;
      m3uContent += `${apiBase}/api/stream/${track.id}\n`;
    });

    const blob = new Blob([m3uContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9_-]/gi, "_")}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportZIP = async (playlistName: string, tracks: Track[]) => {
    if (tracks.length === 0) {
      alert("This item has no tracks to export.");
      return;
    }

    setIsExportingZip(playlistName);
    try {
      const zip = new JSZip();
      
      // Fetch files sequentially or in small chunks to avoid overloading the connection
      for (const track of tracks) {
        let mp3Data: Blob | Uint8Array;
        
        // Find if this track exists in downloadedTracks or has offlineFile
        const offlineMatch = downloadedTracks.find(t => 
          t.id === track.id || 
          (t.title?.toLowerCase().trim() === track.title?.toLowerCase().trim() && 
           t.artist?.toLowerCase().trim() === track.artist?.toLowerCase().trim())
        );
        
        if (offlineMatch?.offlineReady && offlineMatch.offlineFile) {
          try {
            // Fetch the real MP3 file bytes from the server's cache
            const isElectron = typeof window !== "undefined" && (
              window.navigator.userAgent.toLowerCase().includes("electron") ||
              !!(window as any).electronAPI
            );
            const resolvedUrl = offlineMatch.offlineFile.startsWith("http")
              ? offlineMatch.offlineFile
              : `${(isElectron && offlineMatch.offlineFile.startsWith("/api/offline-audio")) ? "http://localhost:3000" : (getApiBaseUrl() || "")}${offlineMatch.offlineFile}`;

            const res = await fetch(resolvedUrl);
            if (res.ok) {
              mp3Data = await res.blob();
            } else {
              throw new Error(`HTTP error ${res.status}`);
            }
          } catch (err) {
            console.warn(`Could not fetch offline file for "${track.title}", falling back to placeholder:`, err);
            mp3Data = generateDummyMp3Bytes(track.title, track.artist, track.album || "AeroMusic");
          }
        } else {
          mp3Data = generateDummyMp3Bytes(track.title, track.artist, track.album || "AeroMusic");
        }
        
        const filename = `${track.artist} - ${track.title}.mp3`;
        zip.file(filename, mp3Data);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9_-]/gi, "_")}_bundle.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zipping failed:", err);
      alert("Failed to build ZIP archive.");
    } finally {
      setIsExportingZip(null);
    }
  };

  return (
    <div id="mylibrary-panel" className="flex-1 flex flex-col min-h-0 bg-zinc-900 p-6 overflow-y-auto select-none relative custom-scrollbar">
      
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

      {/* Header Hub */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 relative z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <FolderHeart className="text-violet-400" size={32} />
            My Music Library
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Access your curated playlists, favorited songs, and download channels.
          </p>
        </div>

        {/* Create playlist shortcut */}
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-violet-500 hover:bg-violet-400 text-black text-sm font-bold px-4 py-2 rounded-full shadow-lg transition flex items-center gap-2 self-start cursor-pointer hover:scale-105 duration-200"
        >
          <Plus size={16} className="stroke-[3]" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Playlist Creation Modal/Drawer overlay */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <ListMusic size={18} className="text-violet-400" />
              Create Custom Playlist
            </h3>
            
            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Playlist Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Late Night Jazz, Study Beats"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Description (Optional)</label>
                <textarea
                  placeholder="Describe your custom vibe..."
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Artwork Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/... or blank for default"
                  value={newPlaylistCover}
                  onChange={(e) => setNewPlaylistCover(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-violet-500 hover:bg-violet-400 text-black text-xs font-bold rounded-full transition"
                >
                  Create Mix
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-tabs Selection bar */}
      <div className="flex border-b border-zinc-800/60 pb-3 mb-6 gap-2 relative z-10">
        <button
          onClick={() => setActiveSubTab("all")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === "all" 
              ? "bg-violet-500 text-black" 
              : "text-zinc-400 hover:text-white bg-zinc-800/30 hover:bg-zinc-800/60"
          }`}
        >
          All Panels
        </button>
        <button
          onClick={() => setActiveSubTab("liked")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === "liked" 
              ? "bg-violet-500 text-black" 
              : "text-zinc-400 hover:text-white bg-zinc-800/30 hover:bg-zinc-800/60"
          }`}
        >
          Favorites Only ({likedTracks.length})
        </button>
        <button
          onClick={() => setActiveSubTab("playlists")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === "playlists" 
              ? "bg-violet-500 text-black" 
              : "text-zinc-400 hover:text-white bg-zinc-800/30 hover:bg-zinc-800/60"
          }`}
        >
          My Playlists ({playlists.length})
        </button>
        <button
          onClick={() => setActiveSubTab("downloaded")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === "downloaded" 
              ? "bg-violet-500 text-black" 
              : "text-zinc-400 hover:text-white bg-zinc-800/30 hover:bg-zinc-800/60"
          }`}
        >
          Downloads ({downloadedTracks.length + downloadedPlaylists.length})
        </button>
      </div>

      {/* Split/Dual Layout Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start min-h-0 relative z-10">
        
        {/* Panel 4: Downloaded Playlists List */}
        {(activeSubTab === "all" || activeSubTab === "downloaded") && (
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-5 flex flex-col h-[520px] min-h-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <FolderArchive size={18} className="text-violet-400" />
                <h3 className="text-base font-bold text-zinc-100">Downloaded Playlists</h3>
                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                  {downloadedPlaylists.length}
                </span>
              </div>
            </div>

            {/* Quick search */}
            <div className="relative mb-3 shrink-0">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search downloaded playlists..."
                value={downloadedPlaylistSearch}
                onChange={(e) => setDownloadedPlaylistSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
              {filteredDownloadedPlaylists.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600">
                  <FolderArchive size={36} className="opacity-15 mb-2" />
                  <p className="text-xs font-semibold">No downloaded playlists found.</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                    Bulk download a playlist to see it appear here for offline listening!
                  </p>
                </div>
              ) : (
                filteredDownloadedPlaylists.map((pl) => {
                  const tracksCount = (pl.tracks || []).length;
                  return (
                    <div
                      key={pl.id}
                      className="p-3 bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700/80 rounded-xl flex items-center justify-between gap-3 transition hover:bg-zinc-800/20 group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Cover Image */}
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shadow border border-zinc-700/30 shrink-0 relative">
                          <PlaylistCover
                            playlist={pl}
                            className="w-full h-full object-cover group-hover:scale-105 duration-300"
                          />
                        </div>

                        {/* Playlist Meta */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 truncate group-hover:text-violet-400 transition">
                            {pl.name}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {pl.description || "Downloaded for offline listening."}
                          </p>
                          <span className="text-[9px] bg-zinc-800 text-violet-400 font-mono px-1.5 py-0.5 rounded mt-1.5 inline-block">
                            {tracksCount} {tracksCount === 1 ? "song" : "songs"}
                          </span>
                        </div>
                      </div>

                      {/* Quick play, detail redirect row */}
                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        {/* Export Playlists */}
                        {tracksCount > 0 && (
                          <>
                            <button
                              onClick={() => handleExportM3U(pl.name, pl.tracks || [])}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer"
                              title="Export playlist as M3U"
                            >
                              <FileDown size={13} />
                            </button>
                            <button
                              onClick={() => handleExportZIP(pl.name, pl.tracks || [])}
                              disabled={isExportingZip !== null}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer disabled:opacity-50"
                              title="Export playlist as ZIP"
                            >
                              {isExportingZip === pl.name ? (
                                <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <FolderArchive size={13} />
                              )}
                            </button>
                          </>
                        )}

                        {/* Open Details */}
                        <button
                          onClick={() => {
                            setActiveTab("home");
                            onSelectPlaylist(pl);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer flex items-center gap-1"
                          title="Open playlist view details"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        
        {/* Panel 1: Favorited Songs List */}
        {(activeSubTab === "all" || activeSubTab === "liked") && (
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-5 flex flex-col h-[520px] min-h-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Heart size={18} className="text-red-500 fill-red-500" />
                <h3 className="text-base font-bold text-zinc-100">Liked Songs</h3>
                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                  {likedTracks.length}
                </span>
              </div>

              {/* M3U & ZIP buttons for liked songs */}
              {likedTracks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleExportM3U("My Liked Tracks", likedTracks)}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-violet-400 text-zinc-400 rounded transition cursor-pointer"
                    title="Export Likes as M3U"
                  >
                    <FileDown size={14} />
                  </button>
                  <button
                    onClick={() => handleExportZIP("My Liked Tracks", likedTracks)}
                    disabled={isExportingZip !== null}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-violet-400 text-zinc-400 rounded transition cursor-pointer disabled:opacity-50"
                    title="Export Likes as ZIP of MP3s"
                  >
                    {isExportingZip === "My Liked Tracks" ? (
                      <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <FolderArchive size={14} />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Quick search */}
            <div className="relative mb-3 shrink-0">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search liked songs..."
                value={likedSearch}
                onChange={(e) => setLikedSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {filteredLiked.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600">
                  <Heart size={36} className="opacity-15 mb-2" />
                  <p className="text-xs font-semibold">No favorite tracks found.</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                    Click the Heart icon on any song while listening to populate your personal favorites!
                  </p>
                </div>
              ) : (
                filteredLiked.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-all group ${
                        isCurrent 
                          ? "bg-violet-500/5 border border-violet-500/10" 
                          : "hover:bg-zinc-800/30 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Play/Index Button */}
                        <div className="w-8 h-8 rounded-md bg-zinc-800/50 flex items-center justify-center relative shrink-0 overflow-hidden">
                          <button
                            onClick={() => {
                              if (isCurrent) {
                                onPlayPauseToggle();
                              } else {
                                onTrackSelect(track, likedTracks);
                              }
                            }}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 text-violet-400 transition cursor-pointer"
                          >
                            {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                          </button>
                          
                          {isCurrent && isPlaying ? (
                            <div className="flex items-end gap-0.5 h-3">
                              <span className="w-0.5 h-3 bg-violet-400 animate-pulse"></span>
                              <span className="w-0.5 h-2 bg-violet-400 animate-pulse delay-75"></span>
                              <span className="w-0.5 h-3 bg-violet-400 animate-pulse delay-150"></span>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-medium text-zinc-500">{idx + 1}</span>
                          )}
                        </div>

                        {/* Text info */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isCurrent ? "text-violet-400" : "text-zinc-200"}`}>
                            {track.title}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            <span 
                              onClick={() => onArtistClick && onArtistClick(track.artist)}
                              className="hover:underline cursor-pointer hover:text-zinc-300 transition"
                            >
                              {track.artist}
                            </span> • <span className="font-mono">{track.duration}</span>
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pl-2">
                        {/* Download Trigger */}
                        <button
                          onClick={() => onDownloadTrack(track)}
                          className={`p-1 text-zinc-500 hover:text-violet-400 rounded transition cursor-pointer ${
                            downloadedTracks.some((dl) => dl.id === track.id) ? "text-violet-400" : ""
                          }`}
                          title="Download for offline access"
                        >
                          <Download size={13} />
                        </button>

                        {/* Unlike Button */}
                        <button
                          onClick={() => onToggleLike(track)}
                          className="p-1 text-red-500 hover:text-zinc-400 rounded transition cursor-pointer"
                          title="Remove from favorites"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Panel 2: User custom playlists list */}
        {(activeSubTab === "all" || activeSubTab === "playlists") && (
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-5 flex flex-col h-[520px] min-h-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic size={18} className="text-violet-400" />
                <h3 className="text-base font-bold text-zinc-100">Playlists</h3>
                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                  {playlists.length}
                </span>
              </div>
            </div>

            {/* Quick search */}
            <div className="relative mb-3 shrink-0">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search playlists..."
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
              {filteredPlaylists.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600">
                  <ListMusic size={36} className="opacity-15 mb-2" />
                  <p className="text-xs font-semibold">No playlists created.</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                    Get started by pressing "New Playlist" above or transfer custom mixes from your Spotify Importer!
                  </p>
                </div>
              ) : (
                filteredPlaylists.map((pl) => {
                  const tracksCount = (pl.tracks || []).length;
                  return (
                    <div
                      key={pl.id}
                      className="p-3 bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700/80 rounded-xl flex items-center justify-between gap-3 transition hover:bg-zinc-800/20 group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Cover Image */}
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shadow border border-zinc-700/30 shrink-0 relative">
                          <PlaylistCover
                            playlist={pl}
                            className="w-full h-full object-cover group-hover:scale-105 duration-300"
                          />
                        </div>

                        {/* Playlist Meta */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 truncate group-hover:text-violet-400 transition">
                            {pl.name}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {pl.description || "Custom mix."}
                          </p>
                          <span className="text-[9px] bg-zinc-800 text-violet-400 font-mono px-1.5 py-0.5 rounded mt-1.5 inline-block">
                            {tracksCount} {tracksCount === 1 ? "song" : "songs"}
                          </span>
                        </div>
                      </div>

                      {/* Quick play, detail redirect, deletion row */}
                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        {/* Export Playlists */}
                        {tracksCount > 0 && (
                          <>
                            <button
                              onClick={() => handleExportM3U(pl.name, pl.tracks)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer"
                              title="Export playlist as M3U"
                            >
                              <FileDown size={13} />
                            </button>
                            <button
                              onClick={() => handleExportZIP(pl.name, pl.tracks)}
                              disabled={isExportingZip !== null}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer disabled:opacity-50"
                              title="Export playlist as ZIP"
                            >
                              {isExportingZip === pl.name ? (
                                <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <FolderArchive size={13} />
                              )}
                            </button>
                          </>
                        )}

                        {/* Open Details */}
                        <button
                          onClick={() => {
                            setActiveTab("home");
                            onSelectPlaylist(pl);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer flex items-center gap-1"
                          title="Open playlist view details"
                        >
                          <ExternalLink size={13} />
                        </button>

                        {/* Delete playlist */}
                        {onDeletePlaylist && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the playlist "${pl.name}"?`)) {
                                onDeletePlaylist(pl.id);
                              }
                            }}
                            className="p-1.5 bg-zinc-800 hover:bg-red-950 text-zinc-500 hover:text-red-400 rounded transition cursor-pointer"
                            title="Delete playlist"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Panel 3: Downloaded Tracks List */}
        {(activeSubTab === "all" || activeSubTab === "downloaded") && (
          <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-5 flex flex-col h-[520px] min-h-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-violet-400" />
                <h3 className="text-base font-bold text-zinc-100">Downloaded Tracks</h3>
                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                  {downloadedTracks.length}
                </span>
              </div>

              {/* M3U & ZIP buttons for downloaded songs */}
              {downloadedTracks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleExportM3U("My Downloaded Songs", downloadedTracks)}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-violet-400 text-zinc-400 rounded transition cursor-pointer"
                    title="Export Downloads as M3U"
                  >
                    <FileDown size={14} />
                  </button>
                  <button
                    onClick={() => handleExportZIP("My Downloaded Songs", downloadedTracks)}
                    disabled={isExportingZip !== null}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-violet-400 text-zinc-400 rounded transition cursor-pointer disabled:opacity-50"
                    title="Export Downloads as ZIP of MP3s"
                  >
                    {isExportingZip === "My Downloaded Songs" ? (
                      <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <FolderArchive size={14} />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Quick search */}
            <div className="relative mb-3 shrink-0">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search downloaded songs..."
                value={downloadedSearch}
                onChange={(e) => setDownloadedSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition"
              />
            </div>

            {/* Bulk Selection Header Action Bar */}
            {downloadedTracks.length > 0 && (
              <div className="flex items-center justify-between gap-3 mb-3 bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/40 shrink-0">
                <label className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filteredDownloaded.length > 0 && filteredDownloaded.every(t => selectedDownloadIds.has(t.id))}
                    onChange={(e) => {
                      const newSelected = new Set(selectedDownloadIds);
                      if (e.target.checked) {
                        filteredDownloaded.forEach(t => newSelected.add(t.id));
                      } else {
                        filteredDownloaded.forEach(t => newSelected.delete(t.id));
                      }
                      setSelectedDownloadIds(newSelected);
                    }}
                    className="rounded bg-zinc-950 border-zinc-800 text-violet-500 focus:ring-violet-500/30 focus:ring-offset-0 focus:ring-2 w-3.5 h-3.5 cursor-pointer accent-violet-500"
                  />
                  <span>Select All</span>
                </label>
                
                {selectedDownloadIds.size > 0 && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {selectedDownloadIds.size} selected
                    </span>
                    <button
                      onClick={() => {
                        if (onDeleteDownloadedTracksBulk) {
                          const tracksToDelete = downloadedTracks.filter(t => selectedDownloadIds.has(t.id));
                          onDeleteDownloadedTracksBulk(tracksToDelete);
                          setSelectedDownloadIds(new Set());
                        }
                      }}
                      className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black text-[10px] font-bold px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer border border-red-500/20 hover:border-transparent"
                    >
                      <Trash2 size={11} />
                      <span>Delete Selected</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {filteredDownloaded.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600">
                  <Download size={36} className="opacity-15 mb-2" />
                  <p className="text-xs font-semibold">No offline tracks found.</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                    Click the Download icon on any track to save it offline for high-fidelity media export!
                  </p>
                </div>
              ) : (
                filteredDownloaded.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-all group ${
                        isCurrent 
                          ? "bg-violet-500/5 border border-violet-500/10" 
                          : "hover:bg-zinc-800/30 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Checkbox for Selection */}
                        <input
                          type="checkbox"
                          checked={selectedDownloadIds.has(track.id)}
                          onChange={() => {
                            const newSelected = new Set(selectedDownloadIds);
                            if (newSelected.has(track.id)) {
                              newSelected.delete(track.id);
                            } else {
                              newSelected.add(track.id);
                            }
                            setSelectedDownloadIds(newSelected);
                          }}
                          className="rounded bg-zinc-950 border-zinc-800 text-violet-500 focus:ring-violet-500/30 focus:ring-offset-0 focus:ring-2 w-3.5 h-3.5 cursor-pointer accent-violet-500 opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                        {/* Play/Index Button */}
                        <div className="w-8 h-8 rounded-md bg-zinc-800/50 flex items-center justify-center relative shrink-0 overflow-hidden">
                          <button
                            onClick={() => {
                              if (isCurrent) {
                                onPlayPauseToggle();
                              } else {
                                onTrackSelect(track, downloadedTracks);
                              }
                            }}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 text-violet-400 transition cursor-pointer"
                          >
                            {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                          </button>
                          
                          {isCurrent && isPlaying ? (
                            <div className="flex items-end gap-0.5 h-3">
                              <span className="w-0.5 h-3 bg-violet-400 animate-pulse"></span>
                              <span className="w-0.5 h-2 bg-violet-400 animate-pulse delay-75"></span>
                              <span className="w-0.5 h-3 bg-violet-400 animate-pulse delay-150"></span>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-medium text-zinc-500">{idx + 1}</span>
                          )}
                        </div>

                        {/* Text info */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isCurrent ? "text-violet-400" : "text-zinc-200"}`}>
                            {track.title}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            <span>{track.artist}</span> • <span className="font-mono">{track.duration}</span>
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pl-2">
                        {/* Unlike/Heart indicator */}
                        <button
                          onClick={() => onToggleLike(track)}
                          className={`p-1 text-zinc-500 hover:text-red-400 rounded transition cursor-pointer ${
                            likedTracks.some((t) => t.id === track.id) ? "text-red-500" : ""
                          }`}
                          title="Favorite track"
                        >
                          <Heart size={13} fill={likedTracks.some((t) => t.id === track.id) ? "currentColor" : "none"} />
                        </button>

                        {/* Delete/Trash Button */}
                        {onDeleteDownloadedTrack && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the downloaded song "${track.title}"?`)) {
                                onDeleteDownloadedTrack(track);
                              }
                            }}
                            className="p-1 text-zinc-500 hover:text-red-400 rounded transition cursor-pointer"
                            title="Delete offline file"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
