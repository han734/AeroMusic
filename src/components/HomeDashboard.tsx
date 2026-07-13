import { useState, useEffect } from "react";
import { Play, Pause, Heart, Clock, Music, Sparkles, Download, Check, Trash2, TrendingUp, Globe, MapPin, Compass, Flame, FolderArchive, FileDown, CheckCircle, Radio, Camera, Sliders, Volume2, Zap, Layers, RefreshCw, ExternalLink, Lock, Unlock } from "lucide-react";
import JSZip from "jszip";
import { Track, Playlist } from "../types";
import { aeroFetch, saveApiBaseUrl, getPlaceholderUrl } from "../lib/api";
import AuthPanel from "./AuthPanel";

interface EQSliders {
  hz60: number;
  hz230: number;
  hz910: number;
  hz4k: number;
  hz14k: number;
}

const PRESETS: Record<string, EQSliders> = {
  flat: { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 },
  bass: { hz60: 8, hz230: 5, hz910: 1, hz4k: 0, hz14k: -2 },
  acoustic: { hz60: 2, hz230: 1, hz910: 3, hz4k: 4, hz14k: 5 },
  electronic: { hz60: 6, hz230: 2, hz910: -1, hz4k: 3, hz14k: 6 },
  classical: { hz60: 4, hz230: 3, hz910: 1, hz4k: 2, hz14k: 4 },
  vocal: { hz60: -3, hz230: -1, hz910: 4, hz4k: 5, hz14k: 2 }
};


interface HomeDashboardProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, tracksContext: Track[]) => void;
  onPlayPauseToggle: () => void;
  catalog: Track[];
  selectedPlaylist: Playlist | null;
  likedTracks: Track[];
  onToggleLike: (track: Track) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  setActiveTab: (tab: string) => void;
  downloadedTracks: Track[];
  onDownloadTrack: (track: Track) => void;
  onDeleteDownloadedTrack?: (track: Track) => void;
  onDownloadTracksBulk?: (tracks: Track[], sourceName: string) => void;
  playlists: Playlist[];
  newReleases: Track[];
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumName: string, artistName: string, thumbnail?: string) => void;
  currentUser: { username: string; avatar: string } | null;
  onLogout: () => void;
}

