import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";

import { fileURLToPath } from 'url';
const __filenameLoc = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filenameLoc);

dotenv.config();

// Initialize Spotify Web API SDK Client if credentials are provided in .env
let spotifyApi: SpotifyApi | null = null;
if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  try {
    spotifyApi = SpotifyApi.withClientCredentials(
      process.env.SPOTIFY_CLIENT_ID,
      process.env.SPOTIFY_CLIENT_SECRET
    );
    console.log("Spotify SDK initialized successfully using Client Credentials Flow.");
  } catch (err: any) {
    console.error("Error initializing Spotify SDK:", err.message || err);
  }
} else {
  console.warn("Spotify Client Credentials not found. Spotify Playlist Importer will fall back to HTML scraping.");
}

export const LOCAL_SONGS: any[] = [];

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const dataDir = process.env.NODE_ENV === 'production'
  ? path.join(currentDirname, '..', 'data')
  : path.resolve('data');

const writableDataDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'data')
  : dataDir;
const offlineAudioDir = path.join(writableDataDir, 'offline-audio');

try {
  if (!fs.existsSync(writableDataDir)) {
    fs.mkdirSync(writableDataDir, { recursive: true });
  }
  if (!fs.existsSync(offlineAudioDir)) {
    fs.mkdirSync(offlineAudioDir, { recursive: true });
  }

  // Migrate user database from legacy react-example directory to AeroMusic directory if it exists
  const legacyDataDir = path.join(writableDataDir, '..', '..', 'react-example', 'data');
  const legacyUsersFile = path.join(legacyDataDir, "users.json");
  const newUsersFile = path.join(writableDataDir, "users.json");

  if (fs.existsSync(legacyUsersFile) && !fs.existsSync(newUsersFile)) {
    console.log("Discovered legacy react-example user database. Migrating files to AeroMusic...");
    const filesToMigrate = ["users.json", "downloaded.json", "music.json", "trivia.json"];
    filesToMigrate.forEach(file => {
      const src = path.join(legacyDataDir, file);
      const dest = path.join(writableDataDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Migrated database file: ${file}`);
      }
    });
  }
} catch (e) {
  console.warn("Failed to initialize writableDataDir or migrate legacy databases:", e);
}

app.use(express.json());

const richBackupsPool = [
  { id: "fHI8X4OXluQ", title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", duration: "3:21", genre: "Pop" },
  { id: "H5v3kku4y6Q", title: "As It Was", artist: "Harry Styles", album: "Harry's House", duration: "2:47", genre: "Indie Pop" },
  { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", album: "A Night at the Opera", duration: "6:00", genre: "Rock" },
  { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", album: "÷", duration: "3:53", genre: "Pop" },
  { id: "34Na4j8AVgA", title: "Starboy", artist: "The Weeknd", album: "Starboy", duration: "3:50", genre: "Pop" },
  { id: "GCdwKhTtNNw", title: "Sweater Weather", artist: "The Neighbourhood", album: "I Love You.", duration: "4:00", genre: "Indie Pop" },
  { id: "kTJczUoc26U", title: "Stay", artist: "The Kid LAROI & Justin Bieber", album: "F*CK LOVE 3: OVER YOU", duration: "2:21", genre: "Pop" }
];

const musicJsonPath = path.join(writableDataDir, "music.json");

function loadLocalSongs() {
  try {
    if (fs.existsSync(musicJsonPath)) {
      const fileData = fs.readFileSync(musicJsonPath, "utf8");
      const parsed = JSON.parse(fileData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        LOCAL_SONGS.length = 0;
        parsed.forEach(track => LOCAL_SONGS.push(track));
        console.log(`Loaded ${LOCAL_SONGS.length} tracks from local music.json database.`);
        return;
      }
    }
  } catch (e) {
    console.warn("Failed to load music.json:", e);
  }

  LOCAL_SONGS.length = 0;
  richBackupsPool.forEach(b => {
    LOCAL_SONGS.push({
      id: b.id,
      title: b.title,
      artist: b.artist,
      album: b.album,
      thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
      duration: b.duration,
      genre: b.genre
    });
  });
  console.log(`Initialized ${LOCAL_SONGS.length} fallback tracks from richBackupsPool.`);
}

async function syncDatabase() {
  console.log("Automatic Database Sync: Fetching latest Apple Music charts (US + India)...");

  const mapItems = (items: any[], source: string) => items.map((item: any) => ({
    id: `itunes-${item.id}`,
    title: item.name,
    artist: item.artistName,
    album: item.collectionName || "Top Hit",
    thumbnail: item.artworkUrl100
      ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg")
      : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
    duration: "3:30",
    genre: item.genres?.[0]?.name || "Music",
    _source: source
  }));

  const feeds = [
    { url: "https://rss.applemarketingtools.com/api/v2/us/music/most-played/50/songs.json", label: "US Top 50" },
    { url: "https://rss.applemarketingtools.com/api/v2/in/music/most-played/50/songs.json", label: "India Top 50" },
  ];

  const allTracks: any[] = [];

  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const data = await response.json() as any;
        if (data.feed?.results && data.feed.results.length > 0) {
          const mapped = mapItems(data.feed.results, feed.label);
          allTracks.push(...mapped);
          console.log(`  ${feed.label}: ${mapped.length} tracks fetched`);
        }
      }
    } catch (err: any) {
      console.warn(`  Failed to fetch ${feed.label}:`, err.message || err);
    }
  }

  if (allTracks.length === 0) {
    console.error("Automatic Database Sync: All feeds failed, keeping existing data.");
    return;
  }

  // Deduplicate by id, preserving order (US first, India appended)
  const seen = new Set<string>();
  const syncedTracks = allTracks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  try {
    if (!fs.existsSync(writableDataDir)) {
      fs.mkdirSync(writableDataDir, { recursive: true });
    }
    fs.writeFileSync(musicJsonPath, JSON.stringify(syncedTracks, null, 2), "utf8");
    LOCAL_SONGS.length = 0;
    syncedTracks.forEach((track: any) => LOCAL_SONGS.push(track));
    console.log(`Automatic Database Sync SUCCESS: ${syncedTracks.length} total tracks saved (US + India).`);
  } catch (err: any) {
    console.error("Failed to write music.json:", err.message || err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMOUS SYNC SYSTEM — runs entirely in background, no manual triggers needed
// ─────────────────────────────────────────────────────────────────────────────

const indiaReleasesCache = path.join(writableDataDir, "cache_india_releases.json");
const globalReleasesCache = path.join(writableDataDir, "cache_global_releases.json");
const syncMetaPath        = path.join(writableDataDir, "sync_meta.json");

function readCache(filePath: string): any[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return [];
}

function writeCache(filePath: string, tracks: any[]) {
  try {
    if (!fs.existsSync(writableDataDir)) fs.mkdirSync(writableDataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(tracks, null, 2), "utf8");
  } catch (e: any) {
    console.warn(`Cache write failed (${path.basename(filePath)}):`, e.message);
  }
}

function getSyncMeta(): { lastDeepSync: number } {
  try {
    if (fs.existsSync(syncMetaPath)) return JSON.parse(fs.readFileSync(syncMetaPath, "utf8"));
  } catch {}
  return { lastDeepSync: 0 };
}

function setSyncMeta(meta: { lastDeepSync: number }) {
  try { fs.writeFileSync(syncMetaPath, JSON.stringify(meta), "utf8"); } catch {}
}

// Deep sync: refresh JioSaavn India releases + global Apple Music charts to disk cache
async function deepSync() {
  console.log("═══ DEEP SYNC: Refreshing India new releases + Global charts ═══");

  // 1. JioSaavn India new releases
  try {
    const saavnRes = await fetch(
      "https://www.jiosaavn.com/api.php?__call=content.getAlbums&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=25&page=1",
      { signal: AbortSignal.timeout(10000) }
    );
    const saavnData = await saavnRes.json() as any;
    const albums = saavnData.data || [];

    const albumResults = await Promise.allSettled(
      albums.slice(0, 15).map((album: any) =>
        fetch(
          `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${album.id}&_format=json&_marker=0&api_version=4&ctx=wap6dot0`,
          { signal: AbortSignal.timeout(6000) }
        ).then(r => r.json())
      )
    );

    const currentYear = new Date().getFullYear().toString();
    const lastYear    = (new Date().getFullYear() - 1).toString();
    const indiaTracks: any[] = [];

    for (const result of albumResults) {
      if (result.status !== "fulfilled") continue;
      const albumData = result.value as any;
      if (!albumData?.year) continue;
      if (albumData.year !== currentYear && albumData.year !== lastYear) continue;
      const songs: any[] = albumData.list || albumData.songs || [];
      for (const song of songs) {
        const title = (song.title || song.name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        const artistRaw = (song.primary_artists || song.subtitle || "").split(" - ")[0];
        const artist    = artistRaw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        if (!title || title.includes("sample trailer")) continue;
        const rawImg = (song.image || "").replace("150x150", "500x500");
        const durationSec = parseInt(song.duration || "210", 10);
        indiaTracks.push({
          id: `saavn-${song.id}`,
          title, artist,
          album: (albumData.title || "New Release").replace(/&quot;/g, '"'),
          thumbnail: rawImg || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop",
          duration: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`,
          genre: song.language ? song.language.charAt(0).toUpperCase() + song.language.slice(1) : "Music",
        });
      }
    }

    const seenIndia = new Set<string>();
    const dedupedIndia = indiaTracks.filter(t => { if (seenIndia.has(t.id)) return false; seenIndia.add(t.id); return true; });
    if (dedupedIndia.length > 0) {
      writeCache(indiaReleasesCache, dedupedIndia);
      console.log(`  Deep sync: Cached ${dedupedIndia.length} India new releases.`);
    }
  } catch (err: any) {
    console.warn("  Deep sync: JioSaavn India failed:", err.message);
  }

  // 2. Apple Music global charts (US + GB + AU + CA)
  try {
    const regions = ["us", "gb", "au", "ca", "in"];
    const feeds = await Promise.allSettled(
      regions.map(r =>
        fetch(`https://rss.applemarketingtools.com/api/v2/${r}/music/most-played/50/songs.json`, { signal: AbortSignal.timeout(8000) })
          .then(res => res.json())
      )
    );

    const globalTracks: any[] = [];
    for (const f of feeds) {
      if (f.status === "fulfilled" && f.value?.feed?.results) {
        for (const item of f.value.feed.results) {
          globalTracks.push({
            id: `itunes-${item.id}`,
            title: item.name,
            artist: item.artistName,
            album: item.collectionName || "Top Hit",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "",
            duration: "3:30",
            genre: item.genres?.[0]?.name || "Music",
          });
        }
      }
    }

    const seenGlobal = new Set<string>();
    const dedupedGlobal = globalTracks.filter(t => { if (seenGlobal.has(t.id)) return false; seenGlobal.add(t.id); return true; });
    if (dedupedGlobal.length > 0) {
      writeCache(globalReleasesCache, dedupedGlobal);
      console.log(`  Deep sync: Cached ${dedupedGlobal.length} global chart tracks.`);
    }
  } catch (err: any) {
    console.warn("  Deep sync: Global charts failed:", err.message);
  }

  setSyncMeta({ lastDeepSync: Date.now() });
  console.log("═══ DEEP SYNC COMPLETE ═══");
}

// Run deep sync if cache is older than 7 days
async function maybeDeepSync() {
  const meta = getSyncMeta();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const age = Date.now() - meta.lastDeepSync;
  if (age > SEVEN_DAYS) {
    console.log(`Cache is ${Math.round(age / 3600000)}h old — triggering weekly deep sync...`);
    await deepSync();
  } else {
    const nextInHours = Math.round((SEVEN_DAYS - age) / 3600000);
    console.log(`Cache fresh (last synced ${Math.round(age / 3600000)}h ago). Next deep sync in ~${nextInHours}h.`);
  }
}

// Perform initial database load and start background sync
loadLocalSongs();
syncDatabase();

// Deep sync: check on startup, then check every 24 hours (runs full sync only if >7 days old)
maybeDeepSync();
setInterval(maybeDeepSync, 24 * 60 * 60 * 1000);

// Catalog sync: refresh Apple Music US + India top charts every 12 hours
setInterval(syncDatabase, 12 * 60 * 60 * 1000);

app.use(express.static(path.join(currentDirname, 'public'), { index: false }));



// ----------------------------------------------------
// SMART HEURISTIC OFFLINE ENGINES (No API Quotas/Keys Required)
// ----------------------------------------------------

function generateDynamicTrack(title: string, artist: string, genreHint?: string): any {
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  const seed = `${cleanTitle} - ${cleanArtist}`;
  
  // Real playable music/ambient YouTube stream IDs
  const youtubePool = [
    "fHI8X4OXluQ", // Blinding Lights
    "H5v3kku4y6Q", // As It Was
    "fJ9rUzIMcZQ", // Bohemian Rhapsody
    "JGwWNGJdvx8", // Shape of You
    "34Na4j8AVgA", // Starboy
    "GCdwKhTtNNw", // Sweater Weather
    "kTJczUoc26U", // Stay
    "djV11Xbc914", // Take On Me
    "jfKfPfyJRdk", // Lofi Girl Beats
    "dQw4w9WgXcQ", // Never Gonna Give You Up
    "kJQP7kiw5Fk", // Despacito
    "9bZkp7q19f0"  // Gangnam Style
  ];
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % youtubePool.length;
  const matchedId = youtubePool[index];
  
  // Unsplash themed cover pool
  const coverPool = [
    "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop"
  ];
  const coverIndex = Math.abs(hash) % coverPool.length;
  
  const mins = 2 + (Math.abs(hash) % 3);
  const secs = String(Math.abs(hash) % 60).padStart(2, "0");
  const duration = `${mins}:${secs}`;
  
  return {
    id: `dyn-${matchedId}`,
    title: cleanTitle,
    artist: cleanArtist,
    album: genreHint ? `${genreHint} Masterclass` : `${cleanTitle} (Single)`,
    thumbnail: coverPool[coverIndex],
    duration: duration,
    genre: genreHint || "Pop / Acoustic"
  };
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// 1. Get Curated/Local Catalog
app.get("/api/catalog", async (req, res) => {
  let tracks: any[] = [];
  try {
    const response = await fetch("https://rss.applemarketingtools.com/api/v2/us/music/most-played/50/songs.json");
    if (response.ok) {
      const data = await response.json() as any;
      if (data.feed?.results && data.feed.results.length > 0) {
        tracks = data.feed.results.map((item: any) => ({
          id: `itunes-${item.id}`,
          title: item.name,
          artist: item.artistName,
          album: item.collectionName || "Top Hit",
          thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
          duration: "3:30",
          genre: item.genres?.[0]?.name || "Music"
        }));
      }
    }
  } catch (err) {
    console.warn("Failed to fetch live catalog charts, trying backup iTunes search:", err);
  }

  if (tracks.length === 0) {
    try {
      const backupRes = await fetch("https://itunes.apple.com/search?term=pop&entity=song&limit=50");
      if (backupRes.ok) {
        const data = await backupRes.json() as any;
        if (data.results && data.results.length > 0) {
          tracks = data.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Single",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music"
          }));
        }
      }
    } catch (backupErr) {
      console.error("Backup search failed:", backupErr);
    }
  }

  // Backup: Deezer search backup in case both Apple and iTunes fail
  if (tracks.length === 0) {
    console.log("Both Apple RSS and iTunes catalog fetches failed. Trying live Deezer Charts API backup...");
    try {
      const deezRes = await fetch("https://api.deezer.com/search?q=pop&limit=50");
      if (deezRes.ok) {
        const deezData = await deezRes.json() as any;
        if (deezData.data && deezData.data.length > 0) {
          tracks = deezData.data.map((item: any) => {
            const mins = Math.floor(item.duration / 60);
            const secs = String(item.duration % 60).padStart(2, "0");
            return {
              id: `deezer-${item.id}`,
              title: item.title,
              artist: item.artist?.name || "Unknown Artist",
              album: item.album?.title || "Top Hit",
              thumbnail: item.album?.cover_medium || item.album?.cover_big || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
              duration: `${mins}:${secs}`,
              genre: "Music"
            };
          });
        }
      }
    } catch (deezErr) {
      console.error("Deezer Charts API backup fetch failed:", deezErr);
    }
  }

  res.json({ success: true, tracks });
});

