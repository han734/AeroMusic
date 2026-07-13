import { DEFAULT_API_ENDPOINT } from "./default_endpoint";

// Client API Helper with dynamic server endpoint support for standalone APK/EXE builds.

// Returns the saved API base URL or defaults to the current origin
export function getApiBaseUrl(): string {
  const isElectron = typeof window !== "undefined" && (
    window.navigator.userAgent.toLowerCase().includes("electron") ||
    !!(window as any).electronAPI
  );
  if (isElectron) {
    return "";
  }

  // Detect mobile Webview / Capacitor environment
  const isMobileWebView = typeof window !== "undefined" && !isElectron && (
    !!(window as any).Capacitor ||
    window.location.hostname === "aero-music.app" ||
    window.location.protocol === "file:" ||
    /Android|iPhone|iPad|iPod|webOS/i.test(window.navigator.userAgent)
  );

  try {
    const saved = localStorage.getItem("aero-api-endpoint");
    if (saved) {
      // If we are currently testing on localhost but have a stale LAN IP saved in localStorage, bypass it
      const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const isSavedLanIp = saved.includes("192.168.") || saved.includes("10.") || saved.includes("172.");
      if (isLocalhost && isSavedLanIp) {
        return "http://localhost:3000";
      }
      return saved;
    }
  } catch (e) {
    // Ignore localStorage failures in some restrictive webviews
  }

  // Standalone mobile APK fallback to auto-detected build machine IP
  if (isMobileWebView && DEFAULT_API_ENDPOINT) {
    return DEFAULT_API_ENDPOINT;
  }
  
  // If running in development browser (Vite port 5173), automatically fallback to local backend server port
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:3000";
  }

  // Default to empty string (relative paths) for standard web preview
  return "";
}

export const DEFAULT_COVER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="url(%23grad)"/><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231e1b4b"/><stop offset="100%" stop-color="%230f172a"/></linearGradient></defs><circle cx="150" cy="150" r="60" fill="%232e1065" opacity="0.4"/><path d="M130 110 v80 c0 11-9 20-20 20 s-20-9-20-20 s9-20 20-20 c5 0 9 2 12 5 V130 l40-10 v50 c0 11-9 20-20 20 s-20-9-20-20 s9-20 20-20 c5 0 9 2 12 5 V110 Z" fill="%23a78bfa"/></svg>`;

export function getPlaceholderUrl(url: string): string {
  if (!url || url.includes("unsplash.com")) {
    return DEFAULT_COVER_SVG;
  }
  return url;
}

export function saveApiBaseUrl(url: string): void {
  try {
    // Ensure no trailing slash
    const cleanUrl = url.trim().replace(/\/$/, "");
    if (cleanUrl) {
      localStorage.setItem("aero-api-endpoint", cleanUrl);
    } else {
      localStorage.removeItem("aero-api-endpoint");
    }
  } catch (e) {
    console.warn("Failed to save API endpoint:", e);
  }
}

// Wrapper for fetch that automatically prepends the current active server base URL
export async function aeroFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
  
  return fetch(fullUrl, options);
}

// Returns the WebSocket URL corresponding to the active server endpoint
export function getWebSocketUrl(): string {
  const baseUrl = getApiBaseUrl();
  
  if (baseUrl) {
    // Convert http:// or https:// to ws:// or wss://
    if (baseUrl.startsWith("http://")) {
      return baseUrl.replace(/^http:\/\//, "ws://");
    }
    if (baseUrl.startsWith("https://")) {
      return baseUrl.replace(/^https:\/\//, "wss://");
    }
    // If it doesn't have a protocol but is an IP/domain
    return `ws://${baseUrl}`;
  }
  
  // Check if running in Electron
  const isElectron = typeof window !== "undefined" && (
    window.navigator.userAgent.toLowerCase().includes("electron") ||
    !!(window as any).electronAPI
  );
  
  if (isElectron) {
    // In Electron, the server is typically on localhost:3000
    return "ws://localhost:3000";
  }
  
  // Default to current location
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host || "localhost:3000";
  return `${protocol}//${host}`;
}