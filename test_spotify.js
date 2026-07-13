import dotenv from "dotenv";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";

dotenv.config();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

console.log("Credentials:", { client_id, client_secret });

if (!client_id || !client_secret) {
  console.error("Missing credentials in .env!");
  process.exit(1);
}

try {
  const sdk = SpotifyApi.withClientCredentials(client_id, client_secret);
  const playlistId = "37i9dQZF1DX10zK7Jp4S66";
  console.log("Fetching playlist items...");
  const playlistInfo = await sdk.playlists.getPlaylist(playlistId);
  console.log("Playlist Name:", playlistInfo.name);
  console.log("Total Tracks listed:", playlistInfo.tracks.total);

  let allTracks = [];
  let offset = 0;
  const limit = 50;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching from offset ${offset}...`);
    const page = await sdk.playlists.getPlaylistItems(playlistId, undefined, undefined, limit, offset);
    if (page && page.items && page.items.length > 0) {
      allTracks = allTracks.concat(page.items);
      offset += page.items.length;
      console.log(`Got ${page.items.length} items. Total fetched: ${allTracks.length}`);
      if (page.items.length < limit || offset >= (page.total || 0)) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  console.log("Finished! Total fetched tracks:", allTracks.length);
} catch (err) {
  console.error("Error running test:", err);
}