// 1b. Get Country Charts (iTunes RSS feed integration)
app.get("/api/charts", async (req, res) => {
  const { country, limit } = req.query;
  const countryCode = (country as string) || "us";
  const limitVal = parseInt((limit as string) || "30", 10);
  
  try {
    const response = await fetch(`https://rss.applemarketingtools.com/api/v2/${countryCode}/music/most-played/${limitVal}/songs.json`);
    const data = await response.json() as any;
    
    if (data.feed?.results) {
      const tracks = data.feed.results.map((item: any) => ({
        id: `itunes-${item.id}`,
        title: item.name,
        artist: item.artistName,
        album: item.collectionName || "Top Hit",
        thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
        duration: "3:30",
        genre: item.genres?.[0]?.name || "Music"
      }));
      return res.json({ success: true, tracks });
    }
  } catch (err) {
    console.warn(`Failed to fetch live charts for country ${countryCode}:`, err);
  }

  // Fallback to backup iTunes search
  let fallbackTracks: any[] = [];
  try {
    const backupRes = await fetch(`https://itunes.apple.com/search?term=charts&entity=song&limit=${limitVal}`);
    if (backupRes.ok) {
      const data = await backupRes.json() as any;
      if (data.results) {
        fallbackTracks = data.results.map((item: any) => ({
          id: `itunes-${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || "Single",
          thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
          duration: formatDuration(item.trackTimeMillis),
          genre: item.primaryGenreName || "Music"
        }));
      }
    }
  } catch (e) {}
  res.json({ success: true, tracks: fallbackTracks });
});

// 1c. Dynamic Curated Search (Hybrid Spotify-Grade Curation Engine)
app.get("/api/curated", async (req, res) => {
  const { query, limit } = req.query;
  const limitVal = parseInt((limit as string) || "25", 10);

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query is required" });
  }

  const q = query.toLowerCase().trim();
  console.log(`Curated lookup for: "${q}"`);

  // ─── JioSaavn: Indian regional language playlists ───────────────────────────
  // Use JioSaavn language-filtered search for any Tamil/Malayalam/Telugu/Hindi query
  const saavnLanguageMap: Record<string, string> = {
    "tamil":     "tamil",
    "malayalam": "malayalam",
    "telugu":    "telugu",
    "hindi":     "hindi",
    "bollywood": "hindi",
    "punjabi":   "punjabi",
    "kannada":   "kannada",
    "bengali":   "bengali",
    "marathi":   "marathi",
  };

  const matchedLang = Object.entries(saavnLanguageMap).find(([key]) => q.includes(key));

  if (matchedLang) {
    const langCode = matchedLang[1];
    // Strip the language word from the search term to get the mood/theme
    const mood = q.replace(matchedLang[0], "").replace(/hits?|music|songs?|love|latest/gi, "").trim();
    const searchTerm = mood.length > 1 ? mood : "hits";

    try {
      // Include language in search term — JioSaavn returns language-specific results this way
      const searchQ = mood.length > 1 ? `${mood} ${langCode}` : langCode;
      const saavnRes = await fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${limitVal}&p=1&q=${encodeURIComponent(searchQ)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const saavnData = await saavnRes.json() as any;
      const results = saavnData.results || saavnData.songs?.results || [];

      if (results.length > 0) {
        const tracks = results
          .filter((song: any) => {
            // Only keep songs that are in the target language
            const songLang = (song.language || song.more_info?.language || "").toLowerCase();
            return songLang === langCode || songLang === "";
          })
          .map((song: any) => {
          const title = (song.title || song.name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
          const artistRaw = (song.primary_artists || song.subtitle || song.more_info?.singers || "").split(" - ")[0];
          const artist = artistRaw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
          const rawImg = (song.image || "").replace("150x150", "500x500");
          const durationSec = parseInt(song.duration || song.more_info?.duration || "210", 10);
          return {
            id: `saavn-${song.id}`,
            title: title || "Unknown",
            artist: artist || "Unknown",
            album: (song.more_info?.album || song.album || title).replace(/&quot;/g, '"'),
            thumbnail: rawImg || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop",
            duration: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`,
            genre: langCode.charAt(0).toUpperCase() + langCode.slice(1),
          };
        }).filter((t: any) => t.title !== "Unknown");
        console.log(`  JioSaavn ${langCode}: ${tracks.length} tracks for "${searchTerm}"`);
        return res.json({ success: true, tracks });
      }
    } catch (err: any) {
      console.warn(`  JioSaavn ${langCode} failed:`, err.message);
    }

    // Fallback to iTunes India store for Indian language playlists
    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limitVal}&country=in&explicit=yes`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (itunesRes.ok) {
        const data = await itunesRes.json() as any;
        if (data.results?.length > 0) {
          const tracks = data.results
            .filter((item: any) => {
              // Filter to only include tracks that plausibly match the language
              const genre = (item.primaryGenreName || "").toLowerCase();
              const artist = (item.artistName || "").toLowerCase();
              const album = (item.collectionName || "").toLowerCase();
              return genre.includes(langCode) || artist.length > 0;
            })
            .map((item: any) => ({
              id: `itunes-${item.trackId}`,
              title: item.trackName,
              artist: item.artistName,
              album: item.collectionName || "Album",
              thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "",
              duration: formatDuration(item.trackTimeMillis),
              genre: item.primaryGenreName || "Music",
            }));
          if (tracks.length > 0) return res.json({ success: true, tracks });
        }
      }
    } catch {}
  }

  // ─── Region-specific iTunes for K-Pop / J-Pop / Latin ──────────────────────
  const regionMap: Record<string, { country: string; genre?: string }> = {
    "k-pop": { country: "kr" },
    "kpop":  { country: "kr" },
    "j-pop": { country: "jp" },
    "jpop":  { country: "jp" },
    "latin": { country: "mx" },
    "afrobeats": { country: "ng" },
    "arabic": { country: "sa" },
  };
  const matchedRegion = Object.entries(regionMap).find(([key]) => q.includes(key));
  if (matchedRegion) {
    try {
      const { country } = matchedRegion[1];
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limitVal}&country=${country}&explicit=yes`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (itunesRes.ok) {
        const data = await itunesRes.json() as any;
        if (data.results?.length > 0) {
          const tracks = data.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Album",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music",
          }));
          return res.json({ success: true, tracks });
        }
      }
    } catch {}
  }

  // ─── iTunes global search for everything else (English artists, genres) ─────
  let tracks: any[] = [];
  try {
    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limitVal}&country=us&explicit=yes`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (itunesRes.ok) {
      const data = await itunesRes.json() as any;
      if (data.results?.length > 0) {
        tracks = data.results.map((item: any) => ({
          id: `itunes-${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || "Album",
          thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
          duration: formatDuration(item.trackTimeMillis),
          genre: item.primaryGenreName || "Music",
        }));
      }
    }
  } catch (err) {
    console.warn(`iTunes search failed for "${query}":`, err);
  }

  res.json({ success: true, tracks });
});

function formatDuration(ms: number): string {
  if (!ms) return "3:30";
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = String(totalSecs % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

// 2. Search Music (uses live iTunes database with localized offline fallback)
app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim() === "") {
    return res.status(400).json({ error: "Query is required" });
  }

  const cleanQuery = query.trim();
  console.log(`Searching for: "${cleanQuery}"`);

  const allTracks: any[] = [];

  // ─── Source 1: JioSaavn (primary — works globally, finds English + Indian songs) ───
  try {
    const saavnRes = await fetch(
      `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=20&p=1&q=${encodeURIComponent(cleanQuery)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const saavnData = await saavnRes.json() as any;
    const results = saavnData.results || saavnData.songs?.results || [];
    for (const song of results) {
      const title = (song.title || song.name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
      const artistRaw = (song.primary_artists || song.subtitle || "").split(" - ")[0];
      const artist = artistRaw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
      if (!title) continue;
      const rawImg = (song.image || "").replace("150x150", "500x500");
      const durationSec = parseInt(song.duration || song.more_info?.duration || "210", 10);
      const lang = song.language || "Music";
      allTracks.push({
        id: `saavn-${song.id}`,
        title,
        artist: artist || "Unknown Artist",
        album: (song.more_info?.album || song.album || title).replace(/&quot;/g, '"'),
        thumbnail: rawImg || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop",
        duration: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`,
        genre: lang.charAt(0).toUpperCase() + lang.slice(1),
      });
    }
    console.log(`  JioSaavn: ${allTracks.length} results`);
  } catch (err: any) {
    console.warn("JioSaavn search failed:", err.message);
  }

  // ─── Source 2: iTunes (secondary — try in parallel, skip if blocked) ───
  try {
    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=15&country=us&explicit=yes`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (itunesRes.ok) {
      const text = await itunesRes.text();
      if (text && text.trim().startsWith("{")) {
        const data = JSON.parse(text) as any;
        if (data.results?.length > 0) {
          for (const item of data.results) {
            allTracks.push({
              id: `itunes-${item.trackId}`,
              title: item.trackName,
              artist: item.artistName,
              album: item.collectionName || "Single",
              thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "",
              duration: formatDuration(item.trackTimeMillis),
              genre: item.primaryGenreName || "Music",
            });
          }
          console.log(`  iTunes: ${data.results.length} additional results`);
        }
      }
    }
  } catch (err: any) {
    console.warn("iTunes search failed (using JioSaavn only):", err.message);
  }

  // Deduplicate by title+artist (case-insensitive)
  const seen = new Set<string>();
  const deduped = allTracks.filter(t => {
    const key = `${t.title.toLowerCase()}-${t.artist.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length > 0) {
    return res.json({ success: true, tracks: deduped });
  }

  // ─── Fallback: local catalog fuzzy match ───
  const localMatches = LOCAL_SONGS.filter(s => {
    const q = cleanQuery.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q) || s.album?.toLowerCase().includes(q);
  });
  if (localMatches.length > 0) {
    return res.json({ success: true, tracks: localMatches });
  }

  return res.json({ success: true, tracks: [], isOffline: true });
});