export default function HomeDashboard({
  currentTrack,
  isPlaying,
  onTrackSelect,
  onPlayPauseToggle,
  catalog,
  selectedPlaylist,
  likedTracks,
  onToggleLike,
  onSelectPlaylist,
  setActiveTab,
  downloadedTracks,
  onDownloadTrack,
  onDeleteDownloadedTrack,
  onDownloadTracksBulk,
  playlists,
  newReleases,
  onArtistClick,
  onAlbumClick,
  currentUser,
  onLogout,
}: HomeDashboardProps) {
  const [exploreTab, setExploreTab] = useState<"charts" | "artists" | "genres" | "languages" | "suggestions">("charts");
  const [isExportingZip, setIsExportingZip] = useState<string | null>(null);
  const [activeHeroIdx, setActiveHeroIdx] = useState(0);
  const [showAllCategory, setShowAllCategory] = useState<string | null>(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [privateSession, setPrivateSession] = useState<boolean>(() => localStorage.getItem("aero-private-session") === "true");
  const [eqEnabled, setEqEnabled] = useState<boolean>(true);
  const [eqPreset, setEqPreset] = useState<string>("flat");
  const [sliders, setSliders] = useState<EQSliders>({
    hz60: 0,
    hz230: 0,
    hz910: 0,
    hz4k: 0,
    hz14k: 0
  });
  const [crossfade, setCrossfade] = useState<number>(4);
  const [audioQuality, setAudioQuality] = useState<string>("high");
  const [downloadQuality, setDownloadQuality] = useState<string>("ultra");
  const [apiEndpoint, setApiEndpoint] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Load settings on mount
  useEffect(() => {
    try {
      const storedEqEnabled = localStorage.getItem("setting-eq-enabled");
      if (storedEqEnabled !== null) setEqEnabled(storedEqEnabled === "true");

      const storedEqPreset = localStorage.getItem("setting-eq-preset");
      if (storedEqPreset) setEqPreset(storedEqPreset);

      const storedSliders = localStorage.getItem("setting-eq-sliders");
      if (storedSliders) setSliders(JSON.parse(storedSliders));

      const storedCrossfade = localStorage.getItem("setting-crossfade");
      if (storedCrossfade) setCrossfade(parseInt(storedCrossfade, 10));

      const storedAudioQ = localStorage.getItem("setting-audio-quality");
      if (storedAudioQ) setAudioQuality(storedAudioQ);

      const storedDownloadQ = localStorage.getItem("setting-download-quality");
      if (storedDownloadQ) setDownloadQuality(storedDownloadQ);

      setApiEndpoint(localStorage.getItem("aero-api-endpoint") || "");
    } catch (e) {
      console.warn("Failed to load settings in HomeDashboard:", e);
    }
  }, []);

  const saveSettings = (key: string, value: any) => {
    try {
      localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      // Dispatch custom event to notify player instantly
      window.dispatchEvent(new Event("aero-settings-updated"));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSliderChange = (band: keyof EQSliders, val: number) => {
    const updated = { ...sliders, [band]: val };
    setSliders(updated);
    saveSettings("setting-eq-sliders", updated);
    // Custom presets are no longer flat/bass/etc
    setEqPreset("custom");
    saveSettings("setting-eq-preset", "custom");
  };

  const handlePresetChange = (presetName: string) => {
    setEqPreset(presetName);
    saveSettings("setting-eq-preset", presetName);
    if (PRESETS[presetName]) {
      const presetValues = PRESETS[presetName];
      setSliders(presetValues);
      saveSettings("setting-eq-sliders", presetValues);
    }
  };

  const handleSaveApiEndpoint = () => {
    saveApiBaseUrl(apiEndpoint);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    window.dispatchEvent(new Event("aero-settings-updated"));
  };

  const getDaylistSubtitle = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "Here's some energetic morning synthpop, acoustic ambient, and motivational indie beats.";
    }
    if (hour >= 12 && hour < 17) {
      return "Bright pop, upbeat Tamil hits, and high-energy workout vibes for your afternoon.";
    }
    return "Chill late-night lofi, independent Tamil melodies, and peaceful acoustics for your evening.";
  };

  const getNewMusicFridayHeader = (date: Date) => {
    const day = date.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
    if (day === 5) return "It's New Music Friday!";
    if (day === 6 || day === 0) return "Weekend Playlist Radar";
    if (day === 1) return "Monday Motivation Radar";
    return "Fresh Mid-Week Beats";
  };

  const getPersonalizedSectionTitle = (date: Date) => {
    const month = date.getMonth(); // 0-indexed
    const day = date.getDate();
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const hour = date.getHours();
    
    let timeOfDay = "evening";
    if (hour >= 5 && hour < 12) timeOfDay = "morning";
    else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
    else if (hour >= 17 && hour < 22) timeOfDay = "evening";
    else timeOfDay = "night";

    // --- Special Calendar Dates (Major, Minor Days & Founder's Birthday) ---
    if (month === 0 && day === 1) return "Ring in the New Year 🎆";
    if (month === 1 && day === 14) return "Valentine's Love Anthems ❤️";
    if (month === 2 && day === 3) return "Color your day with Holi beats 🎨";
    if (month === 3 && day === 22) return "Acoustic vibes for Earth Day 🌍";
    if (month === 4 && day === 13) return "Happy Birthday to our Founder! 🎂🎈";
    if (month === 5 && day === 21) return "Celebrate World Music Day 🎵";
    if (month === 6 && day === 1) return "Calculated beats for Chartered Accountants 📊";
    if (month === 8 && day === 5) return "Inspiring tunes for Teachers 📚";
    if (month === 8 && day === 15) return "Innovative logic beats for Engineers 🛠️";
    if (month === 9 && day === 31) return "Spooky Halloween Beats 🎃";
    if (month === 10 && day === 8) return "Light up your Diwali 🪔";
    if (month === 10 && day === 9) return "Diwali Celebrations Fresh Mix 🪔";
    if (month === 11 && (day === 24 || day === 25)) return "Festive Christmas Melodies 🎄";
    if (month === 11 && day === 31) return "Count down to 2027 🥂";

    return `Soundtrack your ${dayName} ${timeOfDay}`;
  };

  // Shared async helpers for fetching tracks from the live database
  const fetchCuratedTracks = async (query: string, limit = 25) => {
    try {
      const res = await aeroFetch(`/api/curated?query=${encodeURIComponent(query)}&limit=${limit}`);
      const data = await res.json();
      return data.success ? data.tracks : [];
    } catch (e) {
      console.warn(`Failed to fetch curated query ${query}:`, e);
      return [];
    }
  };

  const fetchChartTracks = async (country: string, limit = 30) => {
    try {
      const res = await aeroFetch(`/api/charts?country=${country}&limit=${limit}`);
      const data = await res.json();
      return data.success ? data.tracks : [];
    } catch (e) {
      console.warn(`Failed to fetch chart country ${country}:`, e);
      return [];
    }
  };

  const fetchPersonalizedTracks = async (limit = 30) => {
    try {
      const res = await aeroFetch("/api/recommendations/personalized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likedTracks, currentTrack, limit })
      });
      const data = await res.json();
      return data.success ? data.tracks : [];
    } catch (e) {
      console.warn("Failed to fetch personalized tracks:", e);
      return [];
    }
  };

  // Synchronize dynamic playlists regularly and personalize them based on current track
  const syncPlaylist = async (playlistId: string) => {
    let tracks: Track[] = [];
    switch (playlistId) {
      case "friday-new-releases":
        tracks = newReleases;
        break;
      case "global-top-50":
        tracks = await fetchChartTracks("us", 50);
        break;
      case "global-viral-50":
        const tempTracks = await fetchChartTracks("us", 40);
        tracks = [...tempTracks].reverse();
        break;
      case "aero-top-20":
        tracks = catalog.slice(0, 20);
        break;
      case "country-usa":
        tracks = await fetchChartTracks("us", 30);
        break;
      case "country-uk":
        tracks = await fetchChartTracks("gb", 30);
        break;
      case "country-india":
        tracks = await fetchChartTracks("in", 30);
        break;
      case "country-japan":
        tracks = await fetchChartTracks("jp", 30);
        break;
      case "country-france":
        tracks = await fetchChartTracks("fr", 30);
        break;

      // Artist Curated Playlists
      case "artist-taylor-swift":
        tracks = await fetchCuratedTracks("Taylor Swift", 30);
        break;
      case "artist-billie-eilish":
        tracks = await fetchCuratedTracks("Billie Eilish", 30);
        break;
      case "artist-sabrina-carpenter":
        tracks = await fetchCuratedTracks("Sabrina Carpenter", 30);
        break;
      case "artist-bts":
        tracks = await fetchCuratedTracks("BTS", 30);
        break;
      case "artist-arijit-singh":
        tracks = await fetchCuratedTracks("Arijit Singh", 30);
        break;
      case "artist-queen":
        tracks = await fetchCuratedTracks("Queen", 30);
        break;
      case "artist-yoasobi":
        tracks = await fetchCuratedTracks("YOASOBI", 30);
        break;

      // Genre Playlists
      case "genre-pop":
        tracks = await fetchCuratedTracks("Pop Hits", 30);
        break;
      case "genre-rock":
        tracks = await fetchCuratedTracks("Rock Classics", 30);
        break;
      case "genre-hiphop":
        tracks = await fetchCuratedTracks("Hip Hop", 30);
        break;
      case "genre-edm":
        tracks = await fetchCuratedTracks("EDM", 30);
        break;
      case "genre-lofi":
        tracks = await fetchCuratedTracks("Lofi Beats", 30);
        break;

      // Language Playlists
      case "lang-english":
        tracks = await fetchCuratedTracks("Billboard Hits", 30);
        break;
      case "lang-spanish":
        tracks = await fetchCuratedTracks("Latin Hits", 30);
        break;
      case "lang-kpop":
        tracks = await fetchCuratedTracks("K-Pop", 30);
        break;
      case "lang-jpop":
        tracks = await fetchCuratedTracks("J-Pop", 30);
        break;
      case "lang-hindi":
        tracks = await fetchCuratedTracks("Bollywood Hits", 30);
        break;
      case "lang-tamil":
        tracks = await fetchCuratedTracks("Tamil Hits", 30);
        break;
      case "lang-telugu":
        tracks = await fetchCuratedTracks("Telugu Hits", 30);
        break;
      case "lang-malayalam":
        tracks = await fetchCuratedTracks("Malayalam Hits", 30);
        break;

      // Personal Playlists
      case "made-discover-weekly":
        tracks = await fetchPersonalizedTracks(30);
        break;
      case "made-daily-mix-1":
        tracks = await fetchPersonalizedTracks(20);
        break;
      case "made-daily-mix-2":
        const tempRecs = await fetchPersonalizedTracks(25);
        tracks = tempRecs.slice(0, 20);
        break;
      case "made-release-radar":
        tracks = newReleases.slice(0, 20);
        break;
      default:
        return; // Don't sync static collections like Liked or Downloaded
    }

    if (tracks.length > 0 && selectedPlaylist) {
      onSelectPlaylist({
        ...selectedPlaylist,
        tracks
      });
    }
  };

  // Re-sync selected playlist when current track changes (reactive personalization)
  useEffect(() => {
    if (selectedPlaylist && selectedPlaylist.id !== "liked-songs" && selectedPlaylist.id !== "downloaded-songs") {
      syncPlaylist(selectedPlaylist.id);
    }
  }, [currentTrack]);

  // Regular periodic sync every 45 seconds to keep playlist fresh from the live database
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedPlaylist && selectedPlaylist.id !== "liked-songs" && selectedPlaylist.id !== "downloaded-songs") {
        console.log(`Auto-syncing playlist "${selectedPlaylist.name}"...`);
        syncPlaylist(selectedPlaylist.id);
      }
    }, 45000);
    return () => clearInterval(timer);
  }, [selectedPlaylist]);

  const handleExportM3U = (playlistName: string, tracks: Track[]) => {
    if (tracks.length === 0) {
      alert("This playlist has no tracks to export.");
      return;
    }
    let m3uContent = "#EXTM3U\n";
    tracks.forEach((track) => {
      const parts = track.duration.split(":").map(Number);
      const durationSec = parts.length === 2 ? parts[0] * 60 + parts[1] : 180;
      m3uContent += `#EXTINF:${durationSec},${track.artist} - ${track.title}\n`;
      m3uContent += `${track.artist} - ${track.title}.mp3\n`;
    });

    const blob = new Blob([m3uContent], { type: "text/m3u" });
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
      alert("This playlist has no tracks to export.");
      return;
    }

    setIsExportingZip(playlistName);
    try {
      const zip = new JSZip();
      const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      // 1. Human-readable tracklist
      let tracklist = `AeroMusic Playlist Export\n`;
      tracklist += `Playlist: ${playlistName}\n`;
      tracklist += `Exported: ${date}\n`;
      tracklist += `Total Tracks: ${tracks.length}\n`;
      tracklist += `${"-".repeat(60)}\n\n`;
      tracks.forEach((t, i) => {
        tracklist += `${String(i + 1).padStart(3, " ")}. ${t.title}\n`;
        tracklist += `      Artist : ${t.artist}\n`;
        tracklist += `      Album  : ${t.album || "—"}\n`;
        tracklist += `      Genre  : ${t.genre || "—"}\n`;
        tracklist += `      Length : ${t.duration || "—"}\n\n`;
      });
      zip.file("tracklist.txt", tracklist);

      // 2. M3U playlist (importable into VLC, Winamp, foobar2000, etc.)
      let m3u = "#EXTM3U\n";
      m3u += `#PLAYLIST:${playlistName}\n\n`;
      tracks.forEach((t) => {
        const parts = (t.duration || "3:30").split(":").map(Number);
        const secs = parts.length === 2 ? parts[0] * 60 + parts[1] : 210;
        m3u += `#EXTINF:${secs},${t.artist} - ${t.title}\n`;
        m3u += `# Search: ${t.artist} ${t.title} on YouTube\n`;
        m3u += `${t.artist} - ${t.title}.mp3\n\n`;
      });
      zip.file("playlist.m3u", m3u);

      // 3. README
      const readme = [
        `AeroMusic Offline Bundle — "${playlistName}"`,
        `Exported on ${date}`,
        "",
        "Contents:",
        "  tracklist.txt  — Full song list with artist, album and duration info",
        "  playlist.m3u   — Import this into VLC, foobar2000, Winamp or any media player",
        "",
        "Note: AeroMusic streams music live via YouTube. To get actual MP3 files,",
        "use a tool like yt-dlp or Soundiiz with the tracklist above.",
        "",
        `Total: ${tracks.length} tracks`,
      ].join("\n");
      zip.file("README.txt", readme);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9_-]/gi, "_")}_playlist.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zipping failed:", err);
      alert("Failed to compile ZIP archive.");
    } finally {
      setIsExportingZip(null);
    }
  };

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const handleSelectCurated = async (id: string) => {
    let name = "Curated Selection";
    let description = "Expertly mixed and calibrated sounds.";
    let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";
    let tracks: Track[] = [];

    switch (id) {
      case "friday-new-releases":
        name = "Friday New Releases";
        description = "The top 50 new music releases, updated fresh every Friday.";
        coverUrl = newReleases[0]?.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300";
        tracks = newReleases;
        break;
      case "nmf-india":
        name = "New Music Friday India";
        description = "The absolute latest and hottest new music releases from across India — Bollywood, Punjabi, Tamil, and more.";
        coverUrl = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300";
        try {
          const nmfRes = await aeroFetch("/api/new-releases-india");
          const nmfData = await nmfRes.json();
          tracks = nmfData.success ? nmfData.tracks : [];
        } catch { tracks = []; }
        break;
      case "nmf-release-radar":
      case "nmf-global":
        name = "Release Radar";
        description = "The freshest global releases — top songs from US, UK, Australia and Canada right now.";
        coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300";
        try {
          const grRes = await aeroFetch("/api/new-releases-global");
          const grData = await grRes.json();
          tracks = grData.success ? grData.tracks : newReleases.slice(0, 30);
        } catch { tracks = newReleases.slice(0, 30); }
        break;
      case "nmf-love-tamil":
        name = "Latest Love Tamil தமிழ்";
        description = "The ultimate romance compilation featuring the newest love tracks from Kollywood.";
        coverUrl = "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300";
        tracks = await fetchCuratedTracks("Tamil Love", 30);
        break;
      case "nmf-tamil":
        name = "Latest Tamil தமிழ்";
        description = "Fresh sounds and new releases from Kollywood, straight off the mixing board.";
        coverUrl = "https://images.unsplash.com/photo-1608976328267-e673d3ec06ce?w=300";
        tracks = await fetchCuratedTracks("Tamil Hits", 35);
        break;
      case "nmf-malayalam":
        name = "Latest Malayalam";
        description = "Freshly compiled Malayalam cinema hits, indie discoveries, and melodic tunes.";
        coverUrl = "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300";
        tracks = await fetchCuratedTracks("Malayalam Hits", 30);
        break;
      case "daylist":
        name = "daylist";
        description = getDaylistSubtitle();
        coverUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300";
        const tamilIndie = await fetchCuratedTracks("Tamil Indie", 15);
        const acousticBeats = await fetchCuratedTracks("Acoustic Ambient", 15);
        tracks = [...tamilIndie, ...acousticBeats].sort(() => Math.random() - 0.5);
        break;
      case "mix-hype":
        name = "Hype Motivation Mix";
        description = "High energy, pulse-pounding tracks to elevate your performance.";
        coverUrl = "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300";
        tracks = await fetchCuratedTracks("Workout Motivation", 30);
        break;
      case "mix-quiet":
        name = "Quiet Mix";
        description = "Relaxing acoustic tunes, down-tempos, and soft lofi beats for focused minds.";
        coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300";
        tracks = await fetchCuratedTracks("Quiet Lofi Study", 30);
        break;
      case "mix-workout":
        name = "Fun Workout Mix";
        description = "Uplifting EDM, house, and high-tempo pop rhythms to power your workout.";
        coverUrl = "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300";
        tracks = await fetchCuratedTracks("Workout EDM", 30);
        break;
      case "mix-soft":
        name = "Soft Mix";
        description = "A gentle soundtrack of warm indie acoustics and quiet vocals for your evening.";
        coverUrl = "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300";
        tracks = await fetchCuratedTracks("Soft Acoustic", 30);
        break;
      case "global-top-50":
        name = "Global Top 50";
        description = "Your weekly guide to the most played songs in the world.";
        coverUrl = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("us", 50);
        break;
      case "global-viral-50":
      case "chart-viral":
        name = "Viral 50 - Global";
        description = "The most shared and talked-about tracks on the planet.";
        coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop";
        const tempTracks = await fetchChartTracks("us", 40);
        tracks = [...tempTracks].reverse();
        break;
      case "aero-top-20":
        name = "Aero Premium Top 20";
        description = "Listen to the tracks delivering the absolute highest bit depths and soundstage.";
        coverUrl = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop";
        tracks = catalog.slice(0, 20);
        break;
      case "country-usa":
      case "chart-billboard":
        name = "Top Songs - United States";
        description = "Billboard chart leaders, stadium anthems, and the current sounds of America.";
        coverUrl = "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("us", 30);
        break;
      case "country-uk":
        name = "Top Songs - United Kingdom";
        description = "Indie hits, rock legends, and electronic beats leading the charts in the UK.";
        coverUrl = "https://images.unsplash.com/photo-1513829096999-4978602297f7?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("gb", 30);
        break;
      case "country-india":
      case "chart-india":
        name = "Top Songs - India";
        description = "Desi chart leaders, Bollywood tunes, and regional hits.";
        coverUrl = "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("in", 30);
        break;
      case "country-japan":
        name = "Top Songs - Japan";
        description = "Vibrant synth chords, vintage drum loops, and Tokyo night driving soundscapes.";
        coverUrl = "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("jp", 30);
        break;
      case "country-france":
        name = "Top Songs - France";
        description = "Chic Paris house, energetic synthesizers, and French Riviera beats.";
        coverUrl = "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300&h=300&fit=crop";
        tracks = await fetchChartTracks("fr", 30);
        break;

      // Artist Curated Playlists
      case "artist-taylor-swift":
        name = "Taylor Swift Essentials";
        description = "The absolute best of Taylor Swift, spanning her entire discography from country to synthpop.";
        coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300";
        tracks = await fetchCuratedTracks("Taylor Swift", 30);
        break;
      case "artist-billie-eilish":
        name = "Billie Eilish Essentials";
        description = "Immersive and atmospheric masterpieces from the iconic Billie Eilish.";
        coverUrl = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300";
        tracks = await fetchCuratedTracks("Billie Eilish", 30);
        break;
      case "artist-sabrina-carpenter":
        name = "Sabrina Carpenter Essentials";
        description = "Sparkling pop hooks and vocal performances by Sabrina Carpenter.";
        coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";
        tracks = await fetchCuratedTracks("Sabrina Carpenter", 30);
        break;
      case "artist-bts":
        name = "BTS Gold Collection";
        description = "The global K-Pop phenomenon's most popular tracks and record-breaking hits.";
        coverUrl = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300";
        tracks = await fetchCuratedTracks("BTS", 30);
        break;
      case "artist-arijit-singh":
        name = "Best of Arijit Singh";
        description = "Beautiful Indian love ballads and soulful vocal performances from Arijit Singh.";
        coverUrl = "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=300";
        tracks = await fetchCuratedTracks("Arijit Singh", 30);
        break;
      case "artist-queen":
        name = "Queen Rock Anthems";
        description = "Classic rock masterpieces and stadium anthems from Freddie Mercury and Queen.";
        coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";
        tracks = await fetchCuratedTracks("Queen", 30);
        break;
      case "artist-yoasobi":
        name = "YOASOBI Essentials";
        description = "Vibrant J-Pop songs and fast-tempo anime themes from the dynamic duo YOASOBI.";
        coverUrl = "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=300";
        tracks = await fetchCuratedTracks("YOASOBI", 30);
        break;

      // Genre Playlists
      case "genre-pop":
        name = "Pop Hits";
        description = "Top pop anthems and high-energy radio chart leaders.";
        coverUrl = "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300";
        tracks = await fetchCuratedTracks("Pop Hits", 30);
        break;
      case "genre-rock":
        name = "Rock Legends";
        description = "Driving guitars, heavy drums, and legendary rock-and-roll anthems.";
        coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";
        tracks = await fetchCuratedTracks("Rock Classics", 30);
        break;
      case "genre-hiphop":
        name = "Hip-Hop & Rap";
        description = "Hard beats, rich bass, and top flows from the rap charts.";
        coverUrl = "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300";
        tracks = await fetchCuratedTracks("Hip Hop", 30);
        break;
      case "genre-edm":
        name = "Electronic Dance (EDM)";
        description = "Pulsating synths, festival drops, and progressive house rhythms.";
        coverUrl = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300";
        tracks = await fetchCuratedTracks("EDM", 30);
        break;
      case "genre-lofi":
        name = "Midnight Lo-Fi";
        description = "Relax, study, or wind down with dusty beats, smooth jazz chords, and cozy vinyl crackles.";
        coverUrl = "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=300&h=300&fit=crop";
        tracks = await fetchCuratedTracks("Lofi Beats", 30);
        break;

      // Language Playlists
      case "lang-english":
        name = "Global English Hits";
        description = "The hottest English pop, rock, and urban hits leading the Billboard charts.";
        coverUrl = "https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300";
        tracks = await fetchCuratedTracks("Billboard Hits", 30);
        break;
      case "lang-spanish":
        name = "Spanish & Latin Vibes";
        description = "Reggaeton, salsa, and latin pop rhythms that are taking over the world.";
        coverUrl = "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300";
        tracks = await fetchCuratedTracks("Latin Hits", 30);
        break;
      case "lang-kpop":
        name = "K-Pop Spotlight";
        description = "The most popular tracks and high-energy choreographic hits from Seoul.";
        coverUrl = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300";
        tracks = await fetchCuratedTracks("K-Pop", 30);
        break;
      case "lang-jpop":
        name = "J-Pop & Anime Classics";
        description = "Energetic anime openings, vocaloid themes, and city pop driving tracks.";
        coverUrl = "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=300";
        tracks = await fetchCuratedTracks("J-Pop", 30);
        break;
      case "lang-hindi":
      case "latest-hindi":
        name = "Hindi & Bollywood Anthems";
        description = "Top romantic ballads, cinematic tracks, and Indian pop classics.";
        coverUrl = "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=300";
        tracks = await fetchCuratedTracks("Bollywood Hits", 30);
        break;
      case "lang-tamil":
      case "latest-tamil":
        name = "Tamil Top Hits";
        description = "Latest Kollywood hits, romantic numbers, and high-energy Tamil beats.";
        coverUrl = "https://images.unsplash.com/photo-1608976328267-e673d3ec06ce?w=300";
        tracks = await fetchCuratedTracks("Tamil Hits", 30);
        break;
      case "lang-telugu":
        name = "Telugu Top Hits";
        description = "Billboard hits, commercial blockbusters, and melodious Telugu tracks.";
        coverUrl = "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300";
        tracks = await fetchCuratedTracks("Telugu Hits", 30);
        break;
      case "lang-malayalam":
      case "latest-malayalam":
        name = "Malayalam Top Hits";
        description = "Symphonic melodies, indie tracks, and popular cinema scores from Kerala.";
        coverUrl = "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300";
        tracks = await fetchCuratedTracks("Malayalam Hits", 30);
        break;

      // Personal Playlists
      case "made-discover-weekly":
      case "discover-weekly":
        name = "Discover Weekly";
        description = "A customized set of gems picked specifically for your taste. Refreshes dynamically.";
        coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop";
        tracks = await fetchPersonalizedTracks(30);
        break;
      case "made-daily-mix-1":
        name = "Daily Mix 1: Chill Vibe Mix";
        description = "Personalized dynamic soundscapes matching your recent likes and favorites.";
        coverUrl = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop";
        tracks = await fetchPersonalizedTracks(20);
        break;
      case "made-daily-mix-2":
        name = "Daily Mix 2: Ambient Recovery";
        description = "Chill tones, down-tempos, and acoustic selections curated for your relaxation.";
        coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop";
        const tempRecs = await fetchPersonalizedTracks(25);
        tracks = tempRecs.slice(0, 20);
        break;
      case "made-release-radar":
        name = "Release Radar";
        description = "Catch brand new fresh tracks from artists you love, compiled this morning.";
        coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop";
        tracks = newReleases.slice(0, 20);
        break;
      case "genre-synthpop":
        name = "Synthpop Dreams";
        description = "Synthesizers, driving beats, and atmospheric neon soundscapes curated for your auditory journey.";
        coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop";
        tracks = await fetchCuratedTracks("Synthpop Electronic", 30);
        break;

      case "genre-workout":
        name = "Power Run Beats";
        description = "High-bpm electronic anthems and heavy basslines to power up your workout routines.";
        coverUrl = "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&h=300&fit=crop";
        tracks = await fetchCuratedTracks("Workout EDM", 30);
        break;
      case "genre-acoustic":
        name = "Acoustic Sunsets";
        description = "Warm acoustic guitars, gentle vocals, and peaceful folk tunes to brighten your day.";
        coverUrl = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop";
        tracks = await fetchCuratedTracks("Soft Acoustic", 30);
        break;
    }

    const compiledPlaylist: Playlist = {
      id,
      name,
      description,
      tracks,
      coverUrl
    };

    onSelectPlaylist(compiledPlaylist);
  };

  // Get time-based greeting

  const activePlaylistName = selectedPlaylist ? selectedPlaylist.name : "Featured Hits";
  const activePlaylistDesc = selectedPlaylist 
    ? selectedPlaylist.description 
    : "The most played tracks on AeroMusic, fresh off the charts.";
  
  const tracksToShow = selectedPlaylist 
    ? (selectedPlaylist.id === "liked-songs" 
        ? likedTracks 
        : (selectedPlaylist.id === "downloaded-songs" 
            ? downloadedTracks 
            : selectedPlaylist.tracks)) 
    : catalog;

  const isTrackLiked = (track: Track) => {
    return likedTracks.some((t) => t.id === track.id);
  };

  return (
    <div id="home-dashboard" className="flex-1 overflow-y-auto p-6 text-white bg-[#121212] select-none relative custom-scrollbar animate-fade-in">
      
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

      {/* Greetings Header */}
      <div className="mb-6 md:mb-8 shrink-0 relative z-10">
        <h2 className="text-3xl font-extrabold tracking-tight font-sans">{getGreeting()}</h2>
        <p className="text-zinc-400 text-xs mt-1">Welcome to your Premium music hub.</p>
      </div>



      {/* Premium Hero Banner (only if no specific playlist is loaded) */}
      {!selectedPlaylist && (() => {
        const HERO_BANNERS = [
          {
            id: "genre-synthpop",
            tag: "Curated Hit",
            title: "Synthpop Dreams",
            description: "Synthesizers, driving beats, and atmospheric neon soundscapes curated for your auditory journey.",
            gradient: "from-violet-850 to-teal-950",
            image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400"
          },
          {
            id: "genre-lofi",
            tag: "Chill Vibes",
            title: "Midnight Lo-Fi",
            description: "Relax, study, or wind down with dusty beats, smooth jazz chords, and cozy vinyl crackles.",
            gradient: "from-amber-950 via-orange-950 to-stone-900",
            image: "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=400"
          },
          {
            id: "genre-workout",
            tag: "Energizer",
            title: "Power Run Beats",
            description: "High-bpm electronic anthems and heavy basslines to power up your workout routines.",
            gradient: "from-rose-950 to-indigo-950",
            image: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400"
          },
          {
            id: "genre-acoustic",
            tag: "Unplugged",
            title: "Acoustic Sunsets",
            description: "Warm acoustic guitars, gentle vocals, and peaceful folk tunes to brighten your day.",
            gradient: "from-emerald-950 to-stone-950",
            image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400"
          }
        ];
        
        const currentHero = HERO_BANNERS[activeHeroIdx] || HERO_BANNERS[0];
        
        return (
          <div className={`relative rounded-3xl overflow-hidden mb-8 bg-gradient-to-r ${currentHero.gradient} p-8 md:p-10 shadow-xl border border-white/5 transition-all duration-500 select-none group min-h-[220px] flex items-center`}>
            <div className="relative z-10 max-w-xl pr-12">
              <span className="bg-white/10 border border-white/15 text-white font-extrabold text-[9px] uppercase px-3 py-1 rounded-full font-mono tracking-widest">
                {currentHero.tag}
              </span>
              <h3 className="text-3xl md:text-4.5xl font-black tracking-tight mt-4 mb-2.5 text-white leading-none">
                {currentHero.title}
              </h3>
              <p className="text-white/70 text-xs md:text-sm mb-6 leading-relaxed max-w-lg">
                {currentHero.description}
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleSelectCurated(currentHero.id)}
                  className="bg-white hover:bg-zinc-100 text-black font-extrabold px-6 py-3 rounded-full flex items-center gap-2.5 transition transform active:scale-95 shadow cursor-pointer text-xs md:text-sm hover:scale-105"
                >
                  <Play size={14} fill="black" />
                  Play Now
                </button>
              </div>
            </div>

            {/* Navigation Arrows */}
            <div className="absolute right-6 bottom-6 flex items-center gap-3.5 z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveHeroIdx(prev => (prev === 0 ? HERO_BANNERS.length - 1 : prev - 1));
                }}
                className="w-8 h-8 rounded-full border border-white/10 bg-black/40 hover:bg-black/70 flex items-center justify-center text-zinc-450 hover:text-white transition cursor-pointer hover:scale-105 active:scale-95"
              >
                ◀
              </button>
              <span className="text-[10px] font-mono font-bold text-zinc-550 select-none">{activeHeroIdx + 1}/{HERO_BANNERS.length}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveHeroIdx(prev => (prev === HERO_BANNERS.length - 1 ? 0 : prev + 1));
                }}
                className="w-8 h-8 rounded-full border border-white/10 bg-black/40 hover:bg-black/70 flex items-center justify-center text-zinc-450 hover:text-white transition cursor-pointer hover:scale-105 active:scale-95"
              >
                ▶
              </button>
            </div>
          </div>
        );
      })()}

      {/* Selected Playlist Header / Details */}
      {selectedPlaylist && (
        <div className="flex flex-col md:flex-row items-end gap-6 mb-8 bg-zinc-800/10 p-6 rounded-2xl border border-zinc-800/30">
          <div className="w-44 h-44 rounded-xl overflow-hidden shadow-2xl border border-zinc-700/20 bg-zinc-800 shrink-0">
            <img
              src={getPlaceholderUrl(selectedPlaylist.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop")}
              alt={activePlaylistName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1">
            <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">
              Playlist Companion
            </span>
            <h3 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-2 mb-3 text-white">
              {activePlaylistName}
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              {activePlaylistDesc}
            </p>
             <div className="flex flex-wrap items-center gap-4">
              {tracksToShow.length > 0 && (
                <button
                  onClick={() => {
                    if (currentTrack && tracksToShow.some((t) => t.id === currentTrack.id)) {
                      onPlayPauseToggle();
                    } else {
                      onTrackSelect(tracksToShow[0], tracksToShow);
                    }
                  }}
                  className="bg-violet-500 hover:bg-violet-400 text-black font-extrabold p-3 rounded-full shadow transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  {isPlaying && currentTrack && tracksToShow.some((t) => t.id === currentTrack.id) ? (
                    <Pause size={20} fill="black" />
                  ) : (
                    <Play size={20} fill="black" />
                  )}
                </button>
              )}
              <div className="text-xs text-zinc-500 font-mono">
                <span>{tracksToShow.length} songs</span>
              </div>

              {/* Export triggers */}
              {tracksToShow.length > 0 && (
                <div className="flex items-center gap-2 border-l border-zinc-800 pl-4 ml-2">
                  {onDownloadTracksBulk && (
                    <button
                      onClick={() => onDownloadTracksBulk(tracksToShow, activePlaylistName)}
                      className="bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-violet-400 text-zinc-300 text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-zinc-700/50 transition flex items-center gap-1.5 cursor-pointer"
                      title="Download all tracks in this playlist to offline library"
                    >
                      <Download size={14} />
                      <span>Download All</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleExportM3U(activePlaylistName, tracksToShow)}
                    className="bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-violet-400 text-zinc-300 text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-zinc-700/50 transition flex items-center gap-1.5 cursor-pointer"
                    title="Export as standard M3U playlist file"
                  >
                    <FileDown size={14} />
                    <span>Export M3U</span>
                  </button>
                  <button
                    onClick={() => handleExportZIP(activePlaylistName, tracksToShow)}
                    disabled={isExportingZip !== null}
                    className="bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-violet-400 text-zinc-300 text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-zinc-700/50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Download playlist as a ZIP of tag-compatible MP3s"
                  >
                    {isExportingZip === activePlaylistName ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                        <span>Zipping...</span>
                      </>
                    ) : (
                      <>
                        <FolderArchive size={14} />
                        <span>ZIP MP3s</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show All Playlist Gallery */}
      {!selectedPlaylist && showAllCategory && (
        <div className="mb-8 anim-fade-in">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setShowAllCategory(null)}
              className="text-zinc-400 hover:text-white transition duration-200 cursor-pointer font-bold font-mono text-xs bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>←</span>
              <span>Back to Home</span>
            </button>
            <h3 className="text-lg font-black text-white capitalize font-sans">
              {showAllCategory === "new-releases" ? "New Releases & Hits" : "Soundtracks & Mood Mixes"}
            </h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {showAllCategory === "new-releases" ? (
              <>
                {/* NMF India */}
                <div onClick={() => { handleSelectCurated("nmf-india"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">New Music Friday India</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Fresh releases from Indian artists.</p>
                </div>
                {/* NMF Global */}
                <div onClick={() => { handleSelectCurated("nmf-global"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">New Music Friday Global</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">The biggest tracks in the world right now.</p>
                </div>
                {/* Release Radar */}
                <div onClick={() => { handleSelectCurated("made-release-radar"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=350&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Release Radar</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Fresh music from artists you follow.</p>
                </div>
                {/* Billboard 100 */}
                <div onClick={() => { handleSelectCurated("chart-billboard"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-blue-700 to-indigo-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">USA CHARTS</span>
                    <span className="text-xl font-black text-white">Billboard Hot 100</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Billboard Hot 100</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">The weekly American singles charts.</p>
                </div>
                {/* Top 50 India */}
                <div onClick={() => { handleSelectCurated("chart-india"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-emerald-700 to-teal-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">DESI CHARTS</span>
                    <span className="text-xl font-black text-white">Top 50 India</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Top 50 India</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Daily music updates from India.</p>
                </div>
                {/* Viral 50 Global */}
                <div onClick={() => { handleSelectCurated("chart-viral"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-violet-700 to-fuchsia-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">VIRAL CHARTS</span>
                    <span className="text-xl font-black text-white">Viral 50 Global</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Viral 50 Global</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">The most shared songs on the web.</p>
                </div>
              </>
            ) : (
              <>
                {/* daylist */}
                <div onClick={() => { handleSelectCurated("daylist"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-tr from-cyan-500 via-emerald-400 to-yellow-300 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black bg-black/15 text-white px-2 py-0.5 rounded backdrop-blur-sm self-start">MIX</span>
                    <span className="text-2xl font-black text-black">daylist</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Your Daylist</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Personalized moods for this time of day.</p>
                </div>
                {/* Discover Weekly */}
                <div onClick={() => { handleSelectCurated("discover-weekly"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-violet-950 to-indigo-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">WEEKLY</span>
                    <span className="text-2xl font-black text-white">Discover</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Discover Weekly</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Fresh recommendations updated every week.</p>
                </div>
                {/* Daily Mix 1 */}
                <div onClick={() => { handleSelectCurated("made-daily-mix-1"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Daily Mix 1</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Upbeat dance, electronic, and high BPM.</p>
                </div>
                {/* Daily Mix 2 */}
                <div onClick={() => { handleSelectCurated("made-daily-mix-2"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Daily Mix 2</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Relaxing, chill ambient recovery sounds.</p>
                </div>
                {/* Synthpop Dreams */}
                <div onClick={() => { handleSelectCurated("genre-synthpop"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Synthpop Dreams</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Retro synths, neon pads, driving basslines.</p>
                </div>
                {/* Midnight Lo-Fi */}
                <div onClick={() => { handleSelectCurated("genre-lofi"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Midnight Lo-Fi</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Dusty beats and smooth jazz chords.</p>
                </div>
                {/* Power Run */}
                <div onClick={() => { handleSelectCurated("genre-workout"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Power Run Beats</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">High-bpm workout electronic tracks.</p>
                </div>
                {/* Acoustic sunsets */}
                <div onClick={() => { handleSelectCurated("genre-acoustic"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                    <img src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop" alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Acoustic Sunsets</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Gentle acoustic guitars and peaceful folk tunes.</p>
                </div>
                {/* Regional Hindi */}
                <div onClick={() => { handleSelectCurated("latest-hindi"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-red-650 to-orange-850 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">BOLLYWOOD</span>
                    <span className="text-xl font-black text-white">Latest Hindi</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Latest Hindi</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Fresh Hindi and Bollywood tunes.</p>
                </div>
                {/* Regional Tamil */}
                <div onClick={() => { handleSelectCurated("latest-tamil"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-indigo-700 to-indigo-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">KOLLYWOOD</span>
                    <span className="text-xl font-black text-white">Latest Tamil</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Latest Tamil</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">The latest tracks from Kollywood.</p>
                </div>
                {/* Regional Malayalam */}
                <div onClick={() => { handleSelectCurated("latest-malayalam"); setShowAllCategory(null); }} className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group">
                  <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-br from-rose-700 to-rose-900 p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-mono font-black text-zinc-300">MOLLYWOOD</span>
                    <span className="text-xl font-black text-white">Latest Malayalam</span>
                  </div>
                  <h5 className="font-extrabold text-sm truncate">Latest Malayalam</h5>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-normal">Catch the latest hits from Mollywood.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!selectedPlaylist && !showAllCategory && (
        <div className="mb-8">
          {/* Section 1: It's New Music Friday! / Dynamic Weekday Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-bold font-sans text-white hover:underline cursor-pointer">
                {getNewMusicFridayHeader(new Date())}
              </h4>
              <span 
                onClick={() => setShowAllCategory("new-releases")}
                className="text-xs font-bold text-zinc-400 hover:underline cursor-pointer"
              >
                Show all
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Card 1: New Music Friday India */}
              <div
                onClick={() => handleSelectCurated("nmf-india")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" 
                    alt="New Music Friday India" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">New Music Friday India</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">New music from Madonna, SIENNA, and more.</p>
              </div>

              {/* Card 2: Release Radar */}
              <div
                onClick={() => handleSelectCurated("nmf-release-radar")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80" 
                    alt="Release Radar" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Release Radar</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Catch all the latest music from artists you love, updated fresh.</p>
              </div>

              {/* Card 3: Latest Love Tamil */}
              <div
                onClick={() => handleSelectCurated("nmf-love-tamil")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80" 
                    alt="Latest Love Tamil" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Latest Love Tamil</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Check out the latest romance tracks from Kollywood.</p>
              </div>

              {/* Card 4: Latest Tamil */}
              <div
                onClick={() => handleSelectCurated("nmf-tamil")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1608976328267-e673d3ec06ce?w=300&q=80" 
                    alt="Latest Tamil" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Latest Tamil</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">New music from Kollywood releases and top tracks.</p>
              </div>

              {/* Card 5: Latest Malayalam */}
              <div
                onClick={() => handleSelectCurated("nmf-malayalam")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative shadow-md"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300&q=80" 
                    alt="Latest Malayalam" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Latest Malayalam</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Catch the latest hits and indie releases from Malayalam.</p>
              </div>
            </div>
          </div>

          {/* Section 2: Soundtrack your Day/Time (Dynamic Title) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-bold font-sans text-white hover:underline cursor-pointer">
                {getPersonalizedSectionTitle(new Date())}
              </h4>
              <span 
                onClick={() => setShowAllCategory("soundtracks")}
                className="text-xs font-bold text-zinc-400 hover:underline cursor-pointer"
              >
                Show all
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Card 1: daylist (Special gradient cover!) */}
              <div
                onClick={() => handleSelectCurated("daylist")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square bg-gradient-to-tr from-cyan-500 via-emerald-400 to-yellow-300 p-4 flex flex-col justify-between overflow-hidden group-hover:scale-[1.02] transition duration-300">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.25),transparent_60%)] pointer-events-none" />
                  <span className="text-[9px] font-mono font-black tracking-widest uppercase bg-black/15 text-white px-2 py-0.5 rounded backdrop-blur-sm self-start">
                    {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}
                  </span>
                  <span className="text-3xl font-black tracking-tighter text-black drop-shadow-sm font-sans select-none">daylist</span>
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">daylist</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">{getDaylistSubtitle()}</p>
              </div>

              {/* Card 2: Hype Motivation Mix */}
              <div
                onClick={() => handleSelectCurated("mix-hype")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&q=80" 
                    alt="Hype Motivation Mix" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Hype Motivation Mix</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Hype motivation music for you. Also try hip-hop, metal, and hard rock.</p>
              </div>

              {/* Card 3: Quiet Mix */}
              <div
                onClick={() => handleSelectCurated("mix-quiet")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80" 
                    alt="Quiet Mix" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Quiet Mix</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Quiet music for you. Also try indie, soft-pop, and warm acoustic.</p>
              </div>

              {/* Card 4: Fun Workout Mix */}
              <div
                onClick={() => handleSelectCurated("mix-workout")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&q=80" 
                    alt="Fun Workout Mix" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-450 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Fun Workout Mix</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Fun workout music for you. Also try pop, house, and electronic dance.</p>
              </div>

              {/* Card 5: Soft Mix */}
              <div
                onClick={() => handleSelectCurated("mix-soft")}
                className="bg-zinc-900/40 hover:bg-zinc-800/60 p-4 transition-all duration-300 rounded-xl cursor-pointer border border-zinc-850 hover:border-zinc-700/30 group relative"
              >
                <div className="relative overflow-hidden rounded-lg shadow-md mb-4 aspect-square">
                  <img 
                    src="https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80" 
                    alt="Soft Mix" 
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute right-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black p-3.5 rounded-full flex items-center justify-center">
                    <Play size={16} fill="black" />
                  </div>
                </div>
                <h5 className="font-extrabold text-sm truncate">Soft Mix</h5>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">Soft music for you. Also try acoustic indie, ambient folk, and low beats.</p>
              </div>
            </div>
          </div>

          {/* Explore Music & Curations Tabs */}
          <div id="explore-music-section" className="mt-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <h4 className="text-xl font-bold font-sans text-white flex items-center gap-2">
                <Compass size={20} className="text-violet-400" />
                <span>Explore Music & Curations</span>
              </h4>
              <div className="flex flex-wrap bg-zinc-900/80 border border-zinc-850 p-1 rounded-xl text-xs font-semibold gap-1">
                <button
                  onClick={() => setExploreTab("charts")}
                  className={`px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    exploreTab === "charts"
                      ? "bg-violet-500 text-black shadow font-extrabold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Charts & Countries
                </button>
                <button
                  onClick={() => setExploreTab("artists")}
                  className={`px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    exploreTab === "artists"
                      ? "bg-violet-500 text-black shadow font-extrabold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Featured Artists
                </button>
                <button
                  onClick={() => setExploreTab("genres")}
                  className={`px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    exploreTab === "genres"
                      ? "bg-violet-500 text-black shadow font-extrabold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Explore Genres
                </button>
                <button
                  onClick={() => setExploreTab("languages")}
                  className={`px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    exploreTab === "languages"
                      ? "bg-violet-500 text-black shadow font-extrabold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Languages & Regions
                </button>
                <button
                  onClick={() => setExploreTab("suggestions")}
                  className={`px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    exploreTab === "suggestions"
                      ? "bg-violet-500 text-black shadow font-extrabold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Weekly Mixes
                </button>
              </div>
            </div>

            {/* Tab Contents: Charts & Countries */}
            {exploreTab === "charts" && (
              <div className="space-y-6">
                {/* Global Charts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Global Top 50 */}
                  <div
                    onClick={() => handleSelectCurated("global-top-50")}
                    className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                      <img
                        src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop"
                        alt="Global Top 50"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                        <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                          <Play size={20} fill="black" />
                        </div>
                      </div>
                      <span className="absolute top-3 left-3 bg-violet-500 text-black font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                        Weekly Chart
                      </span>
                    </div>
                    <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Global Top 50</h5>
                    <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      Your weekly guide to the most played songs in the world.
                    </p>
                  </div>

                  {/* Viral 50 Global */}
                  <div
                    onClick={() => handleSelectCurated("global-viral-50")}
                    className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                      <img
                        src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop"
                        alt="Viral 50"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                        <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                          <Play size={20} fill="black" />
                        </div>
                      </div>
                      <span className="absolute top-3 left-3 bg-rose-500 text-white font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                        Trending
                      </span>
                    </div>
                    <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Viral 50 - Global</h5>
                    <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      The most shared and talked-about tracks on the planet.
                    </p>
                  </div>

                  {/* Aero Top 20 */}
                  <div
                    onClick={() => handleSelectCurated("aero-top-20")}
                    className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                      <img
                        src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop"
                        alt="Aero Top"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                        <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                          <Play size={20} fill="black" />
                        </div>
                      </div>
                      <span className="absolute top-3 left-3 bg-teal-500 text-black font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                        Lossless
                      </span>
                    </div>
                    <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Aero Premium Top 20</h5>
                    <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      Listen to tracks delivering the absolute highest bit depths and soundstage.
                    </p>
                  </div>
                </div>

                {/* Country Top Lists */}
                <div>
                  <h5 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider font-mono">Country Chart Leaders</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {/* USA */}
                    <div
                      onClick={() => handleSelectCurated("country-usa")}
                      className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                    >
                      <div className="w-14 h-14 mx-auto bg-zinc-800 rounded-full overflow-hidden mb-3 relative group-hover:scale-105 transition duration-300 shadow-lg">
                        <img src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=150&h=150&fit=crop" alt="USA" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <h5 className="font-bold text-xs truncate text-zinc-100 group-hover:text-violet-400 transition">United States</h5>
                      <span className="text-[9px] font-mono text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded-full inline-block mt-1">USA #1</span>
                    </div>

                    {/* UK */}
                    <div
                      onClick={() => handleSelectCurated("country-uk")}
                      className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                    >
                      <div className="w-14 h-14 mx-auto bg-zinc-800 rounded-full overflow-hidden mb-3 relative group-hover:scale-105 transition duration-300 shadow-lg">
                        <img src="https://images.unsplash.com/photo-1513829096999-4978602297f7?w=150&h=150&fit=crop" alt="UK" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <h5 className="font-bold text-xs truncate text-zinc-100 group-hover:text-violet-400 transition">United Kingdom</h5>
                      <span className="text-[9px] font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mt-1">UK Top 30</span>
                    </div>

                    {/* India */}
                    <div
                      onClick={() => handleSelectCurated("country-india")}
                      className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                    >
                      <div className="w-14 h-14 mx-auto bg-zinc-800 rounded-full overflow-hidden mb-3 relative group-hover:scale-105 transition duration-300 shadow-lg">
                        <img src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=150&h=150&fit=crop" alt="India" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <h5 className="font-bold text-xs truncate text-zinc-100 group-hover:text-violet-400 transition">India</h5>
                      <span className="text-[9px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full inline-block mt-1">Monsoon Pop</span>
                    </div>

                    {/* Japan */}
                    <div
                      onClick={() => handleSelectCurated("country-japan")}
                      className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                    >
                      <div className="w-14 h-14 mx-auto bg-zinc-800 rounded-full overflow-hidden mb-3 relative group-hover:scale-105 transition duration-300 shadow-lg">
                        <img src="https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=150&h=150&fit=crop" alt="Japan" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <h5 className="font-bold text-xs truncate text-zinc-100 group-hover:text-violet-400 transition">Japan</h5>
                      <span className="text-[9px] font-mono text-pink-400 font-bold bg-pink-500/10 px-2 py-0.5 rounded-full inline-block mt-1">J-Pop Hits</span>
                    </div>

                    {/* France */}
                    <div
                      onClick={() => handleSelectCurated("country-france")}
                      className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                    >
                      <div className="w-14 h-14 mx-auto bg-zinc-800 rounded-full overflow-hidden mb-3 relative group-hover:scale-105 transition duration-300 shadow-lg">
                        <img src="https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=150&h=150&fit=crop" alt="France" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <h5 className="font-bold text-xs truncate text-zinc-100 group-hover:text-violet-400 transition">France</h5>
                      <span className="text-[9px] font-mono text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded-full inline-block mt-1">French House</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Contents: Featured Artists */}
            {exploreTab === "artists" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-5">
                {/* Taylor Swift */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("Taylor Swift") : handleSelectCurated("artist-taylor-swift")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=200" alt="Taylor Swift" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">Taylor Swift</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">Essentials</p>
                </div>

                {/* Billie Eilish */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("Billie Eilish") : handleSelectCurated("artist-billie-eilish")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200" alt="Billie Eilish" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">Billie Eilish</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">Alt-Pop Gold</p>
                </div>

                {/* Sabrina Carpenter */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("Sabrina Carpenter") : handleSelectCurated("artist-sabrina-carpenter")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200" alt="Sabrina Carpenter" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">Sabrina Carpenter</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">Pop Hits</p>
                </div>

                {/* BTS */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("BTS") : handleSelectCurated("artist-bts")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200" alt="BTS" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">BTS</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">K-Pop Legends</p>
                </div>

                {/* Arijit Singh */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("Arijit Singh") : handleSelectCurated("artist-arijit-singh")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=200" alt="Arijit Singh" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">Arijit Singh</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">Bollywood Soul</p>
                </div>

                {/* Queen */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("Queen") : handleSelectCurated("artist-queen")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200" alt="Queen" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">Queen</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">Classic Rock</p>
                </div>

                {/* YOASOBI */}
                <div
                  onClick={() => onArtistClick ? onArtistClick("YOASOBI") : handleSelectCurated("artist-yoasobi")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center"
                >
                  <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-3 relative group-hover:scale-105 transition duration-300">
                    <img src="https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=200" alt="YOASOBI" className="w-full h-full object-cover" />
                  </div>
                  <h5 className="font-bold text-xs text-zinc-100 group-hover:text-violet-400 transition">YOASOBI</h5>
                  <p className="text-[10px] text-zinc-500 mt-1">J-Pop Anthems</p>
                </div>
              </div>
            )}

            {/* Tab Contents: Explore Genres */}
            {exploreTab === "genres" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-5">
                {/* Pop */}
                <div
                  onClick={() => handleSelectCurated("genre-pop")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center relative overflow-hidden"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-violet-400 to-teal-600 rounded-2xl flex items-center justify-center mb-4 text-black shadow-lg group-hover:scale-110 transition duration-300">
                    <Music size={28} />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Pop Hits</h5>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">High energy global hits.</p>
                </div>

                {/* Rock */}
                <div
                  onClick={() => handleSelectCurated("genre-rock")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center relative overflow-hidden"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-red-500 to-orange-700 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition duration-300">
                    <Flame size={28} />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-red-400 transition">Rock Legends</h5>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">Stadium riffs & drums.</p>
                </div>

                {/* Hip-Hop */}
                <div
                  onClick={() => handleSelectCurated("genre-hiphop")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center relative overflow-hidden"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-500 to-indigo-750 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition duration-300">
                    <Compass size={28} />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-purple-400 transition">Hip-Hop & Rap</h5>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">Top flows & heavy bass.</p>
                </div>

                {/* EDM */}
                <div
                  onClick={() => handleSelectCurated("genre-edm")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center relative overflow-hidden"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl flex items-center justify-center mb-4 text-black shadow-lg group-hover:scale-110 transition duration-300">
                    <Sparkles size={28} />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-sky-400 transition">Electronic (EDM)</h5>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">Pulsating festival beats.</p>
                </div>

                {/* Lofi */}
                <div
                  onClick={() => handleSelectCurated("genre-lofi")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group text-center relative overflow-hidden"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-yellow-600 rounded-2xl flex items-center justify-center mb-4 text-black shadow-lg group-hover:scale-110 transition duration-300">
                    <Clock size={28} />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-amber-400 transition">Lo-Fi Beats</h5>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">Chill study & sleep loops.</p>
                </div>
              </div>
            )}

            {/* Tab Contents: Languages & Regions */}
            {exploreTab === "languages" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                {/* English */}
                <div
                  onClick={() => handleSelectCurated("lang-english")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300" alt="English" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">English Hits</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Billboard Hot 100 leaders</p>
                </div>

                {/* Spanish */}
                <div
                  onClick={() => handleSelectCurated("lang-spanish")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300" alt="Spanish" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Spanish / Latin</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Reggaeton & Latin rhythms</p>
                </div>

                {/* K-Pop */}
                <div
                  onClick={() => handleSelectCurated("lang-kpop")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300" alt="K-Pop" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">K-Pop Spotlight</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Hits straight from Seoul</p>
                </div>

                {/* J-Pop */}
                <div
                  onClick={() => handleSelectCurated("lang-jpop")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=300" alt="J-Pop" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">J-Pop & Anime</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Japanese charts & Osts</p>
                </div>

                {/* Hindi */}
                <div
                  onClick={() => handleSelectCurated("lang-hindi")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=300" alt="Hindi" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Hindi & Bollywood</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Romantic cinema anthems</p>
                </div>

                {/* Tamil */}
                <div
                  onClick={() => handleSelectCurated("lang-tamil")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1608976328267-e673d3ec06ce?w=300" alt="Tamil" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Tamil Hits</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Kollywood top melodies</p>
                </div>

                {/* Telugu */}
                <div
                  onClick={() => handleSelectCurated("lang-telugu")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300" alt="Telugu" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Telugu Hits</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Tollywood chartbusters</p>
                </div>

                {/* Malayalam */}
                <div
                  onClick={() => handleSelectCurated("lang-malayalam")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300" alt="Malayalam" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Malayalam Hits</h5>
                  <p className="text-[11px] text-zinc-500 mt-1">Kerala melodies & indie</p>
                </div>
              </div>
            )}

            {/* Tab Contents: Curated Suggestions */}
            {exploreTab === "suggestions" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                {/* Discover Weekly */}
                <div
                  onClick={() => handleSelectCurated("made-discover-weekly")}
                  className="bg-gradient-to-br from-zinc-900/60 to-purple-950/20 hover:from-zinc-900/80 hover:to-purple-950/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/40 hover:border-purple-800/30 group relative overflow-hidden"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img
                      src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop"
                      alt="Discover Weekly"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                      <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                        <Play size={20} fill="black" />
                      </div>
                    </div>
                    <span className="absolute top-3 left-3 bg-purple-500 text-white font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                      For You
                    </span>
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Discover Weekly</h5>
                  <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    A customized set of gems picked specifically for your taste. Refreshes weekly.
                  </p>
                </div>

                {/* Daily Mix 1 */}
                <div
                  onClick={() => handleSelectCurated("made-daily-mix-1")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img
                      src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop"
                      alt="Daily Mix 1"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                      <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                        <Play size={20} fill="black" />
                      </div>
                    </div>
                    <span className="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                      Daily Mix 1
                    </span>
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Daily Mix: Upbeat</h5>
                  <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    High energy pop and dance anthems to power your day and workouts.
                  </p>
                </div>

                {/* Daily Mix 2 */}
                <div
                  onClick={() => handleSelectCurated("made-daily-mix-2")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img
                      src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop"
                      alt="Daily Mix 2"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                      <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                        <Play size={20} fill="black" />
                      </div>
                    </div>
                    <span className="absolute top-3 left-3 bg-sky-500 text-black font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                      Daily Mix 2
                    </span>
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Daily Mix: Focus</h5>
                  <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    Relaxing lo-fi loops, soft acoustics, and chill instrumentals.
                  </p>
                </div>

                {/* Release Radar */}
                <div
                  onClick={() => handleSelectCurated("made-release-radar")}
                  className="bg-zinc-900/40 hover:bg-zinc-800/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 border border-zinc-800/30 hover:border-zinc-700/50 group relative overflow-hidden"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-3 relative">
                    <img
                      src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop"
                      alt="Release Radar"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                      <div className="bg-violet-500 text-black p-3.5 rounded-full shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                        <Play size={20} fill="black" />
                      </div>
                    </div>
                    <span className="absolute top-3 left-3 bg-violet-500 text-black font-extrabold text-[9px] uppercase px-2.5 py-1 rounded-md font-mono tracking-wider">
                      Just Out
                    </span>
                  </div>
                  <h5 className="font-bold text-sm text-zinc-100 group-hover:text-violet-400 transition">Release Radar</h5>
                  <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    New fresh tracks from artists you love, compiled this morning.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tracks Table */}
      {selectedPlaylist && (
        <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-xl overflow-hidden p-4 mt-6">
          <h4 className="text-lg font-bold mb-4 font-sans text-zinc-200">
            Songs
          </h4>

        {tracksToShow.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Music size={40} className="mx-auto mb-3 opacity-30 animate-pulse" />
            <p className="text-sm">This playlist is currently empty.</p>
            {selectedPlaylist?.id === "liked-songs" && (
              <p className="text-xs text-zinc-600 mt-1">Tap the heart icon on any song across the app to save them here!</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-800/60 text-zinc-500 text-xs font-mono font-bold tracking-wider uppercase">
                <th className="py-3 px-3 text-center w-12">#</th>
                <th className="py-3 px-2">Title</th>
                <th className="py-3 px-2 hidden md:table-cell">Album</th>
                <th className="py-3 px-2 hidden sm:table-cell">Genre</th>
                <th className="py-3 px-3 text-center w-16">
                  <Clock size={15} className="inline-block" />
                </th>
                <th className="py-3 px-3 text-center w-14"></th>
              </tr>
            </thead>
            <tbody>
              {tracksToShow.map((track, index) => {
                const isSelected = currentTrack?.id === track.id;
                const liked = isTrackLiked(track);

                return (
                  <tr
                    key={track.id + "-" + index}
                    className={`border-b border-zinc-900/40 hover:bg-zinc-800/30 transition text-sm group ${
                      isSelected ? "bg-zinc-800/20 text-violet-400" : ""
                    }`}
                  >
                    {/* Index / Play Hover */}
                    <td className="py-3.5 px-3 text-center align-middle font-mono text-zinc-500 font-medium">
                      <span className="group-hover:hidden">{index + 1}</span>
                      <button
                        onClick={() => {
                          if (isSelected) {
                            onPlayPauseToggle();
                          } else {
                            onTrackSelect(track, tracksToShow);
                          }
                        }}
                        className="hidden group-hover:inline-block hover:scale-110 text-white cursor-pointer"
                      >
                        {isSelected && isPlaying ? (
                          <Pause size={14} fill="white" />
                        ) : (
                          <Play size={14} fill="white" />
                        )}
                      </button>
                    </td>

                    {/* Title & Artist */}
                    <td className="py-3.5 px-2 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-zinc-800 rounded overflow-hidden shrink-0 border border-zinc-800">
                          <img
                            src={track.thumbnail}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`font-semibold truncate cursor-pointer ${
                              isSelected ? "text-violet-400" : "text-white"
                            }`}
                            onClick={() => onTrackSelect(track, tracksToShow)}
                          >
                            {track.title}
                          </p>
                          <p className="text-zinc-500 text-xs truncate">
                            <span 
                              onClick={() => onArtistClick && onArtistClick(track.artist)}
                              className="hover:underline cursor-pointer hover:text-zinc-300 transition"
                            >
                              {track.artist}
                            </span>
                          </p>
                        </div>
                        {isSelected && isPlaying && (
                          <div className="flex items-end gap-0.5 h-3.5 pb-0.5 shrink-0 ml-1">
                            <span className="w-0.5 bg-violet-500 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite_alternate]" style={{ animationDelay: "0.1s" }} />
                            <span className="w-0.5 bg-violet-500 rounded-full animate-[equalizer_1.2s_ease-in-out_infinite_alternate]" style={{ animationDelay: "0.4s" }} />
                            <span className="w-0.5 bg-violet-500 rounded-full animate-[equalizer_0.6s_ease-in-out_infinite_alternate]" style={{ animationDelay: "0.2s" }} />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Album */}
                    <td className="py-3.5 px-2 align-middle hidden md:table-cell text-zinc-400 truncate max-w-[150px]">
                      <span 
                        onClick={() => onAlbumClick && onAlbumClick(track.album || "Single", track.artist, track.thumbnail)}
                        className="hover:underline cursor-pointer hover:text-zinc-200 transition"
                      >
                        {track.album}
                      </span>
                    </td>

                    {/* Genre */}
                    <td className="py-3.5 px-2 align-middle hidden sm:table-cell text-zinc-500 font-medium">
                      <span className="bg-zinc-800/40 border border-zinc-800 px-2 py-0.5 rounded text-xs">
                        {track.genre}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-3 text-center align-middle font-mono text-zinc-500 text-xs">
                      {track.duration}
                    </td>

                    {/* Like / Actions */}
                    <td className="py-3.5 px-3 text-center align-middle">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => onToggleLike(track)}
                          className={`transition cursor-pointer ${
                            liked ? "text-violet-500 scale-110" : "text-zinc-600 hover:text-zinc-300"
                          }`}
                          title={liked ? "Unlike Song" : "Like Song"}
                        >
                          <Heart size={16} fill={liked ? "currentColor" : "none"} />
                        </button>
                        {selectedPlaylist?.id === "downloaded-songs" ? (
                          <button
                            onClick={() => onDeleteDownloadedTrack && onDeleteDownloadedTrack(track)}
                            className="text-red-500 hover:text-red-400 transition cursor-pointer"
                            title="Delete downloaded song"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => onDownloadTrack(track)}
                            className={`transition cursor-pointer ${
                              downloadedTracks.some((t) => t.id === track.id)
                                ? "text-violet-400"
                                : "text-zinc-600 hover:text-zinc-300"
                            }`}
                            title={downloadedTracks.some((t) => t.id === track.id) ? "Downloaded for Offline Playback" : "Download MP3 / Offline"}
                          >
                            {downloadedTracks.some((t) => t.id === track.id) ? (
                              <Check size={16} className="stroke-[3]" />
                            ) : (
                              <Download size={16} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}



      {/* Centralized Media Export Hub */}
      <div id="media-export-hub" className="mt-8 bg-zinc-900/40 border border-zinc-800/40 rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <FolderArchive className="text-violet-400" size={22} />
          <h4 className="text-lg font-bold font-sans text-zinc-100">Media & Playlist Export Hub</h4>
        </div>
        <p className="text-zinc-400 text-xs leading-relaxed max-w-3xl mb-6">
          Download your personal playlists and libraries as standard <span className="text-violet-400 font-mono">.M3U</span> files for universal audio player compatibility, or compile high-fidelity, metadata-tagged placeholder <span className="text-violet-400 font-mono">.MP3</span> files into a single <span className="text-violet-400 font-mono">.ZIP</span> archive for offline playback.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Default/System Playlists */}
          <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/60 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-violet-400 tracking-wider">Library Channels</span>
              <h5 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Core Curations & Likes</h5>
              
              <div className="space-y-3">
                {/* Liked Tracks Row */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/20 hover:bg-zinc-800/40 transition">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Heart size={14} className="text-violet-500 shrink-0" fill="currentColor" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-300 truncate">Liked Tracks</p>
                      <p className="text-[10px] font-mono text-zinc-500">{likedTracks.length} tracks</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleExportM3U("Liked Tracks", likedTracks)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer"
                      title="Export Liked Tracks as M3U"
                    >
                      <FileDown size={14} />
                    </button>
                    <button
                      onClick={() => handleExportZIP("Liked Tracks", likedTracks)}
                      disabled={isExportingZip !== null}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer disabled:opacity-50"
                      title="Export Liked Tracks as ZIP of MP3s"
                    >
                      {isExportingZip === "Liked Tracks" ? (
                        <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <FolderArchive size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Offline Downloads Row */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/20 hover:bg-zinc-800/40 transition">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Download size={14} className="text-violet-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-300 truncate">Offline Saved Songs</p>
                      <p className="text-[10px] font-mono text-zinc-500">{downloadedTracks.length} tracks</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleExportM3U("Offline Downloads", downloadedTracks)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer"
                      title="Export Offline Saved Songs as M3U"
                    >
                      <FileDown size={14} />
                    </button>
                    <button
                      onClick={() => handleExportZIP("Offline Downloads", downloadedTracks)}
                      disabled={isExportingZip !== null}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer disabled:opacity-50"
                      title="Export Offline Saved Songs as ZIP of MP3s"
                    >
                      {isExportingZip === "Offline Downloads" ? (
                        <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <FolderArchive size={14} />
                      )}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* User Playlists */}
          <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/60 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-violet-400 tracking-wider">Dynamic Mixes</span>
              <h5 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Custom Playlists</h5>
              
              {playlists.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 flex flex-col items-center justify-center">
                  <Music size={24} className="opacity-20 mb-2" />
                  <p className="text-xs font-medium">No custom playlists created yet.</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Import from Spotify or create your own custom list!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[145px] overflow-y-auto pr-1">
                  {playlists.map((pl) => (
                    <div key={pl.id} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/20 hover:bg-zinc-800/40 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-zinc-800">
                          <img src={getPlaceholderUrl(pl.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=50")} alt={pl.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-300 truncate">{pl.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500">{(pl.tracks || []).length} tracks</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleExportM3U(pl.name, pl.tracks || [])}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer"
                          title={`Export ${pl.name} as M3U`}
                        >
                          <FileDown size={14} />
                        </button>
                        <button
                          onClick={() => handleExportZIP(pl.name, pl.tracks || [])}
                          disabled={isExportingZip !== null}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-violet-400 rounded transition cursor-pointer disabled:opacity-50"
                          title={`Export ${pl.name} as ZIP of MP3s`}
                        >
                          {isExportingZip === pl.name ? (
                            <span className="w-3.5 h-3.5 block border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <FolderArchive size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Informative Guidance Footer */}
        <div className="mt-4 p-3 rounded-lg bg-violet-500/5 border border-violet-500/10 flex items-start gap-2.5">
          <CheckCircle size={15} className="text-violet-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-zinc-400 leading-relaxed">
            <span className="font-semibold text-violet-400">Metadata Calibration Enabled:</span> Every exported MP3 contains high-fidelity <span className="font-mono text-zinc-300 font-bold">ID3v2.3</span> tags embedding the correct Title, Artist, and Album parameters. Media players like VLC, iTunes, or car receivers will parse track titles instantly. To play, simply load the M3U playlist file directly in your preferred external media player.
          </div>
        </div>
      </div>
    </div>
  );
}
