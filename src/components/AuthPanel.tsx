import React, { useState, useEffect } from "react";
import { User, Lock, Smile, LogIn, UserPlus, LogOut, CheckCircle, ShieldAlert, Camera, Upload } from "lucide-react";
import { aeroFetch, getApiBaseUrl, saveApiBaseUrl } from "../lib/api";
import { DEFAULT_API_ENDPOINT } from "../lib/default_endpoint";

interface AuthPanelProps {
  currentUser: { username: string; avatar: string } | null;
  onLoginSuccess: (user: { username: string; avatar: string }) => void;
  onLogout: () => void;
  onContinueOffline?: () => void;
}

const AVATAR_EMOJIS = ["🎧", "🎵", "🎸", "🎹", "🎙️", "📻", "⚡", "🔥", "🌈", "🐱", "🦊", "👽"];

function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const size = 128; // perfect size for profile image
        canvas.width = size;
        canvas.height = size;
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function AuthPanel({ currentUser, onLoginSuccess, onLogout, onContinueOffline }: AuthPanelProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_EMOJIS[0]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(getApiBaseUrl());

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUsername("");
    setPassword("");
  }, [isRegistering]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Please fill out all fields.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegistering 
      ? { username: username.trim(), password: password.trim(), avatar: selectedAvatar }
      : { username: username.trim(), password: password.trim() };

    try {
      const response = await aeroFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (isRegistering) {
        setSuccessMsg("Account registered successfully! You can now log in.");
        setIsRegistering(false);
      } else {
        localStorage.setItem("aero-session-token", data.token);
        localStorage.setItem("aero-listening-username", data.user.username);
        localStorage.setItem("aero-listening-avatar", data.user.avatar);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error("Authentication request failed:", err);
      // In standalone APK builds, provide more helpful guidance
      if (typeof window !== "undefined" && (
        !!(window as any).Capacitor ||
        window.location.protocol === "file:" ||
        /Android|iPhone|iPad|iPod|webOS/i.test(window.navigator.userAgent)
      )) {
        setErrorMsg("Cannot connect to server. Go to Settings and configure your server endpoint.");
      } else {
        setErrorMsg("Failed to connect to the server. Make sure the server is running.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = () => {
    localStorage.removeItem("aero-session-token");
    localStorage.removeItem("aero-listening-username");
    localStorage.removeItem("aero-listening-avatar");
    onLogout();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const compressed = await compressAvatar(file);
      setSelectedAvatar(compressed);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to process image file.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const compressed = await compressAvatar(file);
      const token = localStorage.getItem("aero-session-token");
      const res = await aeroFetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ avatar: compressed }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("aero-listening-avatar", data.user.avatar);
        onLoginSuccess(data.user);
        setSuccessMsg("Display picture updated successfully!");
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(data.error || "Failed to update display picture.");
      }
    } catch (err) {
      console.error(err);
      // In standalone APK builds, provide more helpful guidance
      if (typeof window !== "undefined" && (
        !!(window as any).Capacitor ||
        window.location.protocol === "file:" ||
        /Android|iPhone|iPad|iPod|webOS/i.test(window.navigator.userAgent)
      )) {
        setErrorMsg("Cannot connect to server. Go to Settings and configure your server endpoint.");
      } else {
        setErrorMsg("Failed to connect to the server.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEndpoint = () => {
    saveApiBaseUrl(localEndpoint);
    alert(`Server endpoint saved to ${localEndpoint || "Auto-detect"}. Reconnecting...`);
    window.location.reload();
  };

  if (currentUser) {
    return (
      <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/50 shadow-inner flex flex-col items-center text-center gap-3 relative overflow-hidden w-full">
        {/* Profile Avatar and change upload */}
        <div className="relative group cursor-pointer w-16 h-16 shrink-0">
          <div className="text-3xl bg-zinc-950 w-full h-full rounded-xl flex items-center justify-center border border-zinc-800 shadow-md overflow-hidden relative">
            {currentUser.avatar.startsWith("data:image") ? (
              <img src={currentUser.avatar} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              currentUser.avatar
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition duration-200">
              <Camera size={16} className="text-white" />
              <span className="text-[8px] text-zinc-300 font-bold mt-0.5">Change</span>
            </div>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleUpdateAvatar}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="Click to change profile photo"
          />
        </div>

        {/* Text metadata */}
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-lg font-black text-white leading-none">{currentUser.username}</h3>
          
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] tracking-wider font-extrabold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20 uppercase font-mono">
              AeroMusic Member
            </span>
            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[8px] font-mono text-zinc-500">Verified</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleLogoutClick}
          className="w-full bg-zinc-950 hover:bg-rose-950/20 border border-zinc-850 hover:border-rose-500/20 text-zinc-400 hover:text-rose-400 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <LogOut size={11} />
          <span>Log out of Account</span>
        </button>

        {successMsg && (
          <div className="absolute bottom-2 right-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-md text-[9px] flex items-center gap-1 animate-fade-in">
            <CheckCircle size={9} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 shadow-xl backdrop-blur-md max-w-md mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="bg-violet-500/10 text-violet-400 p-2 rounded-lg border border-violet-500/20">
          {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
        </div>
        <div>
          <h3 className="text-sm font-black text-zinc-100">
            {isRegistering ? "Register Account" : "Access Premium Profile"}
          </h3>
          <p className="text-[10px] text-zinc-500 font-medium">
            {isRegistering ? "Create your cross-device synced music account" : "Sign in to activate static rooms & co-listening invites"}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-[11px] flex items-center gap-2 animate-shake">
          <ShieldAlert size={13} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded-lg text-[11px] flex items-center gap-2">
          <CheckCircle size={13} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">Username</label>
          <div className="relative">
            <User size={12} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. BassCatcher"
              maxLength={20}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500/40 rounded-lg pl-8 pr-3 py-2 text-[11px] text-zinc-200 outline-none transition"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">Password</label>
          <div className="relative">
            <Lock size={12} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500/40 rounded-lg pl-8 pr-3 py-2 text-[11px] text-zinc-200 outline-none transition"
            />
          </div>
        </div>

        {isRegistering && (
          <div className="space-y-2.5 animate-fade-in">
            <div className="flex items-center gap-2.5 bg-zinc-950/40 p-2 rounded-lg border border-zinc-850">
              <div className="text-xl bg-zinc-950 w-10 h-10 rounded-lg flex items-center justify-center border border-zinc-800 shadow-inner overflow-hidden shrink-0">
                {selectedAvatar.startsWith("data:image") ? (
                  <img src={selectedAvatar} className="w-full h-full object-cover" alt="Selected DP" />
                ) : (
                  selectedAvatar
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400 block">Avatar</span>
                <span className="text-[9px] text-zinc-500 font-mono">Emoji or custom photo</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">Choose Avatar</label>
              <div className="grid grid-cols-6 gap-1.5 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800/40">
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedAvatar(emoji)}
                    className={`text-base p-1 rounded-md transition cursor-pointer ${
                      selectedAvatar === emoji
                        ? "bg-violet-500/20 border border-violet-500"
                        : "hover:bg-zinc-900 border border-transparent"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1.5 border-t border-zinc-850">
              <label className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-violet-500/40 rounded-lg py-2 px-3 text-[10px] font-bold text-zinc-300 hover:text-white cursor-pointer transition">
                <Camera size={12} className="text-violet-400" />
                <span>Upload Custom Profile Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-violet-500 hover:bg-violet-400 text-black font-extrabold py-2.5 px-4 rounded-xl shadow-lg transition transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer text-xs uppercase tracking-wider"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
          ) : isRegistering ? (
            <>
              <UserPlus size={13} />
              <span>Create Account</span>
            </>
          ) : (
            <>
              <LogIn size={13} />
              <span>Log in to Profile</span>
            </>
          )}
        </button>

        <div className="text-center pt-1.5">
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-[10px] text-zinc-400 hover:text-violet-400 transition underline cursor-pointer"
          >
            {isRegistering ? "Already have an account? Sign in" : "Don't have an account? Register"}
          </button>
        </div>

        {onContinueOffline && (
          <button
            type="button"
            onClick={onContinueOffline}
            className="w-full mt-4 bg-zinc-800/85 hover:bg-zinc-750 text-zinc-300 hover:text-white font-black py-2 rounded-xl text-[9px] uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800 hover:border-zinc-700/30 shadow-md"
          >
            <span>📶</span>
            <span>Continue Offline</span>
          </button>
        )}

        {/* Server Endpoint Settings Drawer */}
        <div className="mt-4 pt-3 border-t border-zinc-800/40">
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-[10px] text-zinc-550 hover:text-zinc-300 font-mono font-bold transition flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
          >
            <span>⚙️</span>
            <span>{showServerConfig ? "Hide Connection Settings" : "Configure Server IP"}</span>
          </button>
          
          {showServerConfig && (
            <div className="mt-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 animate-fade-in space-y-2 text-left">
              <span className="text-[9px] font-mono text-zinc-450 block font-bold">ACTIVE API BASE URL:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpoint(e.target.value)}
                  placeholder="e.g. http://192.168.1.100:3000"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-violet-500/40"
                />
                <button
                  type="button"
                  onClick={handleSaveEndpoint}
                  className="bg-violet-500 hover:bg-violet-400 text-black font-extrabold px-3 py-1 rounded-lg text-[10px] uppercase cursor-pointer"
                >
                  Save
                </button>
              </div>
              <p className="text-[9px] text-zinc-550 leading-normal font-mono">
                Current default fallback: {DEFAULT_API_ENDPOINT || "None"}
              </p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