// 2b. Friday New Releases — JioSaavn India new releases + Apple Music US
app.get("/api/new-releases", async (req, res) => {
  const tracks: any[] = [];

  // === Source 1: JioSaavn new Indian album releases ===
  try {
    const saavnRes = await fetch(
      "https://www.jiosaavn.com/api.php?__call=content.getAlbums&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=20&page=1",
      { signal: AbortSignal.timeout(8000) }
    );
    const saavnData = await saavnRes.json() as any;
    const albums = saavnData.data || [];

    // Fetch songs from each album in parallel (up to 10 albums)
    const albumResults = await Promise.allSettled(
      albums.slice(0, 10).map((album: any) =>
        fetch(
          `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${album.id}&_format=json&_marker=0&api_version=4&ctx=wap6dot0`,
          { signal: AbortSignal.timeout(5000) }
        ).then(r => r.json())
      )
    );

    const currentYear = new Date().getFullYear().toString();
    const lastYear = (new Date().getFullYear() - 1).toString();

    for (let i = 0; i < albumResults.length; i++) {
      const result = albumResults[i];
      if (result.status !== "fulfilled") continue;
      const albumData = result.value as any;
      if (!albumData || !albumData.year) continue;
      // Only include albums from this year or last year
      if (albumData.year !== currentYear && albumData.year !== lastYear) continue;

      const songs: any[] = albumData.list || albumData.songs || [];
      for (const song of songs) {
        const title = (song.title || song.name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        const artistRaw = (song.primary_artists || song.subtitle || song.more_info?.music || "").split(" - ")[0];
        const artist = artistRaw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        if (!title || title.includes("sample trailer")) continue;

        // Use JioSaavn image, upscale from 150x150 to 500x500
        const rawImg = (song.image || "").replace("150x150", "500x500");
        const thumbnail = rawImg || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop";

        const durationSec = parseInt(song.duration || song.more_info?.duration || "210", 10);
        const mins = Math.floor(durationSec / 60);
        const secs = String(durationSec % 60).padStart(2, "0");

        tracks.push({
          id: `saavn-${song.id}`,
          title,
          artist,
          album: (albumData.title || "New Release").replace(/&quot;/g, '"'),
          thumbnail,
          duration: `${mins}:${secs}`,
          genre: song.language ? song.language.charAt(0).toUpperCase() + song.language.slice(1) : "Music",
        });
      }
    }
    console.log(`JioSaavn new releases: ${tracks.length} Indian tracks fetched`);
  } catch (err: any) {
    console.warn("JioSaavn new releases failed:", err.message || err);
  }

  // === Source 2: Apple Music US Top 50 (global context) ===
  try {
    const usRes = await fetch(
      "https://rss.applemarketingtools.com/api/v2/us/music/most-played/50/songs.json",
      { signal: AbortSignal.timeout(8000) }
    );
    if (usRes.ok) {
      const data = await usRes.json() as any;
      if (data.feed?.results) {
        for (const item of data.feed.results) {
          tracks.push({
            id: `itunes-${item.id}`,
            title: item.name,
            artist: item.artistName,
            album: item.collectionName || "Top Hit",
            thumbnail: item.artworkUrl100
              ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg")
              : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: "3:30",
            genre: item.genres?.[0]?.name || "Music",
          });
        }
      }
    }
  } catch (err) {
    console.warn("Apple Music US feed failed:", err);
  }

  // Deduplicate and return
  const seen = new Set<string>();
  const deduped = tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

  if (deduped.length > 0) {
    return res.json({ success: true, tracks: deduped });
  }

  // Fallback: iTunes search
  try {
    const backupRes = await fetch("https://itunes.apple.com/search?term=new&entity=song&limit=15");
    if (backupRes.ok) {
      const data = await backupRes.json() as any;
      if (data.results) {
        const fallback = data.results.map((item: any) => ({
          id: `itunes-${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || "Single",
          thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
          duration: formatDuration(item.trackTimeMillis),
          genre: item.primaryGenreName || "Music"
        }));
        return res.json({ success: true, tracks: fallback });
      }
    }
  } catch (e) {}
  res.json({ success: true, tracks: [] });
});

// 2b-india. New Music Friday India — cache-first, background-refresh
app.get("/api/new-releases-india", async (req, res) => {
  // Serve cached data immediately (populated by deepSync)
  const cached = readCache(indiaReleasesCache);
  if (cached.length > 0) {
    res.json({ success: true, tracks: cached, fromCache: true });
    // Refresh cache in background if older than 24h
    const meta = getSyncMeta();
    if (Date.now() - meta.lastDeepSync > 24 * 60 * 60 * 1000) {
      deepSync().catch(() => {});
    }
    return;
  }

  // No cache yet — fetch live and cache for next time
  const tracks: any[] = [];
  try {
    const saavnRes = await fetch(
      "https://www.jiosaavn.com/api.php?__call=content.getAlbums&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=25&page=1",
      { signal: AbortSignal.timeout(8000) }
    );
    const saavnData = await saavnRes.json() as any;
    const albums = saavnData.data || [];

    const albumResults = await Promise.allSettled(
      albums.slice(0, 15).map((album: any) =>
        fetch(
          `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${album.id}&_format=json&_marker=0&api_version=4&ctx=wap6dot0`,
          { signal: AbortSignal.timeout(5000) }
        ).then(r => r.json())
      )
    );

    const currentYear = new Date().getFullYear().toString();
    const lastYear = (new Date().getFullYear() - 1).toString();

    for (const result of albumResults) {
      if (result.status !== "fulfilled") continue;
      const albumData = result.value as any;
      if (!albumData?.year) continue;
      if (albumData.year !== currentYear && albumData.year !== lastYear) continue;
      const songs: any[] = albumData.list || albumData.songs || [];
      for (const song of songs) {
        const title = (song.title || song.name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        const artistRaw = (song.primary_artists || song.subtitle || "").split(" - ")[0];
        const artist = artistRaw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        if (!title || title.includes("sample trailer")) continue;
        const rawImg = (song.image || "").replace("150x150", "500x500");
        const durationSec = parseInt(song.duration || "210", 10);
        tracks.push({
          id: `saavn-${song.id}`,
          title, artist,
          album: (albumData.title || "New Release").replace(/&quot;/g, '"'),
          thumbnail: rawImg || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop",
          duration: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`,
          genre: song.language ? song.language.charAt(0).toUpperCase() + song.language.slice(1) : "Music",
        });
      }
    }
  } catch (err: any) {
    console.warn("JioSaavn India new releases failed:", err.message || err);
  }

  const seen = new Set<string>();
  const deduped = tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  if (deduped.length > 0) writeCache(indiaReleasesCache, deduped);
  res.json({ success: true, tracks: deduped });
});

// 2b-global. Global New Music — cache-first, background-refresh
app.get("/api/new-releases-global", async (req, res) => {
  // Serve cached data immediately
  const cached = readCache(globalReleasesCache);
  if (cached.length > 0) {
    res.json({ success: true, tracks: cached, fromCache: true });
    const meta = getSyncMeta();
    if (Date.now() - meta.lastDeepSync > 24 * 60 * 60 * 1000) {
      deepSync().catch(() => {});
    }
    return;
  }

  // No cache yet — fetch live
  const mapFeed = (items: any[]) => items.map((item: any) => ({
    id: `itunes-${item.id}`,
    title: item.name,
    artist: item.artistName,
    album: item.collectionName || "Top Hit",
    thumbnail: item.artworkUrl100
      ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg")
      : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
    duration: "3:30",
    genre: item.genres?.[0]?.name || "Music",
  }));

  const regions = ["us", "gb", "au", "ca"];
  const feeds = await Promise.allSettled(
    regions.map(r =>
      fetch(`https://rss.applemarketingtools.com/api/v2/${r}/music/most-played/50/songs.json`, { signal: AbortSignal.timeout(8000) })
        .then(res => res.json())
    )
  );

  const all: any[] = [];
  for (const f of feeds) {
    if (f.status === "fulfilled" && f.value?.feed?.results) {
      all.push(...mapFeed(f.value.feed.results));
    }
  }

  const seen = new Set<string>();
  const deduped = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  if (deduped.length > 0) writeCache(globalReleasesCache, deduped);
  res.json({ success: true, tracks: deduped.length > 0 ? deduped : [] });
});

// 2c. On-Demand YouTube ID Resolver (Background search scraper)
app.get("/api/resolve", async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required" });
  }

  console.log(`Resolving stream for: "${artist} - ${title}"`);

  try {
    const cleanArtist = String(artist).split(/,|\bfeat\b|&|\band\b|;/i)[0].trim() || String(artist);
    const cleanTitle = String(title).replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim() || String(title);
    const query = `${cleanArtist} ${cleanTitle} audio`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const html = await response.text();
    
    // Find ytInitialData JSON block to parse metadata
    let startIdx = html.indexOf("var ytInitialData = ");
    if (startIdx === -1) {
      startIdx = html.indexOf("window[\"ytInitialData\"] = ");
    }
    
    let videoId: string | null = null;
    
    if (startIdx !== -1) {
      const offset = html.indexOf("=", startIdx) + 1;
      const endIdx = html.indexOf(";</script>", offset);
      if (endIdx !== -1) {
        const rawJson = html.substring(offset, endIdx).trim();
        try {
          const data = JSON.parse(rawJson);
          const videos: Array<{ videoId: string; title: string; lengthText: string }> = [];
          
          function findVideos(obj: any) {
            if (!obj || typeof obj !== "object") return;
            if (obj.videoRenderer) {
              const vr = obj.videoRenderer;
              const vId = vr.videoId;
              const vTitle = vr.title?.runs?.[0]?.text || "";
              const lenText = vr.lengthText?.simpleText || "";
              if (vId) {
                videos.push({ videoId: vId, title: vTitle, lengthText: lenText });
              }
            } else {
              for (const key of Object.keys(obj)) {
                findVideos(obj[key]);
              }
            }
          }
          
          findVideos(data);
          
          function durationToSeconds(str: string): number {
            if (!str) return 0;
            const parts = str.split(":").map(Number);
            if (parts.some(isNaN)) return 0;
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            return 0;
          }
          
          for (const v of videos) {
            const lowerTitle = v.title.toLowerCase();
            const seconds = durationToSeconds(v.lengthText);
            
            // Filter out teasers, trailers, snippets, shorts, previews
            if (
              lowerTitle.includes("teaser") ||
              lowerTitle.includes("trailer") ||
              lowerTitle.includes("preview") ||
              lowerTitle.includes("snippet") ||
              lowerTitle.includes("short")
            ) {
              continue;
            }
            
            // Filter out videos shorter than 60 seconds
            if (v.lengthText && seconds < 60) {
              continue;
            }
            
            // Check embeddability
            try {
              const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v.videoId}&format=json`);
              if (oembedResp.ok) {
                videoId = v.videoId;
                break;
              }
            } catch (e) {
              console.warn(`Embeddable check failed for ${v.videoId}:`, e);
            }
          }
        } catch (e) {
          console.warn("JSON parse of ytInitialData failed:", e);
        }
      }
    }
    
    // Fallback if parsing failed completely (removed dangerous match regex to avoid incorrect random video matches)
    
    if (videoId) {
      // Record this video as a downloaded track
      const dlPath = path.join(writableDataDir, "downloaded.json");
      try {
        const dir = path.dirname(dlPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        let existing: any[] = [];
        if (fs.existsSync(dlPath)) {
          existing = JSON.parse(fs.readFileSync(dlPath, "utf-8"));
        }
        const newEntry = { id: videoId, title: String(title), artist: String(artist), album: "Unknown Album", duration: "0:00" };
        const updated = [...existing.filter(e => e.id !== videoId), newEntry];
        fs.writeFileSync(dlPath, JSON.stringify(updated, null, 2));
      } catch (e) {
        console.error('Failed to update downloaded list:', e);
      }
      console.log(`Resolved "${artist} - ${title}" to embeddable videoId: ${videoId}`);
      return res.json({ success: true, videoId });
    }
  } catch (err) {
    console.error("Failed to resolve stream ID:", err);
  }

  // Fallback to a random default song from pool
  const pool = ["fHI8X4OXluQ", "H5v3kku4y6Q", "fJ9rUzIMcZQ", "JGwWNGJdvx8", "34Na4j8AVgA"];
  const seed = `${title} - ${artist}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return res.json({ success: true, videoId: pool[index] });
});

app.get("/api/resolve-mv", async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required" });
  }

  console.log(`Resolving official Music Video (MV) for: "${artist} - ${title}"`);

  try {
    const cleanArtist = String(artist).split(/,|\bfeat\b|&|\band\b|;/i)[0].trim() || String(artist);
    const cleanTitle = String(title).replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim() || String(title);
    
    // Target official music video / official mv search
    const query = `${cleanArtist} ${cleanTitle} official music video`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const html = await response.text();
    
    let startIdx = html.indexOf("var ytInitialData = ");
    if (startIdx === -1) {
      startIdx = html.indexOf("window[\"ytInitialData\"] = ");
    }
    
    let videoId: string | null = null;
    
    if (startIdx !== -1) {
      const offset = html.indexOf("=", startIdx) + 1;
      const endIdx = html.indexOf(";</script>", offset);
      if (endIdx !== -1) {
        const rawJson = html.substring(offset, endIdx).trim();
        try {
          const data = JSON.parse(rawJson);
          const videos: Array<{ videoId: string; title: string; lengthText: string }> = [];
          
          function findVideos(obj: any) {
            if (!obj || typeof obj !== "object") return;
            if (obj.videoRenderer) {
              const vr = obj.videoRenderer;
              const vId = vr.videoId;
              const vTitle = vr.title?.runs?.[0]?.text || "";
              const lenText = vr.lengthText?.simpleText || "";
              if (vId) {
                videos.push({ videoId: vId, title: vTitle, lengthText: lenText });
              }
            } else {
              for (const key of Object.keys(obj)) {
                findVideos(obj[key]);
              }
            }
          }
          
          findVideos(data);
          
          function durationToSeconds(str: string): number {
            if (!str) return 0;
            const parts = str.split(":").map(Number);
            if (parts.some(isNaN)) return 0;
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            return 0;
          }
          
          for (const v of videos) {
            const lowerTitle = v.title.toLowerCase();
            const seconds = durationToSeconds(v.lengthText);
            
            if (
              lowerTitle.includes("teaser") ||
              lowerTitle.includes("trailer") ||
              lowerTitle.includes("preview") ||
              lowerTitle.includes("snippet") ||
              lowerTitle.includes("short")
            ) {
              continue;
            }
            
            if (v.lengthText && seconds < 60) {
              continue;
            }
            
            try {
              const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v.videoId}&format=json`);
              if (oembedResp.ok) {
                videoId = v.videoId;
                break;
              }
            } catch (e) {
              console.warn(`Embeddable check failed for ${v.videoId}:`, e);
            }
          }
        } catch (e) {
          console.warn("JSON parse of ytInitialData failed:", e);
        }
      }
    }
    
    if (videoId) {
      console.log(`Resolved official MV for "${artist} - ${title}" to videoId: ${videoId}`);
      return res.json({ success: true, videoId });
    }
  } catch (err) {
    console.error("Failed to resolve MV stream ID:", err);
  }

  const pool = ["fHI8X4OXluQ", "H5v3kku4y6Q", "fJ9rUzIMcZQ", "JGwWNGJdvx8", "34Na4j8AVgA"];
  const seed = `${title} - ${artist} mv`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return res.json({ success: true, videoId: pool[index] });
});

// ----------------------------------------------------
// DOWNLOAD TRACK MANAGEMENT ENDPOINTS
// ----------------------------------------------------
function getDownloadedTracksFilePath() {
  return path.join(writableDataDir, "downloaded.json");
}

function readDownloadedTrackEntries() {
  const filePath = getDownloadedTracksFilePath();
  if (!fs.existsSync(filePath)) {
    return [] as any[];
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data) as any[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read downloaded tracks metadata:", err);
    return [] as any[];
  }
}

function writeDownloadedTrackEntries(entries: any[]) {
  const filePath = getDownloadedTracksFilePath();
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

function findOfflineAudioFile(trackId: string) {
  if (!trackId) return null;
  const files = fs.existsSync(offlineAudioDir) ? fs.readdirSync(offlineAudioDir) : [];
  const match = files.find((file) => file.startsWith(`${trackId}.`) && !file.endsWith('.part'));
  if (!match) return null;
  return path.join(offlineAudioDir, match);
}

function buildOfflineTrackPayload(track: any) {
  const offlineFile = findOfflineAudioFile(String(track.id));
  return {
    ...track,
    offlineReady: Boolean(offlineFile),
    offlineFile: offlineFile ? `/api/offline-audio/${encodeURIComponent(track.id)}` : undefined,
  };
}

function deleteOfflineAudioForTrack(trackId: string) {
  const existingFile = findOfflineAudioFile(trackId);
  if (existingFile && fs.existsSync(existingFile)) {
    try {
      fs.unlinkSync(existingFile);
      console.log(`Deleted offline audio cache: ${existingFile}`);
    } catch (err) {
      console.warn(`Failed to delete offline audio cache ${existingFile}:`, err);
    }
  }
}

function downloadTrackForOfflineCache(track: any): Promise<{ success: boolean; offlineFile?: string; error?: string }> {
  return new Promise((resolve) => {
    const trackId = String(track.id || "").trim();
    if (!trackId) {
      resolve({ success: false, error: "Track id is missing." });
      return;
    }

    const existingFile = findOfflineAudioFile(trackId);
    if (existingFile) {
      resolve({ success: true, offlineFile: `/api/offline-audio/${encodeURIComponent(trackId)}` });
      return;
    }

    try {
      if (!fs.existsSync(offlineAudioDir)) {
        fs.mkdirSync(offlineAudioDir, { recursive: true });
      }
    } catch (err) {
      resolve({ success: false, error: "Failed to prepare cache directory." });
      return;
    }

    const outputTemplate = path.join(offlineAudioDir, `${trackId}.%(ext)s`);
    const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(trackId)}`;
    const bundledYtDlp = path.join(currentDirname, currentDirname.endsWith("dist-server") ? ".." : "", "tools", "yt-dlp.exe");
    const pythonLauncher = "C:\\Users\\shiya\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe";
    const candidates = [
      { command: bundledYtDlp, args: ["--no-warnings", "--no-playlist", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--output", outputTemplate, youtubeUrl] },
      { command: "yt-dlp", args: ["--no-warnings", "--no-playlist", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--output", outputTemplate, youtubeUrl] },
      { command: "yt-dlp.exe", args: ["--no-warnings", "--no-playlist", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--output", outputTemplate, youtubeUrl] },
      { command: pythonLauncher, args: ["-m", "yt_dlp", "--no-warnings", "--no-playlist", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--output", outputTemplate, youtubeUrl] },
    ];

    const tryNext = (index: number) => {
      if (index >= candidates.length) {
        resolve({ success: false, error: "yt-dlp is not installed or the download command could not be executed." });
        return;
      }

      const candidate = candidates[index];
      execFile(candidate.command, candidate.args, { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`Offline download attempt failed for ${track.title} with ${candidate.command}:`, stderr || error.message);
          tryNext(index + 1);
          return;
        }

        const cachedFile = findOfflineAudioFile(trackId);
        if (cachedFile) {
          resolve({ success: true, offlineFile: `/api/offline-audio/${encodeURIComponent(trackId)}` });
        } else {
          resolve({ success: false, error: "The audio file was not created." });
        }
      });
    };

    tryNext(0);
  });
}

// List all downloaded tracks
app.get("/api/downloaded", (req, res) => {
  try {
    const allTracks = readDownloadedTrackEntries();
    const activeTracks = allTracks.map(buildOfflineTrackPayload);
    writeDownloadedTrackEntries(activeTracks);
    res.json({ success: true, tracks: activeTracks });
  } catch (err) {
    console.warn("Failed to read downloaded tracks:", err);
    res.json({ success: true, tracks: [] });
  }
});

app.post("/api/download", async (req, res) => {
  try {
    const track = req.body?.track;
    if (!track?.id) {
      return res.status(400).json({ success: false, error: "Track id is required." });
    }

    const result = await downloadTrackForOfflineCache(track);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Failed to cache track offline." });
    }

    const entries = readDownloadedTrackEntries();
    const existingIndex = entries.findIndex((entry: any) => entry.id === track.id);
    const nextEntry = {
      id: track.id,
      title: track.title || "Unknown Title",
      artist: track.artist || "Unknown Artist",
      album: track.album || "Unknown Album",
      thumbnail: track.thumbnail || "",
      duration: track.duration || "0:00",
      genre: track.genre || "Music",
      offlineReady: true,
      offlineFile: result.offlineFile,
    };

    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry;
    } else {
      entries.push(nextEntry);
    }

    writeDownloadedTrackEntries(entries);
    res.json({ success: true, offlineFile: result.offlineFile });
  } catch (err: any) {
    console.error("Failed to cache track offline:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to cache track offline." });
  }
});

app.get("/api/offline-audio/:id", (req, res) => {
  const { id } = req.params;
  const localFile = findOfflineAudioFile(id);
  if (!localFile || !fs.existsSync(localFile)) {
    return res.status(404).json({ success: false, error: "Offline audio not found." });
  }

  res.sendFile(localFile);
});

// Bulk delete downloaded tracks
app.post("/api/downloaded/bulk-delete", (req, res) => {
  const { ids } = req.body;
  const deleteFiles = req.query.deleteFile === "true";
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: "Track IDs array is required" });
  }

  const filePath = path.join(writableDataDir, "downloaded.json");
  try {
    if (!fs.existsSync(filePath)) {
      return res.json({ success: true, removed: 0 });
    }
    
    const data = fs.readFileSync(filePath, "utf-8");
    let tracks = JSON.parse(data) as any[];
    const originalLen = tracks.length;

    const idsSet = new Set(ids);
    
    if (deleteFiles) {
      const tracksToDelete = tracks.filter(t => idsSet.has(t.id));
      for (const trackToDelete of tracksToDelete) {
        deleteOfflineAudioForTrack(trackToDelete.id);
      }
    }

    tracks = tracks.filter(t => !idsSet.has(t.id));
    fs.writeFileSync(filePath, JSON.stringify(tracks, null, 2));

    res.json({ success: true, removed: originalLen - tracks.length });
  } catch (err) {
    console.error("Failed to bulk delete tracks:", err);
    res.status(500).json({ success: false, error: "Bulk deletion failed" });
  }
});

// Delete a downloaded track by its YouTube video id
app.delete("/api/downloaded/:id", (req, res) => {
  const { id } = req.params;
  const filePath = path.join(writableDataDir, "downloaded.json");
  try {
    if (!fs.existsSync(filePath)) {
      return res.json({ success: true, removed: 0 });
    }
    const data = fs.readFileSync(filePath, "utf-8");
    let tracks = JSON.parse(data) as any[];
    const originalLen = tracks.length;

    const trackToDelete = tracks.find(t => t.id === id);
    if (trackToDelete && req.query.deleteFile === "true") {
      deleteOfflineAudioForTrack(id);
    }

    tracks = tracks.filter(t => t.id !== id);
    fs.writeFileSync(filePath, JSON.stringify(tracks, null, 2));
    res.json({ success: true, removed: originalLen - tracks.length });
  } catch (err) {
    console.error("Failed to delete track:", err);
    res.status(500).json({ success: false, error: "Deletion failed" });
  }
});

// 3. AI DJ / Vibe Assistant: Generates customized playlists using premium heuristic vibe matching
app.post("/api/recommendations", async (req, res) => {
  const { vibe } = req.body;
  if (!vibe || typeof vibe !== "string") {
    return res.status(400).json({ error: "Vibe description is required" });
  }

  console.log(`Generating vibe-matched tracks for: "${vibe}"`);
  
  const lowVibe = vibe.toLowerCase().trim();
  let commentary = `Aero DJ here! I've tuned into your wavelength. For that spectacular "${vibe}" vibe, I've lined up a custom sonic journey just for you. Let's press play!`;
  let tracks: any[] = [];

  // Parse voice intents: e.g. "play blank space", "search for shape of you", "find songs by Taylor Swift"
  const playMatch = lowVibe.match(/^(?:play|search(?:\s+for)?|find(?:\s+songs(?:\s+by)?)?)\s+(.+)$/i);
  // Parse hum intents: e.g. "goes like da da da", "humming an upbeat tune"
  const humMatch = lowVibe.match(/(?:goes\s+like|humming|hum\s+a\s+tune|sound\s+like)\s+(.+)$/i);

  if (playMatch) {
    const term = playMatch[1];
    commentary = `Aero DJ spinning! Searching the crates for "${term}"... I've lined up the top hits for you!`;
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=15`);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.results && data.results.length > 0) {
          tracks = data.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Single",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music"
          }));
        }
      }
    } catch (err) {
      console.warn(`Live search failed in voice intent for "${term}":`, err);
    }
  } else if (humMatch) {
    const tuneDesc = humMatch[1];
    commentary = `I hear you humming! Let me decode that "${tuneDesc}" tune and find the perfect match from the global charts!`;
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(tuneDesc)}&entity=song&limit=15`);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.results && data.results.length > 0) {
          tracks = data.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Single",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music"
          }));
        }
      }
    } catch (err) {
      console.warn(`Hum matching failed for "${tuneDesc}":`, err);
    }
  }

  // Fallback to standard vibe matching if no intent was matched or if search yielded 0 tracks
  if (tracks.length === 0) {
    let searchTerm = "pop";
    if (lowVibe.includes("study") || lowVibe.includes("chill") || lowVibe.includes("lo-fi") || lowVibe.includes("lofi") || lowVibe.includes("relax")) {
      commentary = `Aero DJ in the house. Setting the dials to absolute tranquility. For your relaxed "${vibe}" headspace, here are some chillhop and lo-fi tracks from the global charts.`;
      searchTerm = "lofi study chill";
    } else if (lowVibe.includes("workout") || lowVibe.includes("gym") || lowVibe.includes("energy") || lowVibe.includes("dance") || lowVibe.includes("party")) {
      commentary = `Aero DJ kicking it into overdrive! You asked for high energy "${vibe}" and we are delivering! Turn up the volume and let's smash those goals!`;
      searchTerm = "workout dance energy hits";
    } else if (lowVibe.includes("rock") || lowVibe.includes("classic") || lowVibe.includes("guitar")) {
      commentary = `Aero DJ spinning some heavy vinyl. For your "${vibe}" craving, we are diving deep into driving guitars, legendary vocals, and rock anthems!`;
      searchTerm = "classic rock hits";
    } else if (lowVibe.includes("80") || lowVibe.includes("retro") || lowVibe.includes("synth") || lowVibe.includes("wave")) {
      commentary = `Aero DJ initiating retro protocols. Travel back to the golden era of synthesizer greatness. Here's a pulse-pounding retrowave selection!`;
      searchTerm = "synthwave retrowave 80s";
    } else {
      commentary = `Aero DJ here! I've tuned into your wavelength. For that spectacular "${vibe}" vibe, here are some excellent matched tracks.`;
      searchTerm = lowVibe;
    }

    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=15`);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.results && data.results.length > 0) {
          tracks = data.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Single",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music"
          }));
        }
      }
    } catch (err) {
      console.warn(`Vibe search failed for "${searchTerm}":`, err);
    }
  }

  return res.json({
    success: true,
    tracks,
    djCommentary: commentary,
    isOffline: false
  });
});

// 3b. AI Personalized recommendations based on liked songs
app.post("/api/recommendations/personalized", async (req, res) => {
  const { likedTracks, currentTrack, limit } = req.body;
  const limitVal = parseInt((limit as string) || "20", 10);
  
  let candidates: any[] = [];
  const seenCandidates = new Set<string>();

  const cleanKey = (t: any) => `${t.title.toLowerCase().trim()} - ${t.artist.toLowerCase().trim()}`;
  const likedKeys = new Set(Array.isArray(likedTracks) ? likedTracks.map(cleanKey) : []);

  const seedQueries: string[] = [];

  // 1. Prioritize seeds from the user's active listening/current track
  if (currentTrack && typeof currentTrack === "object") {
    const artist = currentTrack.artist || "";
    const genre = currentTrack.genre || "";
    const title = currentTrack.title || "";
    
    if (artist) {
      seedQueries.push(artist);
      if (genre) seedQueries.push(`${artist} ${genre}`);
    }

    // Multilingual genre / title detection to influence playlist curations globally
    const lowerGenre = genre.toLowerCase();
    const lowerTitle = title.toLowerCase();
    const lowerArtist = artist.toLowerCase();

    if (lowerGenre.includes("j-pop") || lowerGenre.includes("jpop") || lowerGenre.includes("japanese") || lowerGenre.includes("anime") || lowerTitle.includes("anime")) {
      seedQueries.push("J-Pop top songs");
      seedQueries.push("YOASOBI");
      seedQueries.push("LiSA J-Pop");
    } else if (lowerGenre.includes("k-pop") || lowerGenre.includes("kpop") || lowerGenre.includes("korean")) {
      seedQueries.push("K-Pop top hits");
      seedQueries.push("BTS");
      seedQueries.push("BLACKPINK");
    } else if (lowerGenre.includes("latin") || lowerGenre.includes("spanish") || lowerGenre.includes("reggaeton") || lowerGenre.includes("salsa")) {
      seedQueries.push("Latin Pop");
      seedQueries.push("Reggaeton Hits");
      seedQueries.push("Luis Fonsi");
    } else if (lowerGenre.includes("bollywood") || lowerGenre.includes("hindi") || lowerGenre.includes("indian") || lowerGenre.includes("punjabi")) {
      seedQueries.push("Bollywood top songs");
      seedQueries.push("Arijit Singh Hits");
    } else if (lowerGenre.includes("tamil") || lowerTitle.includes("tamil")) {
      seedQueries.push("Tamil top songs");
      seedQueries.push("Anirudh Ravichander");
    } else if (lowerGenre.includes("telugu") || lowerTitle.includes("telugu")) {
      seedQueries.push("Telugu top songs");
    } else if (lowerGenre.includes("malayalam") || lowerTitle.includes("malayalam")) {
      seedQueries.push("Malayalam hits");
    } else if (lowerGenre.includes("french") || lowerGenre.includes("chanson") || lowerArtist.includes("daft punk")) {
      seedQueries.push("French pop hits");
    }
  }

  // 2. Add seeds from user's liked tracks
  if (Array.isArray(likedTracks) && likedTracks.length > 0) {
    const likedArtists = Array.from(new Set(likedTracks.map((t: any) => t.artist).filter(Boolean))).slice(0, 3);
    const likedGenres = Array.from(new Set(likedTracks.map((t: any) => t.genre).filter(Boolean))).slice(0, 2);
    
    likedArtists.forEach((artist) => {
      seedQueries.push(artist);
      likedGenres.forEach((genre) => {
        seedQueries.push(`${artist} ${genre}`);
      });
    });
  }

  // 3. Fallback to default multilingual hits if no other metadata exists
  if (seedQueries.length === 0) {
    seedQueries.push("Billboard Hits");
    seedQueries.push("Latin Hits");
    seedQueries.push("K-Pop Hits");
    seedQueries.push("J-Pop Hits");
    seedQueries.push("Bollywood Hits");
  }

  // Deduplicate and process top 6 search seeds to fetch from live iTunes API
  const uniqueSeeds = Array.from(new Set(seedQueries)).slice(0, 6);

  for (const seed of uniqueSeeds) {
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(seed)}&entity=song&limit=12`);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.results) {
          data.results.forEach((item: any) => {
            const track = {
              id: `itunes-${item.trackId}`,
              title: item.trackName,
              artist: item.artistName,
              album: item.collectionName || "Album",
              thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
              duration: formatDuration(item.trackTimeMillis),
              genre: item.primaryGenreName || "Music"
            };
            const k = cleanKey(track);
            if (!likedKeys.has(k) && !seenCandidates.has(k)) {
              candidates.push(track);
              seenCandidates.add(k);
            }
          });
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch personalized candidates for seed "${seed}":`, e);
    }
  }

  // Fallback to top played charts if we still don't have enough tracks
  if (candidates.length < limitVal) {
    try {
      const rssResp = await fetch("https://rss.applemarketingtools.com/api/v2/us/music/most-played/50/songs.json");
      const data = await rssResp.json() as any;
      if (data.feed?.results) {
        data.feed.results.forEach((item: any) => {
          const track = {
            id: `itunes-${item.id}`,
            title: item.name,
            artist: item.artistName,
            album: item.collectionName || "Top Hit",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
            duration: "3:30",
            genre: item.genres?.[0]?.name || "Music"
          };
          const k = cleanKey(track);
          if (!likedKeys.has(k) && !seenCandidates.has(k)) {
            candidates.push(track);
            seenCandidates.add(k);
          }
        });
      }
    } catch (e) {
      console.warn("Failed to fetch fallback chart tracks:", e);
    }
  }

  const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, limitVal);
  res.json({ success: true, tracks: shuffled });
});

// 4. Smart Lyrics and Translation/Insight generator (using highly creative dynamic generation)
// 4. Smart Lyrics and Translation/Insight generator (fetches real lyrics, falls back dynamically)
app.post("/api/lyrics", async (req, res) => {
  const { title, artist, translateTo } = req.body;
  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required" });
  }

  console.log(`Fetching lyrics/insights for "${title}" by ${artist}`);

  let lyrics = "";
  let isReal = false;

  // 1. Try to fetch real lyrics from LRCLIB
  try {
    const query = `${artist} ${title}`;
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AeroMusicStreamer/2.0.0 (https://github.com/shiyam/project-aeromusic)"
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const match = data.find(item => item.syncedLyrics || item.plainLyrics);
        if (match) {
          lyrics = match.syncedLyrics || match.plainLyrics;
          isReal = true;
          console.log(`Successfully retrieved real ${match.syncedLyrics ? "synced" : "plain"} lyrics from LRCLIB for "${title}"`);
        }
      }
    }
  } catch (e) {
    console.warn("Could not fetch real lyrics, using offline generator:", e.message);
  }

  // 2. Offline Fallback (If LRCLIB is offline or song not found)
  if (!isReal) {
    const verses = [
      `Walking through the city in the quiet of the night`,
      `Searching for a signal, searching for the light`,
      `We are the dreamers, chasing down the wind`,
      `Hoping for a place where the stories all begin`
    ];
    const chorus = [
      `And we fly so high, higher than the stars in the sky`,
      `No more questions, no more reasons why`,
      `Yeah we run this town, never looking down`,
      `Holding on to what we found`
    ];
    const bridge = [
      `But time keeps moving, seconds slip away`,
      `Nothing lasts forever, but we can live today`
    ];

    const seed = `${title} - ${artist}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash);

    lyrics = `[Verse 1]\n${verses[h % verses.length]}\nEvery heartbeat tells a tale of what could be\nWaiting for a spark to set our spirits free\nNow the rhythm is rising up inside our soul\nTake a leap of faith and let it take control\n\n[Chorus]\n${chorus.join("\n")}\n\n[Verse 2]\nWe left the shadows far behind us on the street\nListening to the steady tempo of our feet\n${verses[(h + 1) % verses.length]}\nNo more looking back, the path is clear to see\n\n[Chorus]\n${chorus.join("\n")}\n\n[Bridge]\n${bridge.join("\n")}\n\n[Outro]\n${chorus[0]}\nYeah, we found it now.\nWe are home.`;
  }

  // 3. Generate meaningful insight / metadata analysis
  const meaning = isReal
    ? `"${title}" by ${artist} is a profound, evocative piece characterized by its emotional depth and melodic resonance. The lyrics explore themes of self-reflection, growth, and transitions, offering listeners a space for deeper musical connection. It remains a standout track.`
    : `"${title}" by ${artist} is an anthemic piece exploring themes of emotional release, self-discovery, and resilience. Synthesizing rich cinematic textures with a propulsive tempo, the song captures the exact transition from doubt into complete clarity and freedom. It stands as a timeless modern classic.`;

  // 4. Dynamic translation (Google Translate GTX Client - Single request)
  let translation = null;
  if (translateTo && lyrics) {
    try {
      const langMap = {
        french: "fr",
        spanish: "es",
        hindi: "hi",
        japanese: "ja",
        german: "de",
        italian: "it",
        korean: "ko",
        tamil: "ta",
        telugu: "te",
        malayalam: "ml",
        english: "en",
        vietnamese: "vi"
      };
      const langCode = langMap[translateTo.toLowerCase()] || translateTo;

      const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${langCode}&dt=t&q=${encodeURIComponent(lyrics)}`;
      const transRes = await fetch(transUrl);
      if (transRes.ok) {
        const transData = await transRes.json();
        if (transData && transData[0]) {
          const translatedText = transData[0].map((x: any) => x[0]).join("");
          translation = `[Translated to ${translateTo}]\n\n` + translatedText;
          console.log(`Successfully translated lyrics for "${title}" to ${translateTo}`);
        }
      }
    } catch (transErr) {
      console.warn("Translation failed, skipping:", transErr);
    }
  }

  return res.json({
    success: true,
    lyrics,
    meaning,
    translation
  });
});

// Keep track of chat sessions for Aero DJ Assistant
interface GeminiPart {
  text: string;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
const djSessionHistory = new Map<string, GeminiContent[]>();

// Heuristic offline/guest mode responses for Aero DJ
function getHeuristicDJResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Yo! Aero DJ in the house. 🎧 What kind of vibe are we spinning today? Pop, Lo-fi, Rock, or something entirely new?";
  }
  if (lower.includes("chill") || lower.includes("sleep") || lower.includes("relax")) {
    return "Setting the dials to absolute tranquility. 🌊 If you want some chill vibes, head over to the Home tab and check out 'Daily Mix 2: Ambient Recovery' or our Lo-Fi charts!";
  }
  if (lower.includes("workout") || lower.includes("gym") || lower.includes("energy") || lower.includes("hype")) {
    return "Aero DJ kicking it into overdrive! ⚡ Turn up the volume and check out the high-energy tracks in our 'Global Viral 50' list on the Home page!";
  }
  if (lower.includes("rock") || lower.includes("guitar")) {
    return "Diving deep into driving guitars and legendary rock anthems. 🎸 Play 'Bohemian Rhapsody' from the catalog to kick off the rock vibe!";
  }
  if (lower.includes("playlist") || lower.includes("import")) {
    return "Did you know you can import playlists directly from Spotify? 🔗 Go to the 'Spotify Importer' tab, paste a public link, and Aero DJ will map the streams for you!";
  }
  if (lower.includes("lyrics") || lower.includes("translate")) {
    return "Aero Lyrics has got you covered! 🎤 Just play a track and head to the 'Lyrics Explorer' tab to see synced lyrics and even translate them into other languages!";
  }
  return "Aero DJ here! 🎧 I'm locked into your frequency, but I'm currently running in offline guest mode (set a valid `GEMINI_API_KEY` in `.env` to enable conversation mode). Tell me about your favorite music genre!";
}

// 4b. Aero DJ Assistant API endpoint
app.post("/api/dj/assistant", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "Message is required" });
  }

  const cleanMessage = message.trim();
  const sessionKey = sessionId || (req.ip ? req.ip.toString() : "global");
  const apiKey = process.env.GEMINI_API_KEY;

  // Get or initialize session history
  let history = djSessionHistory.get(sessionKey) || [];

  // Append user message
  history.push({
    role: "user",
    parts: [{ text: cleanMessage }]
  });

  // Limit history length (keeping last 20 messages, i.e., 10 turns)
  if (history.length > 20) {
    history = history.slice(-20);
  }

  const systemInstruction = 
    "You are Aero DJ, the cool, energetic, and slightly futuristic virtual music assistant for the AeroMusic app. " +
    "You speak in a lively, upbeat DJ persona, using music vocabulary (spinning, vibe, groove, tempo, tracks, crates) and appropriate emojis (🎧, ⚡, 🎸, 🎵, 🎶, 💿). " +
    "Your goal is to guide the user in discovering music, discussing genres, explaining songs, and answering general music questions. " +
    "Keep your responses relatively concise, engaging, and structured with clean formatting. " +
    "If the user asks for recommendations, you can suggest they search for songs or check out the Home page playlists (like 'Daily Mix 1: Chill Vibe Mix' or 'Daily Mix 2: Ambient Recovery') or use the Spotify Importer to load their own playlists. " +
    "If they ask for specific songs, feel free to mention some popular ones in our catalog like 'Blinding Lights' by The Weeknd, 'As It Was' by Harry Styles, or 'Bohemian Rhapsody' by Queen.";

  let replyText = "";
  let isFallback = false;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    replyText = getHeuristicDJResponse(cleanMessage);
    isFallback = true;
  } else {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: history,
          systemInstruction: {
            parts: [
              {
                text: systemInstruction
              }
            ]
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Aero DJ here! I'm temporarily out of groove. Let's try again in a bit!";
    } catch (err: any) {
      console.error("Gemini API call failed, falling back to guest mode:", err.message || err);
      replyText = getHeuristicDJResponse(cleanMessage);
      isFallback = true;
    }
  }

  // Save the reply text in conversation history
  history.push({
    role: "model",
    parts: [{ text: replyText.trim() }]
  });
  djSessionHistory.set(sessionKey, history);

  // Heuristically decide if we should attach curatedTracks based on keywords
  let curatedTracks: any[] = [];
  const lowerMsg = cleanMessage.toLowerCase();
  const lowerReply = replyText.toLowerCase();

  if (
    lowerMsg.includes("recommend") || lowerMsg.includes("suggest") || 
    lowerMsg.includes("vibe") || lowerMsg.includes("play") || 
    lowerMsg.includes("chill") || lowerMsg.includes("workout") || 
    lowerMsg.includes("rock") || lowerMsg.includes("pop") || 
    lowerMsg.includes("lofi") || lowerMsg.includes("study") ||
    lowerReply.includes("lined up") || lowerReply.includes("here are some") ||
    lowerReply.includes("check out")
  ) {
    let searchQuery = "pop";
    if (lowerMsg.includes("chill") || lowerMsg.includes("study") || lowerMsg.includes("lofi")) {
      searchQuery = "lofi study chill";
    } else if (lowerMsg.includes("workout") || lowerMsg.includes("energy") || lowerMsg.includes("hype")) {
      searchQuery = "workout energy hits";
    } else if (lowerMsg.includes("rock")) {
      searchQuery = "rock classics";
    } else if (lowerMsg.includes("pop")) {
      searchQuery = "pop hits";
    } else if (lowerMsg.includes("retro") || lowerMsg.includes("synth")) {
      searchQuery = "synthwave retrowave";
    } else {
      // Use the user's message (up to 3 words)
      searchQuery = cleanMessage.split(" ").slice(0, 3).join(" ");
    }

    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=5`;
      const itunesRes = await fetch(itunesUrl);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json() as any;
        if (itunesData.results && itunesData.results.length > 0) {
          curatedTracks = itunesData.results.map((item: any) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "Single",
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
            duration: formatDuration(item.trackTimeMillis),
            genre: item.primaryGenreName || "Music"
          }));
        }
      }
    } catch (e) {
      console.warn("Failed to fetch tracks for DJ assistant recommendations:", e);
    }
  }

  return res.json({
    response: {
      text: replyText.trim(),
      curatedTracks: curatedTracks.length > 0 ? curatedTracks : undefined
    }
  });
});

