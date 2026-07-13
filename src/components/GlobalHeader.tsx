import { useState, useEffect } from "react";
import { Home, Search, Bell, Users, ExternalLink, Lock, Unlock, ChevronLeft, ChevronRight, X } from "lucide-react";

interface GlobalHeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: any | null;
  onLogout: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  privateSession: boolean;
  setPrivateSession: (val: boolean) => void;
  onUserProfileClick?: (username: string) => void;
  onSupportClick?: () => void;
}

export default function GlobalHeader({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  searchQuery,
  setSearchQuery,
  privateSession,
  setPrivateSession,
  onUserProfileClick,
  onSupportClick,
}: GlobalHeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="h-16 bg-transparent px-6 flex items-center justify-between shrink-0 relative z-50">
      
      {/* Left: Navigation and Home */}
      <div className="flex items-center gap-2">
        {/* Navigation Arrows */}
        <div className="hidden sm:flex items-center gap-1.5 mr-2">
          <button
            onClick={() => setActiveTab("home")}
            className="w-8 h-8 rounded-full bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-zinc-850/40"
            title="Go Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="w-8 h-8 rounded-full bg-zinc-900/60 text-zinc-600 flex items-center justify-center cursor-not-allowed border border-zinc-850/40 opacity-55"
            disabled
            title="Go Forward"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Home Button */}
        <button
          onClick={() => setActiveTab("home")}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
            activeTab === "home"
              ? "bg-white text-black font-extrabold"
              : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-850/40"
          }`}
          title="Home"
        >
          <Home size={15} fill={activeTab === "home" ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Center: Search Bar */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative flex items-center">
          <span className="absolute left-3.5 text-zinc-400 pointer-events-none">
            <Search size={15} />
          </span>
          <input
            type="text"
            placeholder="What do you want to play?"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (activeTab !== "search") {
                setActiveTab("search");
              }
            }}
            className="w-full h-9 bg-zinc-900 hover:bg-zinc-850 focus:bg-zinc-900 border border-zinc-800 focus:border-zinc-700/80 rounded-full pl-10 pr-10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 text-zinc-500 hover:text-zinc-300 p-0.5 rounded-full hover:bg-zinc-800 transition cursor-pointer flex items-center justify-center"
              title="Clear Search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Right: Notifications, Members/Listening Room, Profile Avatar */}
      <div className="flex items-center gap-3">
        {/* Friends/Listening Room Activity Button */}
        <button
          onClick={() => setActiveTab("listening-room")}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer relative ${
            activeTab === "listening-room"
              ? "bg-violet-600 text-white"
              : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-350 hover:text-white border border-zinc-850/40"
          }`}
          title="Listening Room"
        >
          <Users size={14} />
        </button>

        {/* Notifications Bell */}
        <button
          onClick={() => alert("You have no new updates or notifications.")}
          className="w-8 h-8 rounded-full bg-zinc-900/60 hover:bg-zinc-800 text-zinc-350 hover:text-white flex items-center justify-center transition cursor-pointer border border-zinc-850/40"
          title="What's New"
        >
          <Bell size={14} />
        </button>

        {/* User Profile Widget */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className={`flex items-center gap-2 bg-zinc-900/60 hover:bg-zinc-800 border ${
              privateSession ? "border-blue-500/50 hover:border-blue-400" : "border-zinc-850 hover:border-zinc-750"
            } p-1 rounded-full text-xs font-semibold cursor-pointer transition select-none hover:scale-105 active:scale-95`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-750 bg-zinc-800 shrink-0 flex items-center justify-center text-sm relative">
              {currentUser?.avatar.startsWith("data:image") ? (
                <img
                  src={currentUser.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                currentUser?.avatar || "🎧"
              )}
              {privateSession && (
                <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center text-white text-[10px]">
                  <Lock size={9} />
                </div>
              )}
            </div>
            {privateSession && (
              <span className="text-[9px] text-blue-400 font-mono font-bold tracking-tight px-1 uppercase">
                Private
              </span>
            )}
            <span className="text-[10px] text-zinc-500 font-bold tracking-tight pr-1">▼</span>
          </button>

          {showProfileMenu && (
            <>
              {/* Overlay blocker */}
              <div
                className="fixed inset-0 z-40 bg-transparent cursor-default"
                onClick={() => setShowProfileMenu(false)}
              />

              {/* Floating Dropdown Container */}
              <div className="absolute right-0 mt-2.5 w-56 bg-[#181818] border border-zinc-800/80 rounded-xl py-1 shadow-2xl z-50 flex flex-col text-[13px] font-sans text-zinc-200 select-none animate-in fade-in slide-in-from-top-1 duration-150">
                
                {/* Account */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (currentUser && onUserProfileClick) {
                      onUserProfileClick(currentUser.username);
                      setActiveTab("user-profile");
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Account</span>
                </button>

                {/* Profile */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (currentUser && onUserProfileClick) {
                      onUserProfileClick(currentUser.username);
                      setActiveTab("user-profile");
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Profile</span>
                </button>

                {/* Support */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (onSupportClick) {
                      onSupportClick();
                    } else {
                      window.open("https://support.spotify.com", "_blank");
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Support</span>
                  <ExternalLink size={14} className="text-zinc-400" />
                </button>

                {/* Private session */}
                <button
                  onClick={() => {
                    const nextVal = !privateSession;
                    setPrivateSession(nextVal);
                    localStorage.setItem("aero-private-session", String(nextVal));
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>Private session</span>
                    {privateSession && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    )}
                  </div>
                  {privateSession ? (
                    <Lock size={12} className="text-blue-400" />
                  ) : (
                    <Unlock size={12} className="text-zinc-500" />
                  )}
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActiveTab("settings");
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Settings</span>
                </button>

                {/* Log out */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Log out</span>
                </button>

                {/* Divider */}
                <div className="h-px bg-zinc-700/40 my-1 w-full" />

                {/* Your Updates Section */}
                <div className="px-4 py-2">
                  <div className="font-bold text-white text-[13px]">Your Updates</div>
                  <div className="text-[11px] text-zinc-400 mt-1">You have no notifications</div>
                </div>

              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
