import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const OFFLINE_DIR = 'offline_audio';

const MediaNotification = registerPlugin<any>("MediaNotification");

/**
 * Initializes the offline storage directory on the device.
 */
export async function initOfflineStorage() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.mkdir({
      path: OFFLINE_DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (e) {
    // Directory might already exist
  }
}

/**
 * Returns the available storage space on the device in bytes.
 */
export async function getAvailableStorageBytes(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return Number.MAX_SAFE_INTEGER;
  try {
    const result = await MediaNotification.getAvailableStorage();
    return result.availableBytes;
  } catch (e) {
    console.warn("[OfflineStorage] Failed to get available storage:", e);
    return Number.MAX_SAFE_INTEGER; // Fallback to avoid blocking if check fails
  }
}

/**
 * Saves a track to the device's local storage.
 * @param trackId The YouTube video ID or unique track identifier.
 * @param serverUrl The URL on the server to fetch the audio bytes from.
 */
export async function saveTrackOffline(trackId: string, serverUrl: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const response = await fetch(serverUrl);
    const blob = await response.blob();

    // Check if we have enough space (estimated from blob size + 20% overhead)
    const available = await getAvailableStorageBytes();
    if (blob.size * 1.2 > available) {
      throw new Error("STORAGE_FULL");
    }

    // Convert blob to base64 for Capacitor Filesystem
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result) {
          const base64String = result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error("Read failed"));
        }
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

    const fileName = `${trackId}.mp3`;
    const result = await Filesystem.writeFile({
      path: `${OFFLINE_DIR}/${fileName}`,
      data: base64Data,
      directory: Directory.Data,
    });

    console.log(`[OfflineStorage] Saved ${fileName} to device.`);
    return result.uri;
  } catch (err) {
    console.error(`[OfflineStorage] Failed to save track ${trackId}:`, err);
    return null;
  }
}

/**
 * Checks if a track exists in the device's local storage and returns its web-compatible URI.
 */
export async function getLocalTrackUri(trackId: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const fileName = `${trackId}.mp3`;
  const path = `${OFFLINE_DIR}/${fileName}`;

  try {
    const stat = await Filesystem.stat({
      path,
      directory: Directory.Data,
    });

    if (stat) {
      return Capacitor.convertFileSrc(stat.uri);
    }
  } catch (e) {
    // File doesn't exist
  }
  return null;
}

/**
 * Deletes a track from the device's local storage.
 */
export async function deleteLocalTrack(trackId: string) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await Filesystem.deleteFile({
      path: `${OFFLINE_DIR}/${trackId}.mp3`,
      directory: Directory.Data,
    });
  } catch (e) {
    // File might not exist
  }
}