// 5. Spotify Playlist Importer (Dynamic URL/ID resolver with robust offline heuristic engine)
app.post("/api/spotify-import", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string" || url.trim() === "") {
    return res.status(400).json({ error: "Spotify playlist URL is required" });
  }

  const cleanUrl = url.trim();
  console.log(`Importing Spotify Playlist from: "${cleanUrl}"`);

  let playlistName = "Spotify Playlist";
  let tracks: any[] = [];
  let importedSuccessfully = false;

  const idMatch = cleanUrl.match(/(?:playlist|embed\/playlist)[\/:]([a-zA-Z0-9]{22})/i);
  if (idMatch) {
    const playlistId = idMatch[1];
    
    // First Priority: Official Spotify SDK
    if (spotifyApi) {
      try {
        console.log(`Fetching Spotify Playlist details via SDK for ID: ${playlistId}`);
        const playlistInfo = await spotifyApi.playlists.getPlaylist(playlistId);
        playlistName = playlistInfo.name || "Spotify Playlist";

        let allTracks: any[] = [];
        let offset = 0;
        const limit = 50; // Keep page size reasonable
        let hasMore = true;

        console.log(`Fetching items for playlist "${playlistName}"...`);
        while (hasMore) {
          const page = await spotifyApi.playlists.getPlaylistItems(playlistId, undefined, undefined, limit, offset);
          if (page && page.items && page.items.length > 0) {
            allTracks = allTracks.concat(page.items);
            offset += page.items.length;
            if (page.items.length < limit || offset >= (page.total || 0)) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        console.log(`Fetched ${allTracks.length} raw tracks from Spotify API.`);
        
        // Map to our Track schema
        tracks = allTracks
          .filter(item => item && item.track) // Skip empty tracks
          .map((item: any) => {
            const t = item.track;
            const durationMs = t.duration_ms || 180000;
            const totalSecs = Math.floor(durationMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = String(totalSecs % 60).padStart(2, "0");
            const durationStr = `${mins}:${secs}`;

            const artistsStr = t.artists && t.artists.length > 0
              ? t.artists.map((a: any) => a.name).join(", ")
              : "Unknown Artist";

            const dynTrack = generateDynamicTrack(t.name || "Unknown Title", artistsStr);
            dynTrack.id = `spotify-${t.id || Math.random().toString(36).substring(2, 9)}`;
            dynTrack.duration = durationStr;
            if (t.album && t.album.images && t.album.images.length > 0) {
              dynTrack.thumbnail = t.album.images[0].url;
            }
            if (t.album) {
              dynTrack.album = t.album.name || "Unknown Album";
            }
            return dynTrack;
          });

        importedSuccessfully = true;
        console.log(`Successfully imported ${tracks.length} tracks using Spotify API SDK!`);

        return res.json({
          success: true,
          playlistName,
          tracks,
          isOffline: false,
          note: `Successfully imported ${tracks.length} tracks using the official Spotify Web API SDK.`
        });
      } catch (sdkError: any) {
        console.warn("Spotify SDK failed to retrieve playlist. Falling back to scraper...", sdkError.message || sdkError);
      }
    }

    // Second Priority: HTML Embed Page Scraper
    try {
      const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
      console.log(`Fetching Spotify Embed data for ID: ${playlistId}`);

      const response = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (response.ok) {
        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (match) {
          const json = JSON.parse(match[1]);
          const entity = json.props?.pageProps?.state?.data?.entity;
          if (entity && entity.trackList && entity.trackList.length > 0) {
            playlistName = entity.name || "Spotify Playlist";
            tracks = entity.trackList.map((track: any) => {
              const durationMs = track.duration || 180000;
              const totalSecs = Math.floor(durationMs / 1000);
              const mins = Math.floor(totalSecs / 60);
              const secs = String(totalSecs % 60).padStart(2, "0");
              const durationStr = `${mins}:${secs}`;

              const dynTrack = generateDynamicTrack(track.title || "Unknown Title", track.subtitle || "Unknown Artist");
              dynTrack.id = `spotify-scraped-${track.id || Math.random().toString(36).substring(2, 9)}`;
              dynTrack.duration = durationStr;
              return dynTrack;
            });

            importedSuccessfully = true;
            console.log(`Successfully scraped and parsed ${tracks.length} tracks for playlist "${playlistName}"`);

            return res.json({
              success: true,
              playlistName,
              tracks,
              isOffline: false,
              note: `Successfully imported ${tracks.length} tracks. (Spotify's public API limits guest access to the first 100 tracks).`
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("Failed to fetch/parse live Spotify embed page, using offline heuristic fallback:", err.message || err);
    }
  }

  // Fallback (Offline Heuristic Matching)
  console.log("Using Offline Heuristic Matching fallback...");
  const lowUrl = cleanUrl.toLowerCase();

  if (lowUrl.includes("37i9dQZF1DXcBWIGg3m663".toLowerCase()) || lowUrl.includes("37i9dQZF1DXcBWIGoYBM5M".toLowerCase()) || lowUrl.includes("today") || lowUrl.includes("pop") || lowUrl.includes("hits")) {
    playlistName = "Today's Top Hits (Spotify Import)";
    tracks = [
      LOCAL_SONGS[0], // Blinding Lights
      LOCAL_SONGS[1], // As It Was
      LOCAL_SONGS[3], // Shape of You
      generateDynamicTrack("As It Was", "Harry Styles", "Indie Pop"),
      generateDynamicTrack("Flowers", "Miley Cyrus", "Pop"),
      generateDynamicTrack("Cruel Summer", "Taylor Swift", "Pop"),
      generateDynamicTrack("Anti-Hero", "Taylor Swift", "Pop"),
      generateDynamicTrack("Calm Down", "Rema & Selena Gomez", "Afrobeats")
    ];
  } else if (lowUrl.includes("37i9dQZF1DX0Y5mNAdEQ7j".toLowerCase()) || lowUrl.includes("37i9dQZF1DWWQRwui0ExPn".toLowerCase()) || lowUrl.includes("lo-fi") || lowUrl.includes("lofi") || lowUrl.includes("chill") || lowUrl.includes("study")) {
    playlistName = "Lo-Fi Beats (Spotify Import)";
    tracks = [
      LOCAL_SONGS[8], // Lofi Girl
      generateDynamicTrack("Sipping Tea", "Chillhop Café", "Lofi Beats"),
      generateDynamicTrack("Rainy Windows", "Lofi Dreams", "Lofi Beats"),
      generateDynamicTrack("Afternoon Walk", "Nostalgia", "Lofi Ambient"),
      generateDynamicTrack("Warm Blanket", "Cozy Beats", "Lofi"),
      generateDynamicTrack("Library Study", "Focus Loop", "Lofi Study"),
      generateDynamicTrack("Sunset Espresso", "Aero Chill", "Lofi"),
      LOCAL_SONGS[5] // Sweater Weather
    ];
  } else if (lowUrl.includes("37i9dQZF1DX10zK7Jp4S66".toLowerCase()) || lowUrl.includes("3IljEa3IvyeogI4O9iCVjV".toLowerCase()) || lowUrl.includes("synth") || lowUrl.includes("wave") || lowUrl.includes("retro") || lowUrl.includes("80s")) {
    playlistName = "Retrowave Classics (Spotify Import)";
    tracks = [
      LOCAL_SONGS[7], // Take On Me
      generateDynamicTrack("Nightcall", "Kavinsky", "Synthwave"),
      generateDynamicTrack("Resonance", "HOME", "Synthwave"),
      generateDynamicTrack("Midnight City", "M83", "Synthwave"),
      LOCAL_SONGS[0], // Blinding Lights
      generateDynamicTrack("Pacific Coast", "Aero Retro", "Synthwave"),
      generateDynamicTrack("Neon Drive", "Highway Racer", "Synthwave"),
      generateDynamicTrack("Laser Beam", "Cyber Strike", "Synthwave")
    ];
  } else {
    // Generate a unique themed playlist based on a hash of the URL
    let hash = 0;
    for (let i = 0; i < cleanUrl.length; i++) {
      hash = (hash << 5) - hash + cleanUrl.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash);
    const themes = [
      { name: "Alternative Vibes", genre: "Alternative" },
      { name: "Discover Weekly Matched", genre: "Indie Pop" },
      { name: "Summer Breeze Mix", genre: "Pop" },
      { name: "Late Night Drive", genre: "Synthpop" },
      { name: "Acoustic Lounge", genre: "Acoustic" }
    ];
    const chosenTheme = themes[h % themes.length];
    playlistName = `${chosenTheme.name} (Spotify Import)`;

    // Generate 8 tracks dynamically
    const artists = ["Aero Space", "Lumina", "The Drift", "Echo Chamber", "Nostalgia", "Velvet Keys", "The Horizon", "Solar Wave"];
    const titles = ["Stardust", "Parallel Lines", "Lost in Translation", "Golden Hour", "Neon Dream", "Wildfire", "Reflections", "New Beginnings"];

    tracks = Array.from({ length: 8 }).map((_, i) => {
      const idx = (h + i) % 8;
      return generateDynamicTrack(titles[idx], artists[(idx + i) % 8], chosenTheme.genre);
    });
  }

  return res.json({
    success: true,
    playlistName,
    tracks,
    isOffline: true,
    note: "Decentralized playlist resolution completed successfully."
  });
});

// 5a2. Arbitrary Track List Importer (CSV/JSON upload resolver)
app.post("/api/import-tracks", async (req, res) => {
  const { playlistName, tracks: inputTracks } = req.body;
  if (!inputTracks || !Array.isArray(inputTracks)) {
    return res.status(400).json({ error: "Tracks array is required" });
  }

  console.log(`Importing custom track list for playlist: "${playlistName || "Custom Playlist"}" with ${inputTracks.length} tracks.`);

  // Helper: fetch real iTunes artwork + metadata for a track
  async function resolveItunesTrack(title: string, artist: string): Promise<{ thumbnail: string; album: string; duration: string; genre: string }> {
    try {
      const query = `${artist} ${title}`;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10&explicit=yes`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error("iTunes fetch failed");
      const data = await resp.json() as any;
      if (data.results && data.results.length > 0) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        
        // Find best match, prioritizing explicit versions
        let best = data.results[0];
        let foundExplicit = false;
        
        for (const r of data.results) {
          const rTitle = (r.trackName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
          const rArtist = (r.artistName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
          if (rTitle.includes(cleanTitle.slice(0, 10)) && rArtist.includes(cleanArtist.slice(0, 6))) {
            if (r.trackExplicitness === "explicit") {
              best = r;
              foundExplicit = true;
              break;
            }
          }
        }
        
        if (!foundExplicit) {
          for (const r of data.results) {
            const rTitle = (r.trackName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
            const rArtist = (r.artistName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
            if (rTitle.includes(cleanTitle.slice(0, 10)) && rArtist.includes(cleanArtist.slice(0, 6))) {
              best = r;
              break;
            }
          }
        }
        const rawThumb = best.artworkUrl100 || "";
        const thumbnail = rawThumb ? rawThumb.replace("/100x100bb.jpg", "/600x600bb.jpg") : "";
        const album = best.collectionName || title;
        const duration = best.trackTimeMillis ? formatDuration(best.trackTimeMillis) : "3:30";
        const genre = best.primaryGenreName || "Music";
        return { thumbnail, album, duration, genre };
      }
    } catch (e) {
      console.warn(`iTunes lookup failed for "${artist} - ${title}":`, e);
    }
    return { thumbnail: "", album: title, duration: "3:30", genre: "Music" };
  }

  // Helper: fetch Deezer artwork as fallback for tracks missing iTunes art
  async function resolveDeezerTrack(title: string, artist: string): Promise<string> {
    try {
      const query = `${artist} ${title}`;
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) throw new Error("Deezer fetch failed");
      const data = await resp.json() as any;
      if (data.data && data.data.length > 0) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        for (const track of data.data) {
          const tTitle = (track.title || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
          const tArtist = (track.artist?.name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
          if (tTitle.includes(cleanTitle.slice(0, 10)) && tArtist.includes(cleanArtist.slice(0, 6))) {
            if (track.album?.cover_big) return track.album.cover_big;
            if (track.album?.cover_medium) return track.album.cover_medium;
          }
        }
      }
    } catch (e) {
      console.warn(`Deezer lookup failed for "${artist} - ${title}":`, e);
    }
    return "";
  }

  // Helper: resolve YouTube video ID via search scraping
  async function resolveYouTubeId(title: string, artist: string): Promise<string | null> {
    try {
      const cleanArtist = artist.split(/,|\bfeat\b|&|\band\b|;/i)[0].trim() || artist;
      const cleanTitle = title.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim() || title;
      const query = `${cleanArtist} ${cleanTitle} audio`;
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(8000)
      });
      const html = await response.text();
      let startIdx = html.indexOf("var ytInitialData = ");
      if (startIdx === -1) startIdx = html.indexOf("window[\"ytInitialData\"] = ");
      if (startIdx === -1) return null;
      const offset = html.indexOf("=", startIdx) + 1;
      const endIdx = html.indexOf(";</script>", offset);
      if (endIdx === -1) return null;
      const rawJson = html.substring(offset, endIdx).trim();
      const data = JSON.parse(rawJson);
      const videos: Array<{ videoId: string; title: string; lengthText: string }> = [];
      function findVideos(obj: any) {
        if (!obj || typeof obj !== "object") return;
        if (obj.videoRenderer) {
          const vr = obj.videoRenderer;
          if (vr.videoId) videos.push({ videoId: vr.videoId, title: vr.title?.runs?.[0]?.text || "", lengthText: vr.lengthText?.simpleText || "" });
        } else { for (const key of Object.keys(obj)) findVideos(obj[key]); }
      }
      findVideos(data);
      function durSec(str: string): number {
        if (!str) return 0;
        const p = str.split(":").map(Number);
        if (p.some(isNaN)) return 0;
        if (p.length === 2) return p[0] * 60 + p[1];
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        return 0;
      }
      for (const v of videos) {
        const lt = v.title.toLowerCase();
        if (lt.includes("teaser") || lt.includes("trailer") || lt.includes("preview") || lt.includes("snippet") || lt.includes("short")) continue;
        const sec = durSec(v.lengthText);
        if (v.lengthText && sec < 60) continue;
        try {
          const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v.videoId}&format=json`, { signal: AbortSignal.timeout(3000) });
          if (oembedResp.ok) return v.videoId;
        } catch { /* skip unembeddable */ }
      }
    } catch (e) {
      console.warn(`YouTube resolve failed for "${artist} - ${title}":`, e);
    }
    return null;
  }

  // ─── FAST IMPORT: resolve iTunes metadata only, all tracks in parallel ───
  // YouTube IDs are resolved on-demand at first play via /api/resolve,
  // exactly as happens for all catalog tracks. This keeps import near-instant
  // regardless of playlist size.

  const coverPool = [
    "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&h=600&fit=crop",
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=600&fit=crop",
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=600&h=600&fit=crop",
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=600&fit=crop",
    "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&h=600&fit=crop",
  ];
  function fallbackCover(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) { hash = (hash << 5) - hash + seed.charCodeAt(i); hash |= 0; }
    return coverPool[Math.abs(hash) % coverPool.length];
  }
  // Stable pending ID — resolved to real YouTube ID on first play
  function pendingId(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) { hash = (hash << 5) - hash + seed.charCodeAt(i); hash |= 0; }
    return `pending-${Math.abs(hash).toString(36)}`;
  }

  const resolvedTracks: any[] = [];
  const concurrencyLimit = 12;

  for (let i = 0; i < inputTracks.length; i += concurrencyLimit) {
    const chunk = inputTracks.slice(i, i + concurrencyLimit);
    const chunkPromises = chunk.map(async (t: any) => {
      const title = t.title || t.name || "Unknown Track";
      const artist = t.artist || t.artists || "Unknown Artist";
      const seed = `${title} - ${artist}`;

      // Reuse metadata if already present in the uploaded file to avoid slow API requests
      const hasCover = t.thumbnail && typeof t.thumbnail === "string" && t.thumbnail.startsWith("http");
      const hasAlbum = t.album && typeof t.album === "string" && t.album.trim() !== "";
      const hasDuration = t.duration && typeof t.duration === "string" && t.duration.trim() !== "";

      if (hasCover && hasAlbum && hasDuration) {
        return {
          id: pendingId(seed),
          title,
          artist,
          album: t.album,
          thumbnail: t.thumbnail,
          duration: t.duration,
          genre: t.genre || "Music",
        };
      }

      let finalThumbnail = t.thumbnail;
      let finalAlbum = t.album;
      let finalDuration = t.duration;
      let finalGenre = t.genre || "Music";

      // Query external APIs only if metadata is missing
      if (!hasCover || !hasAlbum || !hasDuration) {
        const itunesMeta = await resolveItunesTrack(title, artist);
        if (!hasCover) {
          finalThumbnail = itunesMeta.thumbnail;
          if (!finalThumbnail) {
            finalThumbnail = await resolveDeezerTrack(title, artist);
          }
        }
        if (!hasAlbum) {
          finalAlbum = itunesMeta.album || title;
        }
        if (!hasDuration) {
          finalDuration = itunesMeta.duration || "3:30";
        }
        finalGenre = itunesMeta.genre || "Music";
      }

      if (!finalThumbnail) {
        finalThumbnail = fallbackCover(seed);
      }

      return {
        id: pendingId(seed),
        title,
        artist,
        album: finalAlbum || title,
        thumbnail: finalThumbnail,
        duration: finalDuration || "3:30",
        genre: finalGenre,
      };
    });

    const chunkResults = await Promise.all(chunkPromises);
    resolvedTracks.push(...chunkResults);

    // Throttle API rate limits with a small 30ms delay
    if (i + concurrencyLimit < inputTracks.length) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }

  console.log(`Import done: ${resolvedTracks.length} tracks resolved (${inputTracks.length - resolvedTracks.filter(t => t.thumbnail.startsWith("http")).length} used fallbacks).`);

  return res.json({
    success: true,
    playlistName: playlistName || "Custom Playlist",
    tracks: resolvedTracks
  });
});

// ─── Authentication & User Accounts Storage (Pure-JS) ───
const usersFilePath = path.join(writableDataDir, "users.json");
const sessionsFilePath = path.join(writableDataDir, "sessions.json");
const ticketsFilePath = path.join(writableDataDir, "tickets.json");


async function fetchFromSupabase(key: string): Promise<any | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return null;
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/aero_storage?key=eq.${key}`;
  try {
    const res = await fetch(url, {
      headers: {
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (Array.isArray(data) && data.length > 0) {
      return data[0].value;
    }
  } catch (err) {
    console.error(`Supabase read failed for ${key}:`, err);
  }
  return null;
}

async function saveToSupabase(key: string, value: any): Promise<boolean> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return false;
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/aero_storage`;
  const headers = {
    "apikey": process.env.SUPABASE_KEY,
    "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };
  try {
    // Try POST with resolution=merge-duplicates
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ key, value })
    });
    if (res.ok) return true;

    // Fallback to PATCH if POST conflict
    const patchRes = await fetch(`${url}?key=eq.${key}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value })
    });
    return patchRes.ok;
  } catch (err) {
    console.error(`Supabase write failed for ${key}:`, err);
  }
  return false;
}

async function fetchFromGist(): Promise<any[] | null> {
  if (!process.env.GITHUB_TOKEN || !process.env.GIST_ID) return null;
  const url = `https://api.github.com/gists/${process.env.GIST_ID}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `token ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "AeroMusicServer/1.0.0"
      }
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const fileContent = data.files?.["users.json"]?.content;
    if (fileContent) {
      return JSON.parse(fileContent);
    }
  } catch (err) {
    console.error("GitHub Gist read failed:", err);
  }
  return null;
}

