import React, { useState, useEffect } from "react";
import { User, Camera, Shield, Music, Play, Heart, Globe, Lock, Save, Edit3, Loader2, Sparkles, Check, ChevronRight } from "lucide-react";
import { Track, Playlist, UserProfile } from "../types";
import { aeroFetch, getPlaceholderUrl } from "../lib/api";

const getNormalizedTierName = (tier: string | undefined): string => {
  if (!tier || tier === "Free") return "Standard";
  if (tier === "Premium") return "Aero+";
  return tier;
};

interface UserProfileViewProps {
  username: string; // The username of the profile to view
  currentUser: UserProfile | null; // Logged in user
  onLoginSuccess: (user: UserProfile) => void;
  onTrackSelect: (track: Track, context: Track[]) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  setActiveTab: (tab: string) => void;
}

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
        const size = 128;
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

export default function UserProfileView({
  username,
  currentUser,
  onLoginSuccess,
  onTrackSelect,
  onSelectPlaylist,
  setActiveTab,
}: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"playlists" | "favorites">("playlists");
  const [isSaving, setIsSaving] = useState(false);

  const isOwnProfile = currentUser && currentUser.username.toLowerCase() === username.toLowerCase();

  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await aeroFetch(`/api/users/profile/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.profile);
        setBioText(data.profile.bio || "");
      } else {
        setError(data.error || "Failed to load user profile.");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to connect to profile service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const updateProfileOnServer = async (fields: Partial<UserProfile>) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("aero-session-token");
      const res = await aeroFetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(fields)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess(data.user);
        // Refresh local view
        setProfile(prev => prev ? { ...prev, ...fields } : null);
      } else {
        alert(data.error || "Failed to update profile settings.");
      }
    } catch (e) {
      console.error(e);
      alert("Network error: Could not sync profile updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatar(file);
      await updateProfileOnServer({ avatar: compressed });
    } catch (err) {
      console.error(err);
      alert("Failed to compress profile photo.");
    }
  };

  const handleSaveBio = async () => {
    await updateProfileOnServer({ bio: bioText.trim() });
    setIsEditingBio(false);
  };

  const handleTogglePlaylistsPublic = async () => {
    if (!profile) return;
    const nextVal = !profile.playlistsPublic;
    await updateProfileOnServer({ playlistsPublic: nextVal });
  };

  const handleToggleFavoritesPublic = async () => {
    if (!profile) return;
    const nextVal = !profile.likedSongsPublic;
    await updateProfileOnServer({ likedSongsPublic: nextVal });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-400 bg-[#121212] select-none">
        <Loader2 className="animate-spin text-violet-400 mb-3" size={32} />
        <p className="text-sm font-semibold">Loading profile information...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-450 bg-[#121212] select-none">
        <h3 className="text-xl font-bold text-white mb-2">Profile Unavailable</h3>
        <p className="text-sm max-w-sm mb-6">{error || "User profile details could not be resolved."}</p>
        <button
          onClick={() => setActiveTab("home")}
          className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-white rounded-full transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div id="user-profile-view" className="flex-1 overflow-y-auto bg-[#121212] text-zinc-100 custom-scrollbar font-sans relative pb-28">
      
      {/* Dynamic blurred backdrop background glow */}
      <div className="absolute top-0 left-0 right-0 h-[360px] overflow-hidden pointer-events-none opacity-[0.18] filter blur-[100px] transition-all duration-1000 z-0">
        {profile.avatar.startsWith("data:image") ? (
          <img src={profile.avatar} className="w-full h-full object-cover scale-150" alt="" />
        ) : (
          <div className="w-full h-full bg-violet-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#121212]/50 to-[#121212]" />
      </div>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8 relative z-10">
        
        {/* Banner Card */}
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 pb-6 border-b border-zinc-900">
          
          {/* Avatar Container */}
          <div className="relative group shrink-0 w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-zinc-800/80 shadow-2xl bg-zinc-950">
            {profile.avatar.startsWith("data:image") ? (
              <img src={profile.avatar} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl select-none">
                {profile.avatar}
              </div>
            )}
            
            {isOwnProfile && (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition duration-200 cursor-pointer">
                <Camera size={20} className="text-white" />
                <span className="text-[10px] text-zinc-200 font-bold mt-1">Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* User Details metadata */}
          <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
            <span className="bg-violet-600/10 border border-violet-500/20 text-violet-400 font-extrabold text-[9px] uppercase px-3 py-1 rounded-full font-mono tracking-widest inline-flex items-center gap-1.5 shadow-sm">
              <Sparkles size={10} />
              AeroMusic {getNormalizedTierName(profile.tier)}
            </span>

            <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 justify-center md:justify-start">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white truncate max-w-full leading-none">
                {profile.username}
              </h2>
              
              {/* Member Tier System */}
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border mt-2 md:mt-0 inline-block self-center md:self-auto ${
                profile.tier === "VIP" 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                  : (profile.tier === "Aero+" || profile.tier === "Premium")
                    ? "bg-violet-500/10 text-violet-400 border-violet-500/20" 
                    : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
              }`}>
                {getNormalizedTierName(profile.tier)} Member
              </span>
            </div>

            {/* Editable Bio Section */}
            <div className="max-w-xl">
              {isEditingBio ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <textarea
                    value={bioText}
                    onChange={(e) => setBioText(e.target.value)}
                    maxLength={120}
                    placeholder="Tell us about your taste..."
                    className="flex-1 bg-zinc-900 border border-zinc-850 focus:border-zinc-700 rounded-lg p-2 text-xs text-white focus:outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={handleSaveBio}
                      disabled={isSaving}
                      className="p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition shadow cursor-pointer"
                      title="Save Bio"
                    >
                      <Check size={14} className="stroke-[3]" />
                    </button>
                    <button
                      onClick={() => {
                        setBioText(profile.bio || "");
                        setIsEditingBio(false);
                      }}
                      className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-450 rounded-lg transition border border-zinc-800 cursor-pointer"
                      title="Cancel"
                    >
                      X
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs md:text-sm text-zinc-350 leading-relaxed font-medium group flex items-center justify-center md:justify-start gap-2">
                  <span>{profile.bio || "No bio written yet."}</span>
                  {isOwnProfile && (
                    <button
                      onClick={() => setIsEditingBio(true)}
                      className="p-1 text-zinc-500 hover:text-white transition rounded cursor-pointer shrink-0"
                      title="Edit Bio"
                    >
                      <Edit3 size={11} />
                    </button>
                  )}
                </p>
              )}
            </div>
            
            {/* Account Privacy Settings Panel */}
            {isOwnProfile && (
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2 text-[10px] font-mono text-zinc-400 select-none">
                <button
                  onClick={handleTogglePlaylistsPublic}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                    profile.playlistsPublic 
                      ? "border-violet-500/20 bg-violet-500/5 text-violet-400" 
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-500"
                  }`}
                >
                  {profile.playlistsPublic ? <Globe size={10} /> : <Lock size={10} />}
                  <span>Playlists: {profile.playlistsPublic ? "Public" : "Private"}</span>
                </button>
                <button
                  onClick={handleToggleFavoritesPublic}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                    profile.likedSongsPublic 
                      ? "border-violet-500/20 bg-violet-500/5 text-violet-400" 
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-500"
                  }`}
                >
                  {profile.likedSongsPublic ? <Globe size={10} /> : <Lock size={10} />}
                  <span>Favorites: {profile.likedSongsPublic ? "Public" : "Private"}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab switchboard */}
        <div className="flex border-b border-zinc-900/80 pb-3 gap-2">
          <button
            onClick={() => setActiveSubTab("playlists")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold font-sans tracking-wide transition-all cursor-pointer ${
              activeSubTab === "playlists" 
                ? "bg-violet-600 text-white" 
                : "text-zinc-400 hover:text-white bg-zinc-900/40 hover:bg-zinc-800"
            }`}
          >
            Playlists ({profile.playlists.length})
          </button>
          <button
            onClick={() => setActiveSubTab("favorites")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold font-sans tracking-wide transition-all cursor-pointer ${
              activeSubTab === "favorites" 
                ? "bg-violet-600 text-white" 
                : "text-zinc-400 hover:text-white bg-zinc-900/40 hover:bg-zinc-800"
            }`}
          >
            Favorites ({profile.likedTracks.length})
          </button>
        </div>

        {/* Playlists View Grid */}
        {activeSubTab === "playlists" && (
          <div className="space-y-4">
            {profile.playlists.length === 0 ? (
              <div className="text-center py-20 text-zinc-550 border border-zinc-900/60 rounded-2xl bg-zinc-900/10">
                <Music className="mx-auto mb-3 opacity-30 animate-pulse" size={40} />
                <p className="text-sm font-semibold">No playlists available</p>
                <p className="text-xs text-zinc-650 mt-1">This user hasn't published any playlists yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {profile.playlists.map((playlist) => {
                  const hasTracks = playlist.tracks && playlist.tracks.length > 0;
                  const thumb = playlist.coverUrl || (hasTracks ? playlist.tracks[0].thumbnail : "");
                  
                  return (
                    <div
                      key={playlist.id}
                      onClick={() => {
                        onSelectPlaylist(playlist);
                        setActiveTab("library");
                      }}
                      className="bg-zinc-900/30 hover:bg-zinc-900/80 border border-zinc-900/50 hover:border-zinc-800 p-4 rounded-2xl transition cursor-pointer select-none group relative shadow hover:scale-[1.02] duration-250"
                    >
                      {/* Thumbnail Container */}
                      <div className="aspect-square w-full bg-zinc-800 rounded-xl overflow-hidden mb-3 border border-zinc-850 shadow relative">
                        {thumb ? (
                          <img src={getPlaceholderUrl(thumb)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-700">
                            <Music size={28} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <div className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center text-white shadow-lg transform translate-y-3 group-hover:translate-y-0 transition duration-300">
                            <Play size={16} fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-violet-400 transition">
                          {playlist.name}
                        </h4>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {playlist.tracks?.length || 0} track{playlist.tracks?.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Favorites Tracklist */}
        {activeSubTab === "favorites" && (
          <div className="space-y-4">
            {profile.likedTracks.length === 0 ? (
              <div className="text-center py-20 text-zinc-550 border border-zinc-900/60 rounded-2xl bg-zinc-900/10">
                <Heart className="mx-auto mb-3 opacity-30 animate-pulse" size={40} />
                <p className="text-sm font-semibold">No favorite tracks</p>
                <p className="text-xs text-zinc-650 mt-1">This user hasn't favorited any songs yet.</p>
              </div>
            ) : (
              <div className="bg-zinc-900/20 border border-zinc-900/60 rounded-2xl p-4 overflow-hidden select-none">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-500 text-[10px] uppercase font-mono tracking-wider font-extrabold select-none">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3 hidden md:table-cell">Album</th>
                      <th className="py-2.5 px-3 hidden sm:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.likedTracks.map((track, idx) => {
                      return (
                        <tr
                          key={track.id + "-" + idx}
                          onDoubleClick={() => onTrackSelect(track, profile.likedTracks)}
                          className="hover:bg-white/5 border-b border-zinc-900/35 last:border-0 rounded-lg group transition cursor-pointer select-none"
                        >
                          {/* Index / Play action */}
                          <td className="py-3 px-3 text-center text-zinc-500 font-mono text-xs">
                            <span className="group-hover:hidden">{idx + 1}</span>
                            <button
                              onClick={() => onTrackSelect(track, profile.likedTracks)}
                              className="hidden group-hover:inline-block text-violet-400 focus:outline-none"
                            >
                              <Play size={10} fill="currentColor" />
                            </button>
                          </td>

                          {/* Track info card */}
                          <td className="py-3 px-3 min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-zinc-800 flex items-center justify-center">
                                {track.thumbnail ? (
                                  <img src={track.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Music size={14} className="text-zinc-650" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-zinc-200 truncate group-hover:text-violet-400 transition">
                                  {track.title}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">
                                  {track.artist}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Album */}
                          <td className="py-3 px-3 hidden md:table-cell text-zinc-500 truncate max-w-[150px]">
                            {track.album || "Single"}
                          </td>

                          {/* Duration */}
                          <td className="py-3 px-3 hidden sm:table-cell font-mono text-xs text-zinc-500">
                            {track.duration}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
