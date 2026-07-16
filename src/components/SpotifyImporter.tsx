import React, { useState } from "react";
import { Music, Loader2, Play, Plus, Heart, Check, Info, Download, Upload } from "lucide-react";
import { Track, Playlist } from "../types";
import { aeroFetch } from "../lib/api";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseCSV(text: string): { title: string; artist: string; album?: string; duration?: string; thumbnail?: string }[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  
  // Find column indices
  const titleAliases = ["track name", "title", "name", "trackname", "song"];
  const artistAliases = ["artist name(s)", "artist", "artistname", "artist name", "artists", "artist(s)"];
  const albumAliases = ["album name", "album", "collection"];
  const durationAliases = ["duration", "time", "length", "duration_ms", "durationms"];
  const coverAliases = ["image", "cover", "thumbnail", "art", "artwork", "imageurl", "coverurl"];
  
  const titleIdx = headers.findIndex(h => titleAliases.includes(h.toLowerCase().trim()));
  const artistIdx = headers.findIndex(h => artistAliases.includes(h.toLowerCase().trim()));
  const albumIdx = headers.findIndex(h => albumAliases.includes(h.toLowerCase().trim()));
  const durationIdx = headers.findIndex(h => durationAliases.includes(h.toLowerCase().trim()));
  const coverIdx = headers.findIndex(h => coverAliases.includes(h.toLowerCase().trim()));
  
  if (titleIdx === -1 || artistIdx === -1) {
    throw new Error("Could not find Title or Artist columns in CSV file.");
  }
  
  const tracks: { title: string; artist: string; album?: string; duration?: string; thumbnail?: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const title = cols[titleIdx] || "";
    const artist = cols[artistIdx] || "";
    if (title && artist) {
      const album = albumIdx !== -1 ? cols[albumIdx] : undefined;
      let duration = durationIdx !== -1 ? cols[durationIdx] : undefined;
      const thumbnail = coverIdx !== -1 ? cols[coverIdx] : undefined;
      
      if (duration && /^\d+$/.test(duration)) {
        const ms = parseInt(duration, 10);
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        duration = `${mins}:${String(secs).padStart(2, "0")}`;
      }
      
      tracks.push({ title, artist, album, duration, thumbnail });
    }
  }
  return tracks;
}

function parseJSON(text: string): { title: string; artist: string; album?: string; duration?: string; thumbnail?: string }[] {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : (data.tracks || data.items || []);
  if (!Array.isArray(items)) {
    throw new Error("Invalid JSON structure: expected an array of tracks.");
  }
  return items.map((item: any) => {
    const trackObj = item.track || item;
    const title = trackObj.title || trackObj.name || trackObj.trackName || trackObj.track_name;
    let artist = trackObj.artist || trackObj.artists || trackObj.artistName || trackObj.artist_name;
    if (Array.isArray(artist)) {
      artist = artist.map((a: any) => typeof a === 'string' ? a : (a.name || a.display_name)).join(", ");
    } else if (typeof artist === 'object' && artist !== null) {
      artist = artist.name || artist.display_name;
    }
    
    const album = trackObj.album?.name || trackObj.albumName || trackObj.album || (typeof trackObj.collectionName === 'string' ? trackObj.collectionName : undefined);
    
    let duration = trackObj.duration || trackObj.duration_ms || trackObj.durationms || trackObj.time || trackObj.length;
    if (duration && typeof duration === 'number') {
      const mins = Math.floor(duration / 60000);
      const secs = Math.floor((duration % 60000) / 1000);
      duration = `${mins}:${String(secs).padStart(2, "0")}`;
    }
    
    let thumbnail = trackObj.thumbnail || trackObj.image || trackObj.coverUrl || trackObj.cover_url || trackObj.artworkUrl100;
    if (!thumbnail && trackObj.album?.images && Array.isArray(trackObj.album.images) && trackObj.album.images.length > 0) {
      thumbnail = trackObj.album.images[0]?.url || trackObj.album.images[0]?.uri;
    }
    
    return {
      title: typeof title === 'string' ? title : "Unknown Title",
      artist: typeof artist === 'string' ? artist : "Unknown Artist",
      album: typeof album === 'string' ? album : undefined,
      duration: typeof duration === 'string' ? duration : undefined,
      thumbnail: typeof thumbnail === 'string' ? thumbnail : undefined,
    };
  }).filter(t => t.title !== "Unknown Title");
}

interface SpotifyImporterProps {
  onAddPlaylist: (playlist: Playlist) => void;
  onTrackSelect: (track: Track, context: Track[]) => void;
  likedTracks: Track[];
  onToggleLike: (track: Track) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumName: string, artistName: string, thumbnail?: string) => void;
  currentTrack?: Track | null;
}