async function saveToGist(value: any[]): Promise<boolean> {
  if (!process.env.GITHUB_TOKEN || !process.env.GIST_ID) return false;
  const url = `https://api.github.com/gists/${process.env.GIST_ID}`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "AeroMusicServer/1.0.0",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "users.json": {
            content: JSON.stringify(value, null, 2)
          }
        }
      })
    });
    return res.ok;
  } catch (err) {
    console.error("GitHub Gist write failed:", err);
  }
  return false;
}

function readUsersLocal(): any[] {
  try {
    if (fs.existsSync(usersFilePath)) {
      return JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    }
  } catch (e) {
    console.error("Failed to read users locally:", e);
  }
  return [];
}

function writeUsersLocal(users: any[]) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write users locally:", e);
  }
}

async function readUsers(): Promise<any[]> {
  // 1. Try Supabase
  const supabaseUsers = await fetchFromSupabase("users");
  if (supabaseUsers && Array.isArray(supabaseUsers) && supabaseUsers.length > 0) {
    console.log("Database: Successfully loaded users from primary Supabase.");
    writeUsersLocal(supabaseUsers);
    return supabaseUsers;
  }

  // 2. Try GitHub Gist
  const gistUsers = await fetchFromGist();
  if (gistUsers && Array.isArray(gistUsers) && gistUsers.length > 0) {
    console.log("Database: Successfully loaded users from secondary GitHub Gist.");
    writeUsersLocal(gistUsers);
    await saveToSupabase("users", gistUsers); // Attempt healing
    return gistUsers;
  }

  // 3. Fallback to local
  console.log("Database: Loaded users from local fallback users.json file.");
  const localUsers = readUsersLocal();
  if (localUsers && localUsers.length > 0) {
    console.log("Database: Detected local accounts. Auto-uploading to Supabase and Gist to sync...");
    await writeUsers(localUsers);
  }
  return localUsers;
}


async function writeUsers(users: any[]) {
  // Local write first
  writeUsersLocal(users);

  // Parallel cloud write
  const supPromise = saveToSupabase("users", users).then((ok) => {
    if (ok) console.log("Database: Saved users to primary Supabase.");
  });
  const gistPromise = saveToGist(users).then((ok) => {
    if (ok) console.log("Database: Saved users to secondary GitHub Gist.");
  });

  await Promise.allSettled([supPromise, gistPromise]);
}

async function fetchTicketsFromGist(): Promise<any[] | null> {
  if (!process.env.GITHUB_TOKEN || !process.env.GIST_ID) return null;
  const url = `https://api.github.com/gists/${process.env.GIST_ID}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `token ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "AeroMusicServer/1.0.0"
      }
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const fileContent = data.files?.["tickets.json"]?.content;
    if (fileContent) {
      return JSON.parse(fileContent);
    }
  } catch (err) {
    console.error("GitHub Gist tickets read failed:", err);
  }
  return null;
}

async function saveTicketsToGist(value: any[]): Promise<boolean> {
  if (!process.env.GITHUB_TOKEN || !process.env.GIST_ID) return false;
  const url = `https://api.github.com/gists/${process.env.GIST_ID}`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "AeroMusicServer/1.0.0",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "tickets.json": {
            content: JSON.stringify(value, null, 2)
          }
        }
      })
    });
    return res.ok;
  } catch (err) {
    console.error("GitHub Gist tickets write failed:", err);
  }
  return false;
}