export default function SpotifyImporter({
  onAddPlaylist,
  onTrackSelect,
  likedTracks,
  onToggleLike,
  downloadedTracks,
  onDownloadTrack,
  onArtistClick,
  onAlbumClick,
  currentTrack,
}: SpotifyImporterProps) {
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [importedPlaylist, setImportedPlaylist] = useState<Playlist | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [importNote, setImportNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  const processFile = (file: File) => {
    setFileError("");
    setLoading(true);
    setImportedPlaylist(null);
    setIsSaved(false);
    setImportNote("");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setFileError("Could not read file content.");
        setLoading(false);
        return;
      }

      try {
        let parsedTracks: { title: string; artist: string }[] = [];
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith(".csv")) {
          parsedTracks = parseCSV(text);
        } else if (fileName.endsWith(".json")) {
          parsedTracks = parseJSON(text);
        } else {
          throw new Error("Unsupported file format. Please upload a .csv or .json file.");
        }

        if (parsedTracks.length === 0) {
          throw new Error("No tracks found in the uploaded file.");
        }

        setStatusText(`Resolving ${parsedTracks.length} tracks using AeroAI...`);

        const playlistName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        const response = await aeroFetch("/api/import-tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlistName, tracks: parsedTracks }),
        });

        const data = await response.json();
        if (data.success && data.tracks && data.tracks.length > 0) {
          const newPlaylist: Playlist = {
            id: `spotify-file-${Date.now()}`,
            name: data.playlistName || "Imported Playlist",
            description: `Imported from ${file.name} containing ${data.tracks.length} matched tracks.`,
            tracks: data.tracks,
            coverUrl: data.tracks[0]?.thumbnail || ""
          };
          setImportedPlaylist(newPlaylist);
        } else {
          setFileError(data.error || "Failed to resolve tracks on the server.");
        }
      } catch (err: any) {
        setFileError(err.message || "An error occurred while parsing the file.");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setFileError("Failed to read file.");
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSaveToLibrary = () => {
    if (!importedPlaylist) return;
    onAddPlaylist(importedPlaylist);
    setIsSaved(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 text-zinc-100 p-6 md:p-10 custom-scrollbar font-sans relative">
      
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

      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in relative z-10">
        
        {/* Header */}
        <div className="border-b border-zinc-900 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-violet-500/10 text-violet-400 p-2.5 rounded-2xl border border-violet-500/20">
              <Upload size={24} className="stroke-[2.5]" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">Spotify Playlist Importer</h1>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Upload your Spotify playlist CSV or JSON files to dynamically resolve track details and add them directly to your playable AeroMusic Library. This allows you to import playlists of any size (even up to 10,000 tracks) without Spotify API limits.
          </p>
        </div>

        {/* File Importer */}
        <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Upload size={16} className="text-violet-400" />
              Import via CSV / JSON File
            </h3>
            <p className="text-xs text-zinc-400">
              Exported a playlist with over 100 tracks? Drop your playlist CSV (e.g. from <strong><a href="https://exportify.net" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Exportify</a></strong>) or JSON file here to resolve all tracks instantly.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? "border-violet-500 bg-violet-500/5 text-violet-300"
                : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-zinc-400"
            }`}
            onClick={() => document.getElementById("playlist-file-input")?.click()}
          >
            <input
              type="file"
              id="playlist-file-input"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
            />
            <div className="bg-zinc-900 p-3 rounded-2xl border border-zinc-800 text-zinc-300">
              <Upload size={24} className="stroke-[2]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-200">
                Click to upload or drag & drop playlist file
              </p>
              <p className="text-[10px] text-zinc-500 font-mono">
                Supports CSV (Exportify, Soundiiz) and JSON formats
              </p>
            </div>
          </div>
          
          {loading && (
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-4 mt-3 flex items-center gap-3 animate-pulse">
              <Loader2 size={18} className="animate-spin text-violet-400 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-violet-400 font-mono uppercase tracking-wider">AeroAI Stream Mapping Active</p>
                <p className="text-xs text-zinc-400">{statusText}</p>
              </div>
            </div>
          )}
          
          {fileError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-3 text-xs text-red-400 flex items-center gap-2">
              <span className="font-extrabold">✕</span>
              <span>{fileError}</span>
            </div>
          )}
        </section>

        {/* Imported Results Panel */}
        {importedPlaylist && (
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Playlist Hero Header */}
            <div className="p-6 md:p-8 bg-gradient-to-b from-violet-500/10 to-transparent border-b border-zinc-900 flex flex-col sm:flex-row gap-6 items-center sm:items-end">
              <div className="w-36 h-36 md:w-44 md:h-44 bg-zinc-800 rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/30 shrink-0 flex items-center justify-center">
                {importedPlaylist.coverUrl ? (
                  <img
                    src={importedPlaylist.coverUrl}
                    alt={importedPlaylist.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Music size={48} className="text-zinc-600" />
                )}
              </div>
              <div className="space-y-2 text-center sm:text-left">
                <span className="text-[10px] font-mono font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Spotify Web Grounded Convert Successful
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">
                  {importedPlaylist.name}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
                  {importedPlaylist.description}
                </p>
                <div className="flex items-center gap-4 justify-center sm:justify-start pt-2">
                  <button
                    onClick={() => onTrackSelect(importedPlaylist.tracks[0], importedPlaylist.tracks)}
                    className="bg-white hover:bg-zinc-100 text-black font-bold px-6 py-2.5 rounded-full transition shadow flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <Play size={16} fill="black" />
                    Play Playlist
                  </button>
                  <button
                    onClick={handleSaveToLibrary}
                    disabled={isSaved}
                    className={`font-semibold px-6 py-2.5 rounded-full transition text-sm flex items-center gap-1.5 cursor-pointer ${
                      isSaved
                        ? "bg-zinc-800 border border-zinc-700 text-violet-400 cursor-default"
                        : "bg-violet-500 hover:bg-violet-400 text-black"
                    }`}
                  >
                    {isSaved ? (
                      <>
                        <Check size={16} />
                        Saved to Sidebar
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        Add to Sidebar Playlists
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {importNote && (
              <div className="mx-6 mt-6 bg-violet-500/5 border border-violet-500/10 rounded-xl p-3.5 text-xs text-violet-400/90 leading-relaxed">
                <span className="font-extrabold block mb-0.5 font-mono uppercase tracking-wider text-[10px] text-violet-400">Notice</span>
                {importNote}
              </div>
            )}

            {/* Track List Table */}
            <div className="p-4 md:p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm text-zinc-400">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-mono font-bold tracking-wider uppercase text-zinc-500">
                      <th className="py-3 px-3 w-12 text-center">#</th>
                      <th className="py-3 px-3">Title</th>
                      <th className="py-3 px-3 hidden md:table-cell">Album</th>
                      <th className="py-3 px-3 hidden sm:table-cell">Duration</th>
                      <th className="py-3 px-3 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedPlaylist.tracks.map((track, idx) => {
                      const isLiked = likedTracks.some((t) => t.id === track.id);
                      return (
                        <tr
                          key={track.id}
                          className="border-b border-zinc-900/50 hover:bg-zinc-900/40 group transition-colors"
                        >
                          {/* Number / Play Button */}
                          <td className="py-3.5 px-3 text-center font-mono text-zinc-500 font-semibold group-hover:text-violet-400 transition-colors">
                            <span className="group-hover:hidden">{idx + 1}</span>
                            <button
                              onClick={() => onTrackSelect(track, importedPlaylist.tracks)}
                              className="hidden group-hover:inline-block text-violet-400 cursor-pointer hover:scale-110 transition"
                            >
                              <Play size={12} fill="currentColor" />
                            </button>
                          </td>

                          {/* Cover, Title & Artist */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-zinc-800 rounded overflow-hidden shrink-0 border border-zinc-800 flex items-center justify-center">
                                {track.thumbnail ? (
                                  <img
                                    src={track.thumbnail}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : null}
                                {!track.thumbnail && <Music size={14} className="text-zinc-600" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-zinc-100 truncate group-hover:text-violet-400 transition-colors">
                                  {track.title}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">
                                  <span 
                                    onClick={() => onArtistClick && onArtistClick(track.artist)}
                                    className="hover:underline cursor-pointer hover:text-zinc-300 transition"
                                  >
                                    {track.artist}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Album name */}
                          <td className="py-3.5 px-3 hidden md:table-cell text-zinc-500 truncate max-w-[150px]">
                            <span 
                              onClick={() => onAlbumClick && onAlbumClick(track.album || "Single", track.artist, track.thumbnail)}
                              className="hover:underline cursor-pointer hover:text-zinc-300 transition"
                            >
                              {track.album}
                            </span>
                          </td>

                          {/* Duration */}
                          <td className="py-3.5 px-3 hidden sm:table-cell font-mono text-xs text-zinc-500">
                            {track.duration}
                          </td>

                          {/* Favorite / Action buttons */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => onToggleLike(track)}
                                className={`transition p-1.5 rounded hover:bg-zinc-800 cursor-pointer ${
                                  isLiked ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
                                }`}
                                title={isLiked ? "Unlike Song" : "Like Song"}
                              >
                                <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
                              </button>
                              <button
                                onClick={() => onDownloadTrack(track)}
                                className={`transition p-1.5 rounded hover:bg-zinc-800 cursor-pointer ${
                                  downloadedTracks.some((t) => t.id === track.id)
                                    ? "text-violet-400"
                                    : "text-zinc-500 hover:text-zinc-300"
                                }`}
                                title={downloadedTracks.some((t) => t.id === track.id) ? "Downloaded" : "Download MP3"}
                              >
                                {downloadedTracks.some((t) => t.id === track.id) ? (
                                  <Check size={14} className="stroke-[3]" />
                                ) : (
                                  <Download size={14} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Informative Footer */}
        <div className="bg-zinc-900/20 rounded-xl p-4 border border-zinc-900/60 flex gap-3 text-xs text-zinc-500 leading-relaxed">
          <Info size={16} className="text-violet-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-zinc-400">Continuous Sync Architecture</p>
            <p>
              When playing songs imported via Spotify, AeroMusic dynamically converts stream definitions server-side. Playback is optimized for both desktop web views and high-performance standalone Android builds.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