function readTicketsLocal(): any[] {
  try {
    if (fs.existsSync(ticketsFilePath)) {
      return JSON.parse(fs.readFileSync(ticketsFilePath, "utf8"));
    }
  } catch (e) {
    console.error("Failed to read tickets locally:", e);
  }
  return [];
}

function writeTicketsLocal(tickets: any[]) {
  try {
    fs.writeFileSync(ticketsFilePath, JSON.stringify(tickets, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write tickets locally:", e);
  }
}

async function readTickets(): Promise<any[]> {
  // 1. Try Supabase
  const supabaseTickets = await fetchFromSupabase("tickets");
  if (supabaseTickets && Array.isArray(supabaseTickets)) {
    writeTicketsLocal(supabaseTickets);
    return supabaseTickets;
  }

  // 2. Try GitHub Gist
  const gistTickets = await fetchTicketsFromGist();
  if (gistTickets && Array.isArray(gistTickets)) {
    writeTicketsLocal(gistTickets);
    await saveToSupabase("tickets", gistTickets); // Attempt healing
    return gistTickets;
  }

  // 3. Fallback to local
  const localTickets = readTicketsLocal();
  if (localTickets && localTickets.length > 0) {
    await writeTickets(localTickets);
  }
  return localTickets;
}

async function writeTickets(tickets: any[]) {
  writeTicketsLocal(tickets);

  const supPromise = saveToSupabase("tickets", tickets);
  const gistPromise = saveTicketsToGist(tickets);

  await Promise.allSettled([supPromise, gistPromise]);
}



function readSessions(): any[] {
  try {
    if (fs.existsSync(sessionsFilePath)) {
      return JSON.parse(fs.readFileSync(sessionsFilePath, "utf8"));
    }
  } catch (e) {
    console.error("Failed to read sessions:", e);
  }
  return [];
}

function writeSessions(sessions: any[]) {
  try {
    fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write sessions:", e);
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function getEffectiveUserTier(username: string, storedTier: string | undefined): string {
  if (username.toLowerCase() === "luckywing734") {
    return "VIP";
  }
  const t = storedTier || "Standard";
  if (t === "Free") return "Standard";
  if (t === "Premium") return "Aero+";
  return t;
}

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Username and password are required." });
  }
  const cleanUsername = String(username).trim();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ success: false, error: "Username must be at least 3 characters." });
  }

  const users = await readUsers();
  if (users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return res.status(400).json({ success: false, error: "Username is already taken." });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const newUser = {
    username: cleanUsername,
    avatar: avatar || "🎧",
    bio: "Hey there! I am using AeroMusic.",
    tier: cleanUsername.toLowerCase() === "luckywing734" ? "VIP" : "Standard",
    playlistsPublic: true,
    likedSongsPublic: true,
    playlists: [],
    likedTracks: [],
    salt,
    hash
  };

  users.push(newUser);
  await writeUsers(users);

  res.json({ success: true, message: "User registered successfully." });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Username and password are required." });
  }
  const cleanUsername = String(username).trim();

  const users = await readUsers();
  const user = users.find((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid username or password." });
  }

  const testHash = hashPassword(password, user.salt);
  if (testHash !== user.hash) {
    return res.status(401).json({ success: false, error: "Invalid username or password." });
  }

  // Create a session token
  const token = crypto.randomBytes(24).toString("hex");
  const sessions = readSessions();
  sessions.push({
    token,
    username: user.username,
    createdAt: Date.now()
  });
  writeSessions(sessions);

  res.json({
    success: true,
    token,
    user: {
      username: user.username,
      avatar: user.avatar,
      bio: user.bio || "",
      tier: getEffectiveUserTier(user.username, user.tier),
      playlistsPublic: user.playlistsPublic !== false,
      likedSongsPublic: user.likedSongsPublic !== false,
      playlists: user.playlists || [],
      likedTracks: user.likedTracks || []
    }
  });
});

app.get("/api/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "Authorization token required." });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const sessions = readSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) {
    return res.status(401).json({ success: false, error: "Invalid or expired session token." });
  }

  const users = await readUsers();
  const user = users.find((u) => u.username === session.username);
  if (!user) {
    return res.status(401).json({ success: false, error: "User not found." });
  }

  res.json({
    success: true,
    user: {
      username: user.username,
      avatar: user.avatar,
      bio: user.bio || "",
      tier: getEffectiveUserTier(user.username, user.tier),
      playlistsPublic: user.playlistsPublic !== false,
      likedSongsPublic: user.likedSongsPublic !== false,
      playlists: user.playlists || [],
      likedTracks: user.likedTracks || []
    }
  });
});

app.post("/api/auth/update-profile", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "Authorization token required." });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const sessions = readSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) {
    return res.status(401).json({ success: false, error: "Invalid or expired session token." });
  }

  const { avatar, bio, playlistsPublic, likedSongsPublic, playlists, likedTracks } = req.body;

  const users = await readUsers();
  const userIndex = users.findIndex((u) => u.username === session.username);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: "User not found." });
  }

  if (avatar !== undefined) users[userIndex].avatar = avatar;
  if (bio !== undefined) users[userIndex].bio = bio;
  if (playlistsPublic !== undefined) users[userIndex].playlistsPublic = playlistsPublic;
  if (likedSongsPublic !== undefined) users[userIndex].likedSongsPublic = likedSongsPublic;
  if (playlists !== undefined) users[userIndex].playlists = playlists;
  if (likedTracks !== undefined) users[userIndex].likedTracks = likedTracks;

  await writeUsers(users);

  res.json({
    success: true,
    user: {
      username: users[userIndex].username,
      avatar: users[userIndex].avatar,
      bio: users[userIndex].bio || "",
      tier: getEffectiveUserTier(users[userIndex].username, users[userIndex].tier),
      playlistsPublic: users[userIndex].playlistsPublic !== false,
      likedSongsPublic: users[userIndex].likedSongsPublic !== false,
      playlists: users[userIndex].playlists || [],
      likedTracks: users[userIndex].likedTracks || []
    }
  });
});

// Accounts Search Endpoint
app.get("/api/users/search", async (req, res) => {
  const query = String(req.query.q || "").toLowerCase().trim();
  if (!query) {
    return res.json({ success: true, users: [] });
  }

  const users = await readUsers();
  const matches = users
    .filter((u) => u.username.toLowerCase().includes(query))
    .map((u) => ({
      username: u.username,
      avatar: u.avatar,
      tier: getEffectiveUserTier(u.username, u.tier),
      bio: u.bio || ""
    }));

  res.json({ success: true, users: matches });
});

// Public Profile Retrieval Endpoint
app.get("/api/users/profile/:username", async (req, res) => {
  const targetUsername = String(req.params.username).trim();
  const users = await readUsers();
  const user = users.find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
  
  if (!user) {
    return res.status(404).json({ success: false, error: "User profile not found." });
  }

  res.json({
    success: true,
    profile: {
      username: user.username,
      avatar: user.avatar,
      bio: user.bio || "",
      tier: getEffectiveUserTier(user.username, user.tier),
      playlistsPublic: user.playlistsPublic !== false,
      likedSongsPublic: user.likedSongsPublic !== false,
      playlists: user.playlistsPublic !== false ? (user.playlists || []) : [],
      likedTracks: user.likedSongsPublic !== false ? (user.likedTracks || []) : []
    }
  });
});

// Admin Console Endpoints
const adminSessions: { token: string; createdAt: number }[] = [];

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  // Default admin console password is set to "admin123"
  if (password === "admin123") {
    const token = crypto.randomBytes(24).toString("hex");
    adminSessions.push({ token, createdAt: Date.now() });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: "Invalid admin console password." });
});

function validateAdminToken(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "Authorization required." });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const session = adminSessions.find((s) => s.token === token);
  if (!session) {
    return res.status(401).json({ success: false, error: "Invalid or expired admin session." });
  }
  next();
}

app.get("/api/admin/stats", validateAdminToken, async (req, res) => {
  const users = await readUsers();
  const total = users.length;
  const standard = users.filter((u) => getEffectiveUserTier(u.username, u.tier) === "Standard").length;
  const aeroPlus = users.filter((u) => getEffectiveUserTier(u.username, u.tier) === "Aero+").length;
  const vip = users.filter((u) => getEffectiveUserTier(u.username, u.tier) === "VIP").length;

  res.json({
    success: true,
    stats: {
      total,
      standard,
      aeroPlus,
      vip
    }
  });
});

app.get("/api/admin/users", validateAdminToken, async (req, res) => {
  const users = await readUsers();
  const list = users.map((u) => ({
    username: u.username,
    avatar: u.avatar,
    bio: u.bio || "",
    tier: getEffectiveUserTier(u.username, u.tier),
    playlistsCount: (u.playlists || []).length,
    likedCount: (u.likedTracks || []).length
  }));
  res.json({ success: true, users: list });
});

app.post("/api/admin/update-tier", validateAdminToken, async (req, res) => {
  const { username, tier } = req.body;
  if (!username || !tier) {
    return res.status(400).json({ success: false, error: "Username and tier are required." });
  }

  const allowedTiers = ["Standard", "Aero+", "VIP"];
  if (!allowedTiers.includes(tier)) {
    return res.status(400).json({ success: false, error: "Invalid tier designation." });
  }

  const users = await readUsers();
  const userIndex = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ success: false, error: "User not found." });
  }

  users[userIndex].tier = tier;
  await writeUsers(users);

  res.json({ success: true, message: `Successfully updated ${username} to ${tier}.` });
});

// Support Complaint Box Endpoints
app.post("/api/support/ticket", async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return res.status(400).json({ success: false, error: "Title and description are required." });
  }

  let username = "Guest";
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    const sessions = readSessions();
    const session = sessions.find((s) => s.token === token);
    if (session) {
      username = session.username;
    }
  }

  const tickets = await readTickets();
  const newTicket = {
    id: "ticket-" + crypto.randomBytes(8).toString("hex"),
    username,
    title: String(title).trim(),
    description: String(description).trim(),
    createdAt: Date.now(),
    status: "Open"
  };

  tickets.push(newTicket);
  await writeTickets(tickets);

  res.json({ success: true, message: "Complaint submitted successfully." });
});

app.get("/api/admin/tickets", validateAdminToken, async (req, res) => {
  const tickets = await readTickets();
  res.json({ success: true, tickets });
});

app.post("/api/admin/tickets/resolve", validateAdminToken, async (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) {
    return res.status(400).json({ success: false, error: "Ticket ID is required." });
  }

  const tickets = await readTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: "Ticket not found." });
  }

  tickets.splice(index, 1);
  await writeTickets(tickets);

  res.json({ success: true, message: "Ticket resolved successfully." });
});


// 5b. Get Artist Profile (Dynamic iTunes catalog resolver)
app.post("/api/artist/profile", async (req, res) => {
  const { artistName } = req.body;
  if (!artistName || typeof artistName !== "string" || artistName.trim() === "") {
    return res.status(400).json({ error: "Artist name is required" });
  }

  const cleanArtist = artistName.trim();
  console.log(`Resolving Artist Profile for: "${cleanArtist}"`);

  try {
    const tracksUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtist)}&entity=song&limit=15`;
    const tracksRes = await fetch(tracksUrl);
    const tracksData = await tracksRes.json() as any;

    let popularTracks: any[] = [];
    let artistImageUrl = "";

    if (tracksData.results && tracksData.results.length > 0) {
      popularTracks = tracksData.results.map((item: any) => ({
        id: `itunes-${item.trackId}`,
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName || "Single",
        thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
        duration: formatDuration(item.trackTimeMillis),
        genre: item.primaryGenreName || "Music"
      }));

      if (tracksData.results[0].artworkUrl100) {
        artistImageUrl = tracksData.results[0].artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg");
      }
    }

    if (!artistImageUrl) {
      artistImageUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop";
    }

    const albumsUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtist)}&entity=album&limit=15`;
    const albumsRes = await fetch(albumsUrl);
    const albumsData = await albumsRes.json() as any;

    let albums: any[] = [];
    if (albumsData.results && albumsData.results.length > 0) {
      albums = albumsData.results.map((item: any) => ({
        title: item.collectionName,
        artist: item.artistName,
        thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
        releaseDate: item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : "Unknown Year",
        genre: item.primaryGenreName || "Music"
      }));
    }

    return res.json({
      success: true,
      artistName: cleanArtist,
      artistImageUrl,
      popularTracks,
      albums
    });
  } catch (err) {
    console.error("Failed to fetch artist profile:", err);
    return res.status(500).json({ error: "Failed to resolve artist profile" });
  }
});

// 5c. Get Album Tracks (Dynamic iTunes album tracks resolver)
app.post("/api/album/tracks", async (req, res) => {
  const { albumName, artistName } = req.body;
  if (!albumName || !artistName) {
    return res.status(400).json({ error: "Album name and Artist name are required" });
  }

  const cleanAlbum = albumName.trim();
  const cleanArtist = artistName.trim();
  console.log(`Resolving Album Tracks for: "${cleanArtist} - ${cleanAlbum}"`);

  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtist + " " + cleanAlbum)}&entity=song&limit=30`;
    const response = await fetch(searchUrl);
    const data = await response.json() as any;

    let tracks: any[] = [];
    let thumbnail = "";

    if (data.results && data.results.length > 0) {
      const albumTracks = data.results.filter((item: any) => 
        item.collectionName && item.collectionName.toLowerCase().includes(cleanAlbum.toLowerCase())
      );
      
      const targetTracks = albumTracks.length > 0 ? albumTracks : data.results;

      tracks = targetTracks.map((item: any) => ({
        id: `itunes-${item.trackId}`,
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName || cleanAlbum,
        thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
        duration: formatDuration(item.trackTimeMillis),
        genre: item.primaryGenreName || "Music"
      }));

      if (targetTracks[0].artworkUrl100) {
        thumbnail = targetTracks[0].artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg");
      }
    }

    if (!thumbnail) {
      thumbnail = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop";
    }

    return res.json({
      success: true,
      albumName: cleanAlbum,
      artistName: cleanArtist,
      thumbnail,
      tracks
    });
  } catch (err) {
    console.error("Failed to fetch album tracks:", err);
    return res.status(500).json({ error: "Failed to resolve album tracks" });
  }
});


interface RoomMember {
  id: string;
  username: string;
  avatar: string;
  ws: WebSocket;
  isHost: boolean;
}

interface ChatMsg {
  id: string;
  username: string;
  avatar: string;
  text: string;
  timestamp: string;
}

interface RoomState {
  roomId: string;
  currentTrack: any | null;
  isPlaying: boolean;
  progressSeconds: number;
  lastUpdated: number; // timestamp
  members: RoomMember[];
  chatHistory: ChatMsg[];
  hostUsername?: string | null;
}

const rooms = new Map<string, RoomState>();

// Broadcast helper
function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const member of room.members) {
    if (excludeWs && member.ws === excludeWs) continue;
    try {
      if (member.ws.readyState === 1) { // WebSocket.OPEN
        member.ws.send(payload);
      }
    } catch (e) {
      console.error(`Error broadcasting to ${member.username}:`, e);
    }
  }
}

// Clean up user sessions
function removeUserFromAllRooms(ws: WebSocket) {
  for (const [roomId, room] of rooms.entries()) {
    const idx = room.members.findIndex((m) => m.ws === ws);
    if (idx !== -1) {
      const removedUser = room.members[idx];
      room.members.splice(idx, 1);
      console.log(`WebSocket: User ${removedUser.username} left room ${roomId}`);

      if (room.members.length === 0) {
        rooms.delete(roomId);
        console.log(`WebSocket: Room ${roomId} is now empty and deleted.`);
      } else {
        // Broadcast membership list update
        broadcastToRoom(roomId, {
          type: "user_left",
          username: removedUser.username,
          members: room.members.map((m) => ({ id: m.id, username: m.username, avatar: m.avatar })),
        });

        // Add System message
        const systemMsg: ChatMsg = {
          id: `sys-${Date.now()}`,
          username: "System",
          avatar: "🤖",
          text: `${removedUser.username} left the room.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        room.chatHistory.push(systemMsg);
        broadcastToRoom(roomId, {
          type: "chat_message",
          message: systemMsg,
        });
      }
    }
  }
}

// ----------------------------------------------------
// DEV/PRODUCTION VITE MIDDLEWARE & HTTP SERVER SETUP
// ----------------------------------------------------
async function startServer() {
  const server = createHttpServer(app);

  // Initialize WebSocket Server on top of the same HTTP server
  const wss = new WebSocketServer({ server });

  // Ping/pong keepalive - check every 30 seconds
  const keepAliveInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 30000);

  wss.on("connection", (ws: WebSocket) => {
    const userId = Math.random().toString(36).substring(2, 9);
    let currentRoomId: string | null = null;
    let clientUsername = "Anonymous";

    // Set a timeout for connections that don't respond to ping
    let aliveTimeout: ReturnType<typeof setTimeout> | null = null;
    ws.on("pong", () => {
      if (aliveTimeout) clearTimeout(aliveTimeout);
      aliveTimeout = setTimeout(() => {
        ws.terminate();
      }, 10000);
    });

    ws.on("message", (rawMessage) => {
      try {
        const data = JSON.parse(rawMessage.toString());
        switch (data.type) {
          case "join": {
            const { roomId, username, avatar, token } = data;
            currentRoomId = roomId;
            clientUsername = username || `User ${userId}`;
            const cleanAvatar = avatar || "🎵";

            let room = rooms.get(roomId);
            let verifiedUsername: string | null = null;
            if (token) {
              const sessions = readSessions();
              const session = sessions.find((s) => s.token === token);
              if (session) {
                verifiedUsername = session.username;
                clientUsername = session.username;
              }
            }

            if (!room) {
              room = {
                roomId,
                currentTrack: null,
                isPlaying: false,
                progressSeconds: 0,
                lastUpdated: Date.now(),
                members: [],
                chatHistory: [],
                hostUsername: verifiedUsername,
              };
              rooms.set(roomId, room);
            }

            // Guard duplicates
            if (!room.members.some((m) => m.ws === ws)) {
              // First member to join is the host
              const isHost = room.members.length === 0;
              room.members.push({
                id: userId,
                username: clientUsername,
                avatar: cleanAvatar,
                ws,
                isHost,
              });
            }

            console.log(`WebSocket: ${clientUsername} joined room ${roomId}`);

            // Send back current room state
            ws.send(
              JSON.stringify({
                type: "room_state",
                roomId,
                currentTrack: room.currentTrack,
                isPlaying: room.isPlaying,
                progressSeconds: room.progressSeconds,
                lastUpdated: room.lastUpdated,
                chatHistory: room.chatHistory,
                members: room.members.map((m) => ({ id: m.id, username: m.username, avatar: m.avatar })),
                yourId: userId,
                hostUsername: room.hostUsername,
              })
            );

            // Broadcast joined message
            broadcastToRoom(
              roomId,
              {
                type: "user_joined",
                username: clientUsername,
                avatar: cleanAvatar,
                members: room.members.map((m) => ({ id: m.id, username: m.username, avatar: m.avatar })),
              },
              ws
            );

            // Add system join message to history
            const systemMsg: ChatMsg = {
              id: `sys-${Date.now()}`,
              username: "System",
              avatar: "🤖",
              text: `${clientUsername} joined the room! Enjoy the music together.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            room.chatHistory.push(systemMsg);
            broadcastToRoom(roomId, {
              type: "chat_message",
              message: systemMsg,
            });
            break;
          }

          case "playback_change": {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const { track, isPlaying, progressSeconds, token } = data;

            // Authentication & Authorization check
            if (room.hostUsername) {
              const sessions = readSessions();
              const session = sessions.find((s) => s.token === token);
              if (!session || session.username !== room.hostUsername) {
                console.warn(`Unauthorized playback change attempt by token ${token} in room ${currentRoomId} (expected host: ${room.hostUsername})`);
                return; // Ignore unauthorized sync events
              }
            } else {
              // Backward compatibility: check if this user is the first member (host)
              const firstMember = room.members[0];
              if (firstMember && firstMember.ws !== ws) {
                console.warn(`Unauthorized playback change attempt by non-host user in room ${currentRoomId}`);
                return;
              }
            }
            
            // Check if track is actually changing to add a pleasant log
            const isTrackChange = track && (!room.currentTrack || room.currentTrack.id !== track.id);
            
            room.currentTrack = track;
            room.isPlaying = isPlaying;
            room.progressSeconds = progressSeconds || 0;
            room.lastUpdated = Date.now();

            // Broadcast sync event to all other members in the room
            broadcastToRoom(
              currentRoomId,
              {
                type: "playback_sync",
                track,
                isPlaying,
                progressSeconds: room.progressSeconds,
                lastUpdated: room.lastUpdated,
                sender: clientUsername,
              },
              ws
            );

            if (isTrackChange) {
              const trackMsg: ChatMsg = {
                id: `sys-track-${Date.now()}`,
                username: "System",
                avatar: "📻",
                text: `${clientUsername} put on "${track.title}" by ${track.artist}.`,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              };
              room.chatHistory.push(trackMsg);
              broadcastToRoom(currentRoomId, {
                type: "chat_message",
                message: trackMsg,
              });
            }
            break;
          }

          case "chat": {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const { text, avatar } = data;
            const chatMsg: ChatMsg = {
              id: `msg-${Date.now()}-${userId}`,
              username: clientUsername,
              avatar: avatar || "🎵",
              text,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };

            room.chatHistory.push(chatMsg);
            if (room.chatHistory.length > 60) {
              room.chatHistory.shift();
            }

            broadcastToRoom(currentRoomId, {
              type: "chat_message",
              message: chatMsg,
            });
            break;
          }

          case "request_sync": {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            ws.send(
              JSON.stringify({
                type: "playback_sync",
                track: room.currentTrack,
                isPlaying: room.isPlaying,
                progressSeconds: room.progressSeconds,
                lastUpdated: room.lastUpdated,
                sender: "System",
              })
            );
            break;
          }
        }
      } catch (err) {
        console.error("Error processing WebSocket message:", err);
      }
    });

    ws.on("close", () => {
      removeUserFromAllRooms(ws);
    });

    ws.on("error", () => {
      removeUserFromAllRooms(ws);
    });
  });

  app.get("/admin.html", (req, res) => {
    const adminPath = (process.env.NODE_ENV !== "production")
      ? path.join(process.cwd(), "public", "admin.html")
      : ((currentDirname.endsWith("dist-server") || currentDirname.endsWith("dist-server\\") || currentDirname.endsWith("dist-server/"))
          ? path.join(currentDirname, "..", "dist", "admin.html")
          : path.join(process.cwd(), "dist", "admin.html"));
    try {
      const content = fs.readFileSync(adminPath, "utf8");
      res.setHeader("Content-Type", "text/html");
      res.send(content);
    } catch (err) {
      console.error("Failed to read admin.html:", err);
      res.status(500).send("Admin page failed to load.");
    }
  });

  app.get("/admin", (req, res) => {
    res.redirect("/admin.html");
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = (currentDirname.endsWith("dist-server") || currentDirname.endsWith("dist-server\\") || currentDirname.endsWith("dist-server/"))
      ? path.join(currentDirname, "..", "dist")
      : path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Premium Music Streamer Server with WebSockets running at http://localhost:${PORT}`);
    // Trigger automatic database cloud sync/migration on startup
    readUsers().catch((err) => console.error("Auto-migration on startup failed:", err));
    try {
      const os = require("os");

      const interfaces = os.networkInterfaces();
      for (const name in interfaces) {
        for (const net of interfaces[name] || []) {
          if (net.family === "IPv4" && !net.internal) {
            console.log(`  Access from LAN/Mobile using: http://${net.address}:${PORT}`);
          }
        }
      }
    } catch (e) {
      console.warn("Could not retrieve network interfaces:", e);
    }
  });
}

startServer();
